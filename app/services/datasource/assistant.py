"""Plain-language data-source draft generation with deterministic safeguards."""

from __future__ import annotations

import json
import re
import shlex
from dataclasses import dataclass, replace
from typing import Any
from urllib.parse import parse_qsl, quote, urlsplit, urlunsplit

from app.services.datasource.contracts import DataSourceDraft
from app.services.datasource.importer import parse_curl


_URL = re.compile(r"(?:(?:https?://)?(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?::\d+)?(?:/[^\s,]*)?)")
_MARKDOWN_URL = re.compile(r"\[[^\]]*\]\((https?://[^)]+)\)|\[(https?://[^\]]+)\]")
_CREDENTIAL = re.compile(
    r"(?i)(?:authorization\s*:|bearer\s+(?!token\b|authentication\b|auth\b)[A-Za-z0-9._~+/=-]{12,}|api[_ -]?key\s*[:=]|password\s*[:=]|secret\s*[:=])"
)


@dataclass(frozen=True, slots=True)
class DescribeResult:
    draft: DataSourceDraft | None
    missing_information: tuple[str, ...]
    ai_used: bool = False


def _json_content(value: str) -> dict[str, Any]:
    value = value.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    parsed = json.loads(value)
    return parsed if isinstance(parsed, dict) else {}


async def describe_data_source(description: str, *, use_ai: bool = True) -> DescribeResult:
    """Turn a credential-free description into a bounded, reviewable draft."""
    text = description.strip()
    if not text:
        raise ValueError("Describe what the data source should do")
    if _CREDENTIAL.search(text):
        raise ValueError("Remove passwords, API keys, tokens, and authorization values from the description")

    markdown_match = _MARKDOWN_URL.search(text)
    match = _URL.search(text)
    if not match:
        return DescribeResult(None, ("Add the complete API URL, for example https://api.example.com/orders/{id}",))
    url = (next((value for value in markdown_match.groups() if value), "") if markdown_match else match.group(0)).rstrip(".;:)")
    if not url.lower().startswith(("http://", "https://")):
        url = "https://" + url
    # Convert query values described as user inputs into placeholders. The URL
    # remains authoritative for parameter names; prose may only make an existing
    # parameter dynamic, never invent a new one.
    dynamic_inputs = {
        value.lower() for value in re.findall(
            r"(?i)\b([A-Za-z_][A-Za-z0-9_]*)\b\s+(?:will\s+be|is)\s+(?:input(?:ted)?|provided|entered|supplied)(?:\s+by\s+(?:the\s+)?user)?",
            text,
        )
    }
    parsed_url = urlsplit(url)
    query_parts = []
    for key, value in parse_qsl(parsed_url.query, keep_blank_values=True):
        rendered = "{" + key + "}" if key.lower() in dynamic_inputs else value
        query_parts.append(f"{quote(key, safe='')}={quote(rendered, safe='{}')}")
    url = urlunsplit((parsed_url.scheme, parsed_url.netloc, parsed_url.path, "&".join(query_parts), ""))
    method = "POST" if re.search(r"(?i)\b(post|submit|send)\b", text) else "GET"
    draft = parse_curl(f"curl --request {method} {shlex.quote(url)}")

    auth_type = "none"
    auth_header = "Authorization"
    credential_required = False
    if re.search(r"(?i)api[ -]?key", text):
        auth_type, auth_header, credential_required = "api_key", "X-API-Key", True
    elif re.search(r"(?i)bearer|oauth|access token", text):
        auth_type, credential_required = "bearer", True
    connection = replace(
        draft.connection, auth_type=auth_type, auth_header=auth_header,
        credential_required=credential_required,
    )
    missing: list[str] = []
    if auth_type == "none":
        missing.append("Confirm whether this API requires authentication")
    if method == "POST":
        missing.append("Review or add the POST request body")
    missing.append("Provide a sample response to create the output mapping")

    tool = replace(draft.tool, method=method)
    ai_used = False
    if use_ai:
        try:
            from app.services.llm_service import llm_service

            result = await llm_service.generate_with_fallback(
                messages=[{"role": "user", "content": json.dumps({
                    "description": text,
                    "fixed_url": url,
                    "fixed_method": method,
                    "fixed_inputs": list(tool.input_schema.get("properties", {})),
                    "instruction": "Return JSON only with display_name and description. Do not add URLs, fields, headers, authentication, or credentials.",
                })}],
                temperature=0.1,
                max_tokens=250,
            )
            proposed = _json_content((result or {}).get("content", "{}"))
            display_name = proposed.get("display_name")
            summary = proposed.get("description")
            if isinstance(display_name, str) and 1 <= len(display_name.strip()) <= 200:
                tool = replace(tool, display_name=display_name.strip())
            if isinstance(summary, str) and 1 <= len(summary.strip()) <= 500:
                tool = replace(tool, description=summary.strip())
            ai_used = bool(result)
        except Exception:
            pass

    return DescribeResult(replace(draft, source_type="ai", connection=connection, tool=tool), tuple(missing), ai_used)


__all__ = ["DescribeResult", "describe_data_source"]
