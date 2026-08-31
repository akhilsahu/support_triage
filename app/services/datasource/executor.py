"""Bounded, policy-enforced HTTP execution for data source tools."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Callable, Mapping, Sequence
from typing import Any
from urllib.parse import quote, urljoin, urlsplit

import httpx
import structlog
from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError

from app.core.encryption import decrypt
from app.services.datasource.contracts import (
    ExecutionContext,
    ExecutionFailure,
    ExecutionResult,
    ToolConfig,
)
from app.services.datasource.mapper import ResponseMappingError, map_response
from app.services.datasource.security import (
    DestinationResolutionError,
    UnsafeDestinationError,
    validate_auth_header,
    validate_destination,
    validate_headers,
)
from app.services.datasource.validator import ToolValidationError, validate_tool_config

logger = structlog.get_logger(__name__)

DNS_ERROR = "dns_error"
UNSAFE_DESTINATION = "unsafe_destination"
AUTHENTICATION_FAILED = "authentication_failed"
UPSTREAM_TIMEOUT = "upstream_timeout"
UPSTREAM_ERROR = "upstream_error"
RESPONSE_TOO_LARGE = "response_too_large"
INVALID_RESPONSE = "invalid_response"
INVALID_ARGUMENTS = "invalid_arguments"
INVALID_CONFIGURATION = "invalid_configuration"

_REDIRECT_STATUSES = {301, 302, 303, 307, 308}
_MAX_REDIRECTS = 3


def _failure(code: str, message: str, *, retryable: bool = False, status: int | None = None) -> ExecutionResult:
    return ExecutionResult(
        failure=ExecutionFailure(code=code, message=message, retryable=retryable, status_code=status),
        status_code=status,
    )


def _render(value: Any, arguments: Mapping[str, Any], *, path: bool = False) -> Any:
    if isinstance(value, str):
        rendered = value
        for name, argument in arguments.items():
            replacement = quote(str(argument), safe="") if path else str(argument)
            rendered = rendered.replace("{" + name + "}", replacement)
        return rendered
    if isinstance(value, Mapping):
        return {key: _render(child, arguments) for key, child in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_render(child, arguments) for child in value]
    return value


class DataSourceExecutor:
    """Execute one configured call while keeping secrets out of returned results.

    Destination checks reject unsafe DNS answers, but the stock httpx transport does
    not provide a supported resolved-IP pinning hook. Deployments must enforce the
    egress guard documented in ``security.DNS_REBINDING_DEPLOYMENT_GUARD``. Callers may
    inject a hardened custom transport without changing this execution policy.
    """

    def __init__(
        self,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        decrypt_secret: Callable[[str], str] = decrypt,
        timeout: httpx.Timeout | None = None,
        execution_timeout_seconds: float = 30.0,
    ) -> None:
        self._transport = transport
        self._decrypt_secret = decrypt_secret
        self._timeout = timeout or httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)
        self._execution_timeout_seconds = execution_timeout_seconds

    async def execute(
        self,
        config: ToolConfig,
        arguments: dict[str, Any],
        context: ExecutionContext,
    ) -> ExecutionResult:
        try:
            # The deadline includes validation, DNS, redirects, and reading the
            # complete bounded body rather than resetting for each HTTP attempt.
            async with asyncio.timeout(self._execution_timeout_seconds):
                return await self._execute(config, arguments, context)
        except TimeoutError:
            return _failure(UPSTREAM_TIMEOUT, "Upstream request timed out", retryable=True)

    async def _execute(
        self,
        config: ToolConfig,
        arguments: dict[str, Any],
        context: ExecutionContext,
    ) -> ExecutionResult:
        started = time.monotonic()
        try:
            try:
                validate_tool_config(config)
                Draft202012Validator.check_schema(config.input_schema)
            except (ToolValidationError, SchemaError, TypeError, ValueError):
                return _failure(INVALID_CONFIGURATION, "Data source configuration is invalid")

            if not isinstance(config.auth_type, str):
                return _failure(INVALID_CONFIGURATION, "Data source authentication is invalid")
            auth_type = config.auth_type.lower()
            allowed_auth_types = {"none", "bearer", "api_key", "api-key", "basic", "basic_auth"}
            if config.auth_type != config.auth_type.strip() or auth_type not in allowed_auth_types:
                return _failure(INVALID_CONFIGURATION, "Data source authentication is invalid")
            if auth_type != "none" and not config.encrypted_secret:
                return _failure(INVALID_CONFIGURATION, "Data source authentication is incomplete")

            parsed_path = urlsplit(config.path)
            if parsed_path.scheme or parsed_path.netloc:
                return _failure(INVALID_CONFIGURATION, "Data source path must be relative")

            try:
                validator = Draft202012Validator(config.input_schema)
                if next(validator.iter_errors(arguments), None) is not None:
                    return _failure(INVALID_ARGUMENTS, "Tool arguments do not match the input schema")
            except (TypeError, ValueError):
                return _failure(INVALID_ARGUMENTS, "Tool arguments are invalid")

            # DNS resolution runs in a worker so the outer total deadline can
            # interrupt a stalled resolver as well as redirects and body streaming.
            base_destination = await asyncio.to_thread(validate_destination, config.base_url)
            path = _render(config.path, arguments, path=True)
            url = urljoin(base_destination.url.rstrip("/") + "/", path.lstrip("/"))
            destination = await asyncio.to_thread(validate_destination, url)
            if self._origin(base_destination.url) != self._origin(destination.url):
                return _failure(INVALID_CONFIGURATION, "Data source path changed the configured origin")
            url = destination.url

            template = _render(config.request_template, arguments)
            headers = {str(k): str(_render(v, arguments)) for k, v in config.default_headers.items()}
            headers.update({str(k): str(v) for k, v in template.get("headers", {}).items()})
            validate_headers(headers)
            self._apply_auth(headers, config)

            method = config.method.upper()
            params = template.get("query") or None
            body = template.get("body")
            redirects = 0

            async with httpx.AsyncClient(
                transport=self._transport,
                timeout=self._timeout,
                follow_redirects=False,
                trust_env=False,
            ) as client:
                while True:
                    response, raw = await self._send_bounded(
                        client, method, url, headers, params, body, config.max_response_bytes
                    )
                    if response.status_code not in _REDIRECT_STATUSES:
                        break
                    if redirects >= _MAX_REDIRECTS:
                        return _failure(UPSTREAM_ERROR, "Upstream returned too many redirects")
                    location = response.headers.get("location")
                    if not location:
                        return _failure(UPSTREAM_ERROR, "Upstream redirect omitted its destination")
                    redirected_url = urljoin(str(response.url), location)
                    await asyncio.to_thread(validate_destination, redirected_url)
                    if self._origin(url) != self._origin(redirected_url):
                        # Authentication belongs to the configured origin. Refusing an
                        # origin change prevents a public redirector from exfiltrating it.
                        return _failure(UNSAFE_DESTINATION, "Cross-origin redirects are not permitted")
                    url = redirected_url
                    redirects += 1
                    # 303 explicitly changes the request to GET. Dropping the body avoids
                    # forwarding sensitive POST content to the redirect destination.
                    if response.status_code == 303:
                        method, body = "GET", None
                    params = None

            status = response.status_code
            if status in {401, 403}:
                return _failure(AUTHENTICATION_FAILED, "Upstream authentication failed", status=status)
            if status < 200 or status >= 300:
                return _failure(
                    UPSTREAM_ERROR,
                    "Upstream service returned an error",
                    retryable=status == 429 or status >= 500,
                    status=status,
                )
            try:
                payload = json.loads(raw)
                records = map_response(payload, config.record_path, config.field_mapping, config.max_records)
            except (UnicodeDecodeError, json.JSONDecodeError, ResponseMappingError, TypeError, ValueError):
                return _failure(INVALID_RESPONSE, "Upstream returned an invalid response", status=status)

            latency = int((time.monotonic() - started) * 1000)
            logger.info(
                "datasource_tool_execution_succeeded",
                tool=config.name,
                request_id=context.request_id,
                status_code=status,
                latency_ms=latency,
            )
            return ExecutionResult(records=records, status_code=status, latency_ms=latency)
        except DestinationResolutionError:
            return _failure(DNS_ERROR, "Destination DNS resolution failed", retryable=True)
        except UnsafeDestinationError:
            return _failure(UNSAFE_DESTINATION, "Destination is not permitted")
        except httpx.TimeoutException:
            return _failure(UPSTREAM_TIMEOUT, "Upstream request timed out", retryable=True)
        except _ResponseTooLarge:
            return _failure(RESPONSE_TOO_LARGE, "Upstream response exceeded the configured limit")
        except _MalformedResponse:
            return _failure(INVALID_RESPONSE, "Upstream returned an invalid response")
        except httpx.RequestError:
            return _failure(UPSTREAM_ERROR, "Upstream request failed", retryable=True)
        except (KeyError, TypeError, ValueError):
            return _failure(INVALID_CONFIGURATION, "Data source configuration is invalid")
        except Exception:
            # Decryption errors and other unexpected failures remain deliberately
            # generic so ciphertext, keys, or provider details never reach the model.
            logger.error(
                "datasource_tool_execution_failed",
                tool=config.name,
                request_id=context.request_id,
                error_category="unexpected",
            )
            return _failure(UPSTREAM_ERROR, "Data source execution failed")

    def _apply_auth(self, headers: dict[str, str], config: ToolConfig) -> None:
        if config.auth_type == "none" or not config.encrypted_secret:
            return
        secret = self._decrypt_secret(config.encrypted_secret)
        auth_type = config.auth_type.lower()
        if auth_type == "bearer":
            header_name, header_value = "Authorization", f"Bearer {secret}"
        elif auth_type in {"api_key", "api-key"}:
            header_name, header_value = config.auth_header or "X-API-Key", secret
        elif auth_type in {"basic", "basic_auth"}:
            header_name, header_value = "Authorization", f"Basic {secret}"
        else:
            raise ValueError("Unsupported authentication type")
        validate_auth_header(header_name, header_value)
        headers[header_name] = header_value

    @staticmethod
    def _origin(url: str) -> tuple[str, str | None, int | None]:
        parsed = urlsplit(url)
        default_port = 443 if parsed.scheme.lower() == "https" else 80
        return parsed.scheme.lower(), parsed.hostname, parsed.port or default_port

    async def _send_bounded(
        self,
        client: httpx.AsyncClient,
        method: str,
        url: str,
        headers: dict[str, str],
        params: Any,
        body: Any,
        limit: int,
    ) -> tuple[httpx.Response, bytes]:
        content = bytearray()
        async with client.stream(method, url, headers=headers, params=params, json=body) as response:
            declared = response.headers.get("content-length")
            if declared:
                if not declared.isdigit():
                    raise _MalformedResponse
                if int(declared) > limit:
                    raise _ResponseTooLarge
            async for chunk in response.aiter_bytes():
                if len(content) + len(chunk) > limit:
                    raise _ResponseTooLarge
                content.extend(chunk)
            return response, bytes(content)


class _ResponseTooLarge(Exception):
    pass


class _MalformedResponse(Exception):
    pass
