"""
SSRF protection for user-supplied URLs.

The threat: this server fetches a URL the customer typed. Without a guard they
can point it at things only the server can reach —

    http://169.254.169.254/latest/meta-data/   cloud metadata → IAM credentials
    http://127.0.0.1:8000/api/v1/...           our own internal API
    http://10.0.0.5/                           anything else in the VPC

— and whatever comes back gets indexed into their knowledge base (and, once a
preview UI exists, rendered straight back to them).

Two properties matter and both are easy to get wrong:

1. Check the resolved IP, not the hostname. `evil.com` can have an A record
   pointing at 127.0.0.1, so a name-based blocklist proves nothing.
2. Re-check after every redirect. A public URL that 302s to 169.254.169.254
   defeats a check done only on the original URL — which is why the fetcher
   follows redirects manually instead of letting httpx do it silently.

Residual risk worth naming: this is check-then-connect, so a DNS entry that
changes between our resolution and the actual connection (DNS rebinding) can
still slip through. Closing that needs pinning the connection to the validated
IP; not done here, and called out rather than left implied.
"""

from __future__ import annotations

import ipaddress
import socket
from typing import List
from urllib.parse import urlparse

from app.orchestra.ai.ingestion.scraper.base import ScrapeError

ALLOWED_SCHEMES = ("http", "https")


def _is_blocked_ip(ip: str) -> bool:
    """True for any address that isn't safely routable on the public internet."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True   # unparseable → refuse rather than guess

    return (
        addr.is_private          # 10/8, 172.16/12, 192.168/16, fc00::/7
        or addr.is_loopback      # 127/8, ::1
        or addr.is_link_local    # 169.254/16 — cloud metadata lives here
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified   # 0.0.0.0
    )


def resolve_host(host: str) -> List[str]:
    """Every IP a hostname resolves to. All of them must pass — a name with one
    public and one private A record must not be treated as safe."""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as e:
        raise ScrapeError(f"Could not resolve host '{host}'.",
                          reason="dns_failed", status_hint=400) from e
    return sorted({info[4][0] for info in infos})


def validate_url(url: str, *, allow_private_hosts: bool = False) -> str:
    """
    Check scheme + host reachability. Returns the normalized URL.

    Call on the original URL AND on every redirect target.
    """
    parsed = urlparse(url)

    if parsed.scheme.lower() not in ALLOWED_SCHEMES:
        raise ScrapeError("Only http and https URLs are supported.",
                          reason="bad_scheme", status_hint=400)
    if not parsed.hostname:
        raise ScrapeError("URL has no host.", reason="no_host", status_hint=400)

    if allow_private_hosts:
        return url

    for ip in resolve_host(parsed.hostname):
        if _is_blocked_ip(ip):
            # Deliberately vague to the caller: confirming which internal
            # addresses exist would itself be useful to someone probing.
            raise ScrapeError(
                "That URL points to a private or internal address, which cannot be fetched.",
                reason="blocked_host", status_hint=400,
            )
    return url
