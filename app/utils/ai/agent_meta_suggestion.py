"""
app/utils/ai/agent_meta_suggestion.py

Generates placeholder agent metadata (name, description, system_prompt) using
the LLM + the org's existing ChromaDB knowledge base documents as context.

Cache strategy
──────────────
Results are stored in `agent_meta_suggestions` (space_id + doc_type_key unique).
If the same org requests a suggestion for the same doc_type combination again
(e.g. the user cancelled and re-opened the modal) the cached row is returned
immediately — no LLM call.

When the user finally creates the agent the caller should update the row's
`agent_id` to link the suggestion to the resulting CustomAgent (custom_agents).

Public API
──────────
    result = await get_or_generate(db, space_id, org_name, doc_types)
    # result → {name, description, system_prompt, from_cache: bool, suggestion_id}

    await link_agent(db, suggestion_id, agent_id)
    # Call this after the custom_agents row is created.
"""

from __future__ import annotations

import json
import re
from typing import Optional
import hashlib
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()


# ── Public helpers ────────────────────────────────────────────────────────────

def build_doc_type_key(doc_types: list[str], kb_ids: list[str] | None = None) -> str:
    """Stable cache key from the doc_types and, when given, the knowledge bases.

    The KB must be part of the key: two knowledge bases in the same space can
    easily share a doc_type ("general"), and without this they collide -- a
    request for one KB would be served the other KB's cached suggestion.
    """
    types = ",".join(sorted(set(doc_types))) if doc_types else "general"
    if kb_ids:
        digest = hashlib.sha1(",".join(sorted(kb_ids)).encode()).hexdigest()[:8]
        return f"kb{digest}:{types}"
    return types


# Keep for backward compat
def build_cache_key(doc_types: list[str]) -> str:
    return build_doc_type_key(doc_types)


async def get_or_generate(
    db: AsyncSession,
    space_id: UUID,
    org_name: str,
    doc_types: list[str],
    doc_id: str | None = None,
    agent_name: str | None = None,
    force: bool = False,
    kb_ids: list[str] | None = None,
    kb_name: str = "",
    kb_doc_ids: list[str] | None = None,
) -> dict:
    """
    Return a cached AgentMetaSuggestion or generate a new one via LLM.

    Returns
    -------
    {
        "suggestion_id": str,
        "name":          str,
        "description":   str,
        "system_prompt": str,
        "from_cache":    bool,
    }
    """
    from app.models.space import AgentMetaSuggestion

    _doc_id  = doc_id or ""
    type_key = build_doc_type_key(doc_types, kb_ids)

    # ── Check cache ──────────────────────────────────────────────────────────
    result = await db.execute(
        select(AgentMetaSuggestion).where(
            AgentMetaSuggestion.space_id == space_id,
            AgentMetaSuggestion.doc_id == _doc_id,
            AgentMetaSuggestion.doc_type_key == type_key,
        )
    )
    cached = result.scalar_one_or_none()
    if cached:
        if force:
            logger.info("agent_meta_suggestion.cache_bust", space_id=str(space_id),
                        doc_id=_doc_id, type_key=type_key)
            await db.delete(cached)
            await db.commit()
            cached = None
        else:
            logger.info("agent_meta_suggestion.cache_hit", space_id=str(space_id),
                        doc_id=_doc_id, type_key=type_key)
            return {
                "suggestion_id": str(cached.id),
                "name":          cached.name,
                "description":   cached.description,
                "system_prompt": cached.system_prompt,
                "from_cache":    True,
            }

    # ── Generate via LLM ─────────────────────────────────────────────────────
    generated = await _generate(space_id=str(space_id), org_name=org_name,
                                doc_types=doc_types, doc_id=_doc_id,
                                agent_name=agent_name, kb_name=kb_name,
                                kb_doc_ids=kb_doc_ids)

    # ── Persist to cache ─────────────────────────────────────────────────────
    suggestion = AgentMetaSuggestion(
        space_id=space_id,
        doc_id=_doc_id,
        doc_type_key=type_key,
        name=generated["name"],
        description=generated["description"],
        system_prompt=generated["system_prompt"],
    )
    db.add(suggestion)
    await db.commit()
    await db.refresh(suggestion)

    logger.info("agent_meta_suggestion.generated",
                space_id=str(space_id), doc_id=_doc_id, type_key=type_key,
                suggestion_id=str(suggestion.id))

    return {
        "suggestion_id": str(suggestion.id),
        "name":          suggestion.name,
        "description":   suggestion.description,
        "system_prompt": suggestion.system_prompt,
        "from_cache":    False,
    }


async def link_agent(db: AsyncSession, suggestion_id: str, agent_id: UUID) -> None:
    """
    After the user creates an agent from a suggestion, link the two rows.
    Safe to call even if suggestion_id is stale or missing.
    """
    from app.models.space import AgentMetaSuggestion
    try:
        result = await db.execute(
            select(AgentMetaSuggestion).where(
                AgentMetaSuggestion.id == suggestion_id
            )
        )
        row = result.scalar_one_or_none()
        if row and not row.agent_id:
            row.agent_id = agent_id
            await db.commit()
    except Exception as e:
        logger.warning("agent_meta_suggestion.link_failed", error=str(e))


# ── LLM generation ────────────────────────────────────────────────────────────

async def _generate(space_id: str, org_name: str, doc_types: list[str],
                    doc_id: str = "", agent_name: str | None = None,
                    kb_name: str = "", kb_doc_ids: list[str] | None = None) -> dict:
    """
    Build context from ChromaDB + call LLM to produce name/description/system_prompt.
    Falls back to deterministic defaults if LLM fails.
    """
    import asyncio
    from app.services.llm_service import llm_service

    # Fetch doc metadata from ChromaDB (only when doc_types provided)
    loop = asyncio.get_event_loop()
    doc_context = ""
    if doc_types or kb_doc_ids:
        doc_context = await loop.run_in_executor(
            None, lambda: _fetch_doc_context(space_id, doc_types, doc_id, kb_doc_ids)
        )

    prompt = _build_prompt(org_name=org_name, doc_types=doc_types,
                           doc_context=doc_context, agent_name=agent_name,
                           kb_name=kb_name)

    try:
        result = await llm_service.generate_with_fallback(
            messages=[{"role": "user", "content": prompt}],
            system_prompt=(
                "You are an AI assistant that helps configure customer support agents. "
                "Respond ONLY with valid JSON — no markdown, no extra text."
            ),
            temperature=0.4,
            max_tokens=400,
        )

        raw = (result.get("content") or "").strip()

        # Strip markdown code fences if the model wrapped JSON in them
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            raw = re.sub(r"^json\s*", "", raw).strip()
            if "```" in raw:
                raw = raw[: raw.index("```")]

        data = json.loads(raw)

        return {
            "name":          _clean(data.get("name"), 200) or _default_name(doc_types),
            "description":   _clean(data.get("description"), 500) or "",
            "system_prompt": _clean(data.get("system_prompt"), 2000) or "",
        }

    except Exception as e:
        logger.warning("agent_meta_suggestion.llm_failed", error=str(e))
        return _fallback(org_name, doc_types)


# ── ChromaDB context builder ──────────────────────────────────────────────────

def _fetch_doc_context(space_id: str, doc_types: list[str], doc_id: str = "",
                       kb_doc_ids: list[str] | None = None) -> str:
    """
    Collect distinct document metadata (filename, kb_name, description, excerpts)
    for the LLM prompt.

    When kb_doc_ids is given, sampling is restricted to exactly those documents.
    """
    try:
        from app.rag.vector_store import get_vector_store, COLLECTION_CLIENT

        col = get_vector_store()._collection(COLLECTION_CLIENT)
        lines: list[str] = []

        # KB-scoped / doc_ids-scoped: describe exactly the documents requested.
        if kb_doc_ids:
            results = col.get(
                where={"$and": [
                    {"client_id": {"$eq": space_id}},
                    {"doc_id":    {"$in": list(kb_doc_ids)}},
                ]},
                include=["metadatas", "documents"],
                limit=30,
            )
            seen_docs: set[str] = set()
            metas = results.get("metadatas") or []
            docs  = results.get("documents") or []
            while len(docs) < len(metas):
                docs.append("")
            for meta, body in zip(metas, docs):
                did = (meta or {}).get("doc_id", "")
                if not did or did in seen_docs:
                    continue
                seen_docs.add(did)
                name = (meta or {}).get("filename") or (meta or {}).get("title") or (meta or {}).get("kb_name") or did
                desc = (meta or {}).get("semantic_summary") or (meta or {}).get("description") or ""
                excerpt = (body or "")[:350].replace("\n", " ").strip()
                line = f"- {name}"
                if desc:
                    line += f": {desc[:200]}"
                elif excerpt:
                    line += f": {excerpt}"
                lines.append(line)
            if lines:
                return "\n".join(lines[:12])

        for doc_type in doc_types:
            try:
                where_filter: dict
                if doc_id:
                    where_filter = {"$and": [
                        {"client_id": {"$eq": space_id}},
                        {"doc_type":  {"$eq": doc_type}},
                        {"doc_id":    {"$eq": doc_id}},
                    ]}
                else:
                    where_filter = {"$and": [
                        {"client_id": {"$eq": space_id}},
                        {"doc_type":  {"$eq": doc_type}},
                    ]}

                results = col.get(
                    where=where_filter,
                    include=["metadatas", "documents"],
                    limit=5,
                )
                seen: set[str] = set()
                metas = results.get("metadatas") or []
                docs = results.get("documents") or []
                while len(docs) < len(metas):
                    docs.append("")
                
                for meta, doc in zip(metas, docs):
                    doc_id = meta.get("doc_id", "")
                    if doc_id in seen:
                        continue
                    seen.add(doc_id)
                    parts = [f"type={doc_type}"]
                    if meta.get("filename"):
                        parts.append(f"file={meta['filename']}")
                    if meta.get("kb_name"):
                        parts.append(f"kb={meta['kb_name']}")
                    if meta.get("semantic_summary"):
                        parts.append(f"summary={meta['semantic_summary']}")
                    elif meta.get("description"):
                        parts.append(f"desc={meta['description'][:120]}")
                    if doc:
                        snippet = " ".join(doc.split())[:250].strip()
                        if snippet:
                            parts.append(f"excerpt=\"{snippet}...\"")
                    lines.append("• " + " | ".join(parts))
            except Exception:
                lines.append(f"• type={doc_type}")

        return "\n".join(lines) if lines else "\n".join(f"• type={dt}" for dt in doc_types)

    except Exception as e:
        logger.warning("agent_meta_suggestion.chroma_context_failed", error=str(e))
        return "\n".join(f"• type={dt}" for dt in doc_types)


DOMAIN_PACKAGES = {
    "credit_card": {
        "domain_name": "Credit Card & Retail Financial Products",
        "keywords": ["credit card", "card", "prime", "cashback", "mitc", "reward", "lounge", "annual fee", "visa", "mastercard", "rupay"],
        "terminology": [
            "Annual Fee & Renewal Spend Waiver Thresholds (e.g. ₹2,999 fee waived on ₹3 Lakh annual spends)",
            "Welcome Gift Vouchers (e.g. ₹3,000 e-gift vouchers from Yatra/Shoppers Stop upon fee payment) vs Spend Milestone Rewards (e.g. ₹1,000 Pizza Hut on ₹50k spends or ₹7,000 Yatra on ₹5L spends)",
            "Reward Points Earning Matrix (10X birthday rewards, utility bills, retail spends)",
            "Airport Lounge Access (Domestic & Priority Pass International visits)",
            "Excluded Categories & MCC Penalties (Fuel, Cash Advances, Jewelry exclusions)",
            "Add-on Card Eligibility & Fraud Liability Protection"
        ],
        "sop_steps": [
            "Step 1: Identify Card Variant & Canonical Product Title (e.g. SBI Prime Credit Card)",
            "Step 2: Extract Fee & Waiver Schedule into a Markdown Table",
            "Step 3: Separately list Initial Welcome Gifts from Spend Milestone Rewards",
            "Step 4: Present Earning Matrix, Lounge Access, & Security Covers in clean tables",
            "Step 5: Detail Exclusions & Non-Eligible Transaction MCC rules"
        ]
    },
    "insurance": {
        "domain_name": "Insurance Policies & Claim Coverage",
        "keywords": ["insurance", "policy", "premium", "claim", "sum assured", "rider", "death benefit", "maturity", "surrender", "grace period"],
        "terminology": [
            "Policy Term & Premium Paying Term (PPT)",
            "Sum Assured & Guaranteed Additions / Bonuses",
            "Optional Rider Coverage (Critical Illness, Accidental Total Disability)",
            "Surrender Value, Free Look Period, & Grace Period",
            "Claim Settlement Workflow & Required Documentation Checklist",
            "Excluded Illnesses & Waiting Period Clauses"
        ],
        "sop_steps": [
            "Step 1: Identify Policy Name, Variant, and Plan Option",
            "Step 2: Detail Premium Schedule, Payment Term, & Sum Assured",
            "Step 3: Extract Rider Benefits & Eligibility Options into a Markdown Table",
            "Step 4: Present Claim Settlement Steps & Document Checklist in a Table",
            "Step 5: Cite Exclusions, Waiting Periods, & Surrender Terms"
        ]
    },
    "finance": {
        "domain_name": "Banking, Loans & Financial Services",
        "keywords": ["loan", "interest", "emi", "mortgage", "deposit", "rate", "apr", "tenure", "processing fee", "prepayment"],
        "terminology": [
            "Interest Rate, Floating/Fixed APR, & Repayment Tenure",
            "EMI Schedule & Amortization Calculations",
            "Prepayment / Foreclosure Charges & Lock-in Periods",
            "KYC Requirements & Financial Eligibility Criteria",
            "Processing Fees, Stamp Duty, & Statutory Taxes"
        ],
        "sop_steps": [
            "Step 1: Identify Loan / Banking Product & Account Type",
            "Step 2: Detail Interest Rates & Processing Charges in a Markdown Table",
            "Step 3: Outline EMI Repayment Options & Prepayment Terms",
            "Step 4: List Required KYC Documents & Eligibility Thresholds"
        ]
    },
    "saas_it": {
        "domain_name": "SaaS Platform & Technical API Support",
        "keywords": ["api", "endpoint", "token", "auth", "webhook", "sdk", "rate limit", "payload", "http", "status"],
        "terminology": [
            "API Key Authentication & OAuth Token Handlers",
            "Rate Limits, Throttling, & Quota Allocation",
            "HTTP Status Codes (200, 400, 401, 403, 429, 500) & Error Remediation",
            "SDK Initialization & Webhook Event Payloads",
            "Uptime SLA & Escalation Protocols"
        ],
        "sop_steps": [
            "Step 1: Identify Technical Feature, Endpoint, or Error Symptom",
            "Step 2: Provide Authentication Setup & Request Headers",
            "Step 3: Present Request/Response Schemas & Error Codes in Markdown Tables",
            "Step 4: Supply Webhook Retry & Rate Limit Remediation Code"
        ]
    }
}


def _detect_domain_package(context_text: str, agent_name: str | None = None, doc_types: list[str] | None = None) -> dict:
    combined = (context_text + " " + (agent_name or "") + " " + " ".join(doc_types or [])).lower()
    best_pkg = None
    best_score = 0
    for key, pkg in DOMAIN_PACKAGES.items():
        score = sum(1 for kw in pkg["keywords"] if kw in combined)
        if score > best_score:
            best_score = score
            best_pkg = pkg
    return best_pkg or DOMAIN_PACKAGES["finance"]


# ── Prompt builder ────────────────────────────────────────────────────────────

def _build_prompt(org_name: str, doc_types: list[str], doc_context: str,
                  agent_name: str | None = None, kb_name: str = "") -> str:
    domain_pkg = _detect_domain_package(doc_context, agent_name, doc_types)
    terms_str = "\n".join(f"  • {t}" for t in domain_pkg["terminology"])
    sop_str = "\n".join(f"  • {s}" for s in domain_pkg["sop_steps"])

    if doc_context:
        types_str = ", ".join(doc_types) if doc_types else "general"
        kb_line = f'Knowledge base: "{kb_name}"\n' if kb_name else ""
        context_block = (
            f"{kb_line}"
            f"The agent will answer questions using these specific knowledge base documents:\n"
            f"{doc_context}\n\n"
            f"Document types covered: {types_str}\n\n"
            "Name the agent after the specific product or topic in THESE documents, "
            "not after the company operating the platform -- one company may run "
            "several unrelated agents. For example: documents about a PS5 → "
            "'PS5 Support', not 'Acme Corp Support'.\n\n"
        )
    else:
        # Name-only mode — no documents available
        context_block = (
            f"The agent is named: \"{agent_name}\".\n\n"
            "Generate a description and system prompt based on what this agent name suggests. "
            "Infer the topic or product from the name.\n\n"
        )

    return (
        f'You are configuring an expert customer support agent for "{org_name}" under the "{domain_pkg["domain_name"]}" domain package.\n\n'
        f"{context_block}"
        f"Domain Specific Terminology & Concepts to Enforce:\n{terms_str}\n\n"
        f"Domain Runtime SOP Protocol Steps:\n{sop_str}\n\n"
        "Synthesize a highly effective, production-grade System Prompt that functions as an actionable Agent Skill Protocol.\n"
        "Return a JSON object with exactly these three fields:\n"
        "{\n"
        '  "name": "<2–5 words — specific product or topic agent name>",\n'
        '  "description": "<1–2 sentences — what this agent covers; used by triage to route customer queries>",\n'
        '  "system_prompt": "<Actionable Skill Protocol with: '
        '(1) Role & Skill Domain: Define expert role for the specific product/topic. '
        '(2) Domain Coverage & Responsibilities: Outline covered rules, pricing, terms, and eligibility using domain terminology. '
        '(3) Welcome vs Milestone Distinction Rule: Explicitly distinguish initial sign-up welcome gift vouchers (upon fee payment) from spend milestone rewards (upon hitting spend targets). '
        '(4) Ambiguous Query Clarification Rule: When a query applies to multiple product variants or plans in the knowledge base, instruct the agent to use `ask_user` tool to clarify which specific option the customer holds. '
        '(5) Strict Verbatim Numerical & Rate Preservation: Quote all fees, pricing, rates, limits, and percentages verbatim without cross-contaminating figures between variants. '
        '(6) Rich Visual Formatting: Present fees, rates, charges, and comparisons in clean Markdown Tables or render_table/render_cards tools rather than plain text bullet lists. '
        '(7) Restriction & Exclusion Verification: Check explicit non-eligible rules/clauses and cite restriction codes (e.g. MCC codes, policy clause references) for excluded items. '
        '(8) Domain 5-Step Runtime SOP Protocol. '
        '(9) Escalation Protocol: Escalate unresolved or out-of-scope issues to human support. No greetings.>" \n'
        "}\n\n"
        "Rules: Name reflects the actual document topic · Description is specific for triage routing · "
        "System Prompt acts as a structured Agent Skill Protocol with domain terminology, numerical precision, markdown table formatting, domain SOP protocol, and welcome vs milestone clarification guardrails."
    )





# ── Helpers ───────────────────────────────────────────────────────────────────

def _clean(value: object, max_len: int) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()[:max_len]


def _default_name(doc_types: list[str]) -> str:
    primary = doc_types[0].replace("_", " ").title() if doc_types else "Support"
    return f"{primary} Agent"


def _fallback(org_name: str, doc_types: list[str]) -> dict:
    """Deterministic fallback when the LLM is unavailable."""
    primary = doc_types[0].replace("_", " ").title() if doc_types else "Support"
    types_str = ", ".join(doc_types)
    return {
        "name": f"{primary} Agent",
        "description": (
            f"Handles customer questions related to {types_str}."
        ),
        "system_prompt": (
            f"You are a {primary} support agent for {org_name}.\n\n"
            f"Your role:\n"
            f"- Answer questions about {types_str} using the knowledge base provided\n"
            "- Be accurate, concise, and professional\n"
            "- If you cannot resolve the issue, inform the user that their inquiry is being escalated to human support\n\n"
            "Constraints:\n"
            f"- Only answer questions related to {primary}\n"
            "- Do not make up information — if unsure, say so\n"
            "- Do not discuss competitor products"
        ),
    }
