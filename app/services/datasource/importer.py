"""Deterministic, non-executing import of cURL and OpenAPI operations."""

from __future__ import annotations

import json
import re
import shlex
from copy import deepcopy
from typing import Any
from urllib.parse import parse_qsl, urlsplit, urlunsplit

from app.services.datasource.contracts import DataSourceDraft, DraftConnection, DraftTool


class DataSourceImportError(ValueError):
    pass


_UNSAFE_SHELL = re.compile(r"(?:\$\(|`|\|\||&&|[|<>])")
_SAFE_HEADERS = {"accept", "content-type", "accept-language"}
_METHODS = {"GET", "POST"}


def _machine_name(value: str) -> str:
    stem = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_") or "lookup"
    if not stem[0].isalpha():
        stem = f"lookup_{stem}"
    return stem[:64]


def _schema_for_placeholders(*values: Any) -> dict[str, Any]:
    text = json.dumps(values, sort_keys=True)
    names = sorted(set(re.findall(r"\{([A-Za-z_][A-Za-z0-9_]*)\}", text)))
    return {
        "type": "object",
        "properties": {name: {"type": "string"} for name in names},
        "required": names,
        "additionalProperties": False,
    }


def parse_curl(command: str) -> DataSourceDraft:
    if not command or len(command) > 50_000:
        raise DataSourceImportError("cURL command is empty or too large")
    if _UNSAFE_SHELL.search(command):
        raise DataSourceImportError("Shell operators and substitutions are not supported")
    try:
        tokens = shlex.split(command.strip().removeprefix("$ "))
    except ValueError as exc:
        raise DataSourceImportError("cURL command has invalid quoting") from exc
    if not tokens or tokens[0] not in {"curl", "/usr/bin/curl"}:
        raise DataSourceImportError("Only cURL commands are supported")

    method = "GET"
    url = ""
    headers: dict[str, str] = {}
    body: Any = None
    warnings: list[str] = []
    index = 1
    value_options = {
        "-X": "method", "--request": "method", "-H": "header", "--header": "header",
        "-d": "body", "--data": "body", "--data-raw": "body", "--data-binary": "body",
        "--url": "url",
    }
    ignored_flags = {"--compressed", "-s", "--silent", "-S", "--show-error", "-L", "--location"}
    while index < len(tokens):
        token = tokens[index]
        if token in ignored_flags:
            index += 1
            continue
        if token.startswith("@") or token in {"-K", "--config"}:
            raise DataSourceImportError("Local file reads are not supported")
        kind = value_options.get(token)
        if kind:
            if index + 1 >= len(tokens):
                raise DataSourceImportError(f"Missing value for {token}")
            value = tokens[index + 1]
            index += 2
            if kind == "method":
                method = value.upper()
            elif kind == "header":
                if ":" not in value:
                    raise DataSourceImportError("Header must use Name: Value syntax")
                key, header_value = value.split(":", 1)
                headers[key.strip()] = header_value.strip()
            elif kind == "body":
                if value.startswith("@"):
                    raise DataSourceImportError("Local request-body files are not supported")
                try:
                    body = json.loads(value)
                except json.JSONDecodeError:
                    body = value
                    warnings.append("Request body is not JSON and must be reviewed")
                if method == "GET":
                    method = "POST"
            else:
                url = value
            continue
        if token.startswith("http://") or token.startswith("https://"):
            url = token
            index += 1
            continue
        if token.startswith("-"):
            raise DataSourceImportError(f"Unsupported cURL option: {token}")
        raise DataSourceImportError("Unexpected cURL argument")

    if method not in _METHODS:
        raise DataSourceImportError("Only read-classified GET and POST operations are supported")
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise DataSourceImportError("cURL must contain an HTTP(S) URL")

    auth_type, auth_header, credential_required = "none", "Authorization", False
    safe_headers: dict[str, str] = {}
    for key, value in headers.items():
        normalized = key.lower()
        if normalized == "authorization":
            auth_type = "bearer" if value.lower().startswith("bearer ") else "basic"
            credential_required = True
        elif any(fragment in normalized for fragment in ("key", "token", "auth", "secret")):
            auth_type, auth_header, credential_required = "api_key", key, True
        elif normalized in _SAFE_HEADERS:
            safe_headers[key] = value
        else:
            warnings.append(f"Custom header '{key}' was omitted; add it with a placeholder during review")

    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    path = parsed.path or "/"
    template = {"query": query, "headers": {}, "body": body or {}}
    name = parsed.path.rstrip("/").split("/")[-1] or parsed.hostname or "lookup"
    return DataSourceDraft(
        source_type="curl",
        connection=DraftConnection(
            name=f"{(parsed.hostname or 'API')} connection",
            base_url=urlunsplit((parsed.scheme, parsed.netloc, "", "", "")),
            auth_type=auth_type,
            auth_header=auth_header,
            credential_required=credential_required,
            default_headers=safe_headers,
        ),
        tool=DraftTool(
            name=_machine_name(name), display_name=name.replace("_", " ").title(),
            description=f"Retrieve data from {path}", method=method, path=path,
            input_schema=_schema_for_placeholders(path, template), request_template=template,
        ),
        warnings=tuple(dict.fromkeys(warnings)),
    )


def _resolve_local(document: dict[str, Any], value: Any) -> Any:
    if not isinstance(value, dict) or "$ref" not in value:
        return value
    ref = value["$ref"]
    if not isinstance(ref, str) or not ref.startswith("#/components/"):
        raise DataSourceImportError("External OpenAPI references are not supported")
    current: Any = document
    for segment in ref[2:].split("/"):
        current = current.get(segment) if isinstance(current, dict) else None
    if current is None:
        raise DataSourceImportError(f"OpenAPI reference was not found: {ref}")
    return deepcopy(current)


def parse_openapi(document: dict[str, Any], operation_id: str | None = None) -> list[DataSourceDraft]:
    if not isinstance(document, dict) or not str(document.get("openapi", "")).startswith("3."):
        raise DataSourceImportError("An OpenAPI 3 document is required")
    servers = document.get("servers") or []
    server_url = servers[0].get("url") if servers and isinstance(servers[0], dict) else ""
    parsed_server = urlsplit(server_url)
    if parsed_server.scheme not in {"http", "https"} or not parsed_server.netloc:
        raise DataSourceImportError("OpenAPI document must declare an HTTP(S) server")

    drafts: list[DataSourceDraft] = []
    for path, path_item in (document.get("paths") or {}).items():
        if not isinstance(path_item, dict):
            continue
        for method in ("get", "post"):
            operation = path_item.get(method)
            if not isinstance(operation, dict):
                continue
            op_id = operation.get("operationId") or f"{method}_{path}"
            if operation_id and op_id != operation_id:
                continue
            properties: dict[str, Any] = {}
            required: list[str] = []
            query: dict[str, str] = {}
            for raw_parameter in [*(path_item.get("parameters") or []), *(operation.get("parameters") or [])]:
                parameter = _resolve_local(document, raw_parameter)
                if not isinstance(parameter, dict) or parameter.get("in") not in {"path", "query"}:
                    continue
                parameter_name = parameter.get("name")
                if not parameter_name:
                    continue
                properties[parameter_name] = _resolve_local(document, parameter.get("schema") or {"type": "string"})
                if parameter.get("required") or parameter.get("in") == "path":
                    required.append(parameter_name)
                if parameter.get("in") == "query":
                    query[parameter_name] = "{" + parameter_name + "}"
            body: Any = {}
            request_body = operation.get("requestBody") or {}
            content = request_body.get("content") if isinstance(request_body, dict) else {}
            json_media = (content or {}).get("application/json") if isinstance(content, dict) else None
            if isinstance(json_media, dict) and isinstance(json_media.get("schema"), dict):
                body_schema = _resolve_local(document, json_media["schema"])
                for key, schema in (body_schema.get("properties") or {}).items():
                    properties[key] = _resolve_local(document, schema)
                    body[key] = "{" + key + "}"
                required.extend(body_schema.get("required") or [])
            schema = {
                "type": "object", "properties": properties,
                "required": sorted(set(required)), "additionalProperties": False,
            }
            security = operation.get("security", document.get("security", []))
            auth_type, auth_header, credential_required = "none", "Authorization", bool(security)
            if security:
                scheme_name = next(iter(security[0]), None) if isinstance(security[0], dict) else None
                schemes = ((document.get("components") or {}).get("securitySchemes") or {})
                scheme = _resolve_local(document, schemes.get(scheme_name, {}))
                if scheme.get("type") == "apiKey":
                    auth_type, auth_header = "api_key", scheme.get("name") or "X-API-Key"
                elif scheme.get("scheme") == "basic":
                    auth_type = "basic"
                else:
                    auth_type = "bearer"
            drafts.append(DataSourceDraft(
                source_type="openapi",
                connection=DraftConnection(
                    name=f"{document.get('info', {}).get('title', parsed_server.hostname or 'API')} connection",
                    base_url=urlunsplit((parsed_server.scheme, parsed_server.netloc, parsed_server.path.rstrip('/'), "", "")),
                    auth_type=auth_type, auth_header=auth_header,
                    credential_required=credential_required,
                ),
                tool=DraftTool(
                    name=_machine_name(op_id), display_name=operation.get("summary") or op_id,
                    description=operation.get("description") or operation.get("summary") or op_id,
                    method=method.upper(), path=path, input_schema=schema,
                    request_template={"query": query, "headers": {}, "body": body},
                ),
            ))
    if operation_id and not drafts:
        raise DataSourceImportError("OpenAPI operation was not found")
    if not drafts:
        raise DataSourceImportError("OpenAPI document has no supported GET/POST operations")
    return drafts


__all__ = ["DataSourceImportError", "parse_curl", "parse_openapi"]
