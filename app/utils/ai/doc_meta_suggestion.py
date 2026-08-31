"""
app/utils/ai/doc_meta_suggestion.py

Generates document metadata suggestions (description and topic tag) for uploaded documents,
scraped URLs, plain text, and Q&A items.

Provider Fallback:
1. Tries OpenAI direct (gpt-4o-mini) first.
2. If OpenAI encounters an error (rate limit, expired token 401/403, quota 402, connection failure),
   it automatically falls back to OpenRouter (openai/gpt-4o-mini).
"""

from __future__ import annotations

import json
from typing import Optional
import structlog
from openai import AsyncOpenAI

logger = structlog.get_logger()

_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


async def generate_doc_metadata_suggestion(
    *,
    space_id: Optional[str] = None,
    doc_id: Optional[str] = None,
    file_bytes: Optional[bytes] = None,
    filename: Optional[str] = None,
    title: Optional[str] = None,
    url: Optional[str] = None,
    content: Optional[str] = None,
) -> dict[str, str]:
    """
    Generate an AI-suggested description and topic tag for a document / URL / snippet.
    - If file_bytes is provided (new file upload), parses PDF/DOCX/TXT on the fly via IngestionService.
    - If doc_id is supplied, pulls starting 20 chunks from ChromaDB vector store.
    - Tries OpenAI direct first; falls back to OpenRouter if OpenAI encounters any error or token issues.
    Returns {"description": "...", "topic": "..."}.
    """
    from app.config import settings

    file_title = (filename or title or "").strip()
    source_url = (url or "").strip()
    snippet = (content or "").strip()

    # 1. On-the-fly parsing for new file uploads (PDF, DOCX, TXT, etc.)
    if file_bytes and file_title:
        try:
            from app.orchestra.ai.ingestion.ingestion import IngestionService
            svc = IngestionService()
            parsed_doc = svc.parse(file_bytes, file_title)
            parsed_text = (parsed_doc.full_text or "").strip()[:60000]
            if parsed_text:
                snippet = f"{snippet}\n\n{parsed_text}".strip() if snippet and snippet != file_title else parsed_text
                logger.info("doc_meta_suggestion.parsed_new_file", filename=file_title, chars=len(parsed_text))
        except Exception as parse_err:
            logger.warning("doc_meta_suggestion.parse_file_failed", filename=file_title, error=str(parse_err))

    # 2. Vector Store Chunk Pull (for existing doc_id / space_id)
    if not snippet or snippet == file_title:
        target_doc_id = (doc_id or "").strip()
        if target_doc_id:
            try:
                from app.rag.vector_store import get_vector_store
                store = get_vector_store()
                chunks: list = []
                if space_id:
                    chunks = store.get_doc_chunks(space_id, target_doc_id)
                if not chunks:
                    doc_meta = store.get_doc_meta(target_doc_id)
                    if doc_meta and doc_meta.get("client_id"):
                        chunks = store.get_doc_chunks(doc_meta["client_id"], target_doc_id)

                if chunks:
                    # Pull up to 80 starting chunks (~60,000 characters) to cover complete document text
                    first_chunks = chunks[:80]
                    chunk_text = "\n\n".join(c.get("text", "") for c in first_chunks if c.get("text"))[:60000]
                    snippet = f"{snippet}\n\n{chunk_text}".strip() if snippet and snippet != file_title else chunk_text
                    logger.info("doc_meta_suggestion.pulled_vector_chunks", doc_id=target_doc_id, chunk_count=len(first_chunks), chars=len(chunk_text))
            except Exception as err:
                logger.warning("doc_meta_suggestion.fetch_chunks_failed", doc_id=target_doc_id, error=str(err))

    # Cap snippet context at 15k characters (~4k tokens) to prevent context limit errors (e.g. 8k tokens on Modal)
    snippet = snippet[:15000]

    if not (snippet or file_title or source_url):
        return {"description": "", "topic": "", "scope": ""}

    prompt = (
        "You are an expert document analyzer for an enterprise Knowledge Base.\n"
        "Analyze the provided document text, excerpt, title, and URL below, and generate accurate metadata:\n\n"
        "1. 'title': Suggest a clear, concise, and professional title/name for this document.\n"
        "2. 'doc_type': Identify exact document classification. YOU MUST CHOOSE EXACTLY ONE OF: 'general', 'faq', 'policy', 'manual', 'product'.\n"
        "3. 'scope': Identify explicit coverage scope (e.g. 'All SBI Credit Card Variants (Portfolio-wide)', 'SBI Cashback Card Only', 'Enterprise-wide HR Policy').\n"
        "4. 'description': Write a comprehensive, accurate 2-3 sentence summary describing the FULL SCOPE and categories of information in this document. CRITICAL RULES:\n"
        "   - Do NOT write generic fluff like 'This document provides info...'.\n"
        "   - Do NOT cherry-pick 1 or 2 random product names or fee examples if the document covers a broader portfolio or master policy (to prevent RAG agents from wrongly assuming only those examples exist in this document).\n"
        "   - Clearly outline the main subjects, financial/policy categories covered (e.g. annual & renewal fees, finance charges/interest, late payment terms, billing cycles, cardholder obligations), and when an agent should consult this document.\n"
        "5. 'topic': A clean 1-3 word primary category/subject (e.g. 'SBI Credit Card MITC', 'Refund Policy', 'Employee Handbook').\n"
        "6. 'tags': 4-7 representative, high-value citation tags covering core document categories and sub-topics (e.g. ['MITC', 'Terms & Conditions', 'Schedule of Charges', 'Finance Charges', 'Late Payment Fees', 'Cardholder Obligations'])."
        "\n\n"
        f"Filename/Title: {file_title}\n"
        f"URL: {source_url}\n"
        f"Content Excerpt (Full Context):\n{snippet}\n\n"
        "Return ONLY a raw JSON object with EXACTLY these keys (do not omit any):\n"
        "  - 'title': string (MUST NOT BE NULL OR EMPTY)\n"
        "  - 'doc_type': classification string ('general' | 'faq' | 'policy' | 'manual' | 'product')\n"
        "  - 'scope': explicit coverage scope string\n"
        "  - 'description': comprehensive, scope-accurate summary statement\n"
        "  - 'topic': primary subject/product name\n"
        "  - 'tags': array of 4-7 keyword strings\n"
        "Do not wrap in markdown or code fences."
    )

    raw_text: Optional[str] = None

    from app.core.llm_provider import get_async_openai_clients
    providers = get_async_openai_clients()

    if not providers:
        logger.warning("doc_meta_suggestion.failed_no_providers_configured")
    else:
        for name, client, model in providers:
            try:
                logger.info(f"doc_meta_suggestion.attempting_with_{name}")
                resp = await client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=600,
                    temperature=0.2,
                )
                raw_text = (resp.choices[0].message.content or "").strip()
                if raw_text:
                    break
            except Exception as e:
                logger.warning(f"doc_meta_suggestion.{name}_failed", error=str(e))

    # Parse JSON output from LLM response if available
    if raw_text:
        try:
            cleaned = raw_text
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            data = json.loads(cleaned)

            tags_raw = data.get("tags") or data.get("doc_label") or []
            if isinstance(tags_raw, str):
                tags_list = [t.strip() for t in tags_raw.split(",") if t.strip()]
            elif isinstance(tags_raw, list):
                tags_list = [str(t).strip() for t in tags_raw if str(t).strip()]
            else:
                tags_list = []

            doc_type = str(data.get("doc_type", "")).strip()
            if doc_type and doc_type not in tags_list:
                tags_list.insert(0, doc_type)

            title_out = data.get("title")
            if not title_out or str(title_out).strip() == "":
                # Fallback to the original filename/title if the AI model drops the field
                title_out = file_title or "Untitled Document"

            return {
                "title": str(title_out).strip(),
                "doc_type": data.get("doc_type") or "",
                "scope": str(data.get("scope", "")).strip(),
                "description": str(data.get("description", "")),
                "topic": str(data.get("topic", "")),
                "tags": tags_list,
            }
        except Exception as parse_err:
            logger.warning("doc_meta_suggestion.json_parse_failed", raw_text=raw_text, error=str(parse_err))

    # Final Fallback: Heuristic extraction if both OpenAI and OpenRouter failed
    fallback_topic = file_title.split(".")[0] if file_title else (source_url.split("//")[-1].split("/")[0] if source_url else "General")
    clean_topic = fallback_topic.replace("-", " ").replace("_", " ").title()[:30]
    return {
        "doc_type": "General Document",
        "scope": "General",
        "description": f"Information regarding {file_title or source_url or 'provided content'}.",
        "topic": clean_topic,
        "tags": [clean_topic] if clean_topic else [],
    }
