"""Fail-closed destination and request-header policies for data source calls."""

from __future__ import annotations

import ipaddress
import re
import socket
from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit


DNS_REBINDING_DEPLOYMENT_GUARD = """\
Application validation and the HTTP connection use separate DNS resolutions because
httpx 0.28 does not expose a supported per-request resolver or resolved-IP pinning
hook. Production must enforce an outbound proxy/firewall policy that blocks private,
loopback, link-local, and metadata ranges. A custom AsyncBaseTransport may additionally
pin validated addresses while preserving the original hostname for Host and TLS SNI.
"""


class UnsafeDestinationError(ValueError):
    """Raised when an outbound URL can reach a non-public destination."""


class DestinationResolutionError(ValueError):
    """Raised when a destination cannot be resolved."""


@dataclass(frozen=True, slots=True)
class ValidatedDestination:
    """A normalized URL together with every address observed during validation."""

    url: str
    hostname: str
    port: int
    addresses: tuple[str, ...]


# These headers can alter routing, framing, proxy behavior, or hop-by-hop semantics.
# Credential-bearing headers are included because persisted request templates must
# never bypass encrypted credential storage. The executor validates and adds its own
# authentication header separately after configured headers pass this policy.
FORBIDDEN_REQUEST_HEADERS = frozenset(
    {
        "authorization",
        "connection",
        "content-length",
        "cookie",
        "forwarded",
        "host",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "via",
        "x-api-key",
        "x-forwarded-for",
        "x-forwarded-host",
        "x-forwarded-proto",
    }
)

_HEADER_NAME = re.compile(r"^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$")


def validate_headers(headers: dict[str, str]) -> None:
    """Reject unsafe configured headers, names, and values."""

    for name, value in headers.items():
        _validate_header_syntax(name, value)
        if name.strip().lower() in FORBIDDEN_REQUEST_HEADERS:
            raise UnsafeDestinationError("Forbidden outbound request header")


def validate_auth_header(name: str, value: str) -> None:
    """Validate an executor-owned credential header without exposing its value."""

    _validate_header_syntax(name, value)
    normalized = name.strip().lower()
    # Routing, proxy, framing, and cookie headers are never valid API-key carriers.
    if normalized in FORBIDDEN_REQUEST_HEADERS - {"authorization", "x-api-key"}:
        raise UnsafeDestinationError("Unsafe authentication header")


def _validate_header_syntax(name: str, value: str) -> None:
    if not isinstance(name, str) or not _HEADER_NAME.fullmatch(name):
        raise UnsafeDestinationError("Invalid outbound request header name")
    if not isinstance(value, str) or any(
        (ord(character) < 32 and character != "\t") or ord(character) == 127
        for character in value
    ):
        raise UnsafeDestinationError("Invalid outbound request header value")


def _is_public(address: str) -> bool:
    ip = ipaddress.ip_address(address.split("%", 1)[0])
    # ``is_global`` excludes loopback, private, link-local, multicast, reserved,
    # unspecified, and documentation ranges. A policy should fail closed as the
    # stdlib gains knowledge of newly reserved networks.
    return ip.is_global


def validate_destination(url: str) -> ValidatedDestination:
    """Resolve and validate an HTTP(S) URL immediately before an outbound call.

    All DNS answers must be public. Rejecting a hostname with even one private
    answer prevents mixed-answer records from bypassing the SSRF policy. This check
    happens immediately before httpx sends each initial or redirected request. A
    production network egress policy remains required defense-in-depth against the
    small DNS rebinding interval between application validation and socket connect.
    """

    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as exc:
        raise UnsafeDestinationError("Invalid outbound destination") from exc

    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https"} or not parsed.hostname:
        raise UnsafeDestinationError("Only HTTP and HTTPS destinations are allowed")
    if parsed.username is not None or parsed.password is not None:
        raise UnsafeDestinationError("Destination URLs cannot contain credentials")

    hostname = parsed.hostname.lower().rstrip(".")
    port = port or (443 if scheme == "https" else 80)
    if not 1 <= port <= 65535:
        raise UnsafeDestinationError("Invalid outbound destination port")

    try:
        answers = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, OSError) as exc:
        raise DestinationResolutionError("Destination DNS resolution failed") from exc

    addresses = tuple(sorted({answer[4][0] for answer in answers if answer[4]}))
    if not addresses:
        raise DestinationResolutionError("Destination DNS resolution returned no addresses")
    try:
        safe = all(_is_public(address) for address in addresses)
    except ValueError as exc:
        raise DestinationResolutionError("Destination DNS returned an invalid address") from exc
    if not safe:
        raise UnsafeDestinationError("Destination resolved to a non-public address")

    host_for_url = f"[{hostname}]" if ":" in hostname else hostname
    default_port = 443 if scheme == "https" else 80
    netloc = host_for_url if port == default_port else f"{host_for_url}:{port}"
    normalized = urlunsplit((scheme, netloc, parsed.path or "/", parsed.query, parsed.fragment))
    return ValidatedDestination(normalized, hostname, port, addresses)
