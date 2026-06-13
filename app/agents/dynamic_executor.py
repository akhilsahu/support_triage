"""
DynamicAgentExecutor — routes a customer message through a brand's
active AgentDefinition records instead of hardcoded agent types.

Flow:
  1. Load active agents for the brand from DB (passed in at construction).
  2. Ask the TriageAgent to classify intent using active agent slugs as options.
  3. Compose the target agent's system prompt from:
       a. agent.system_prompt
       b. Any PromptSkill rows in agent.skills_list (instruction / context / format)
  4. If the agent has rag_enabled=True, fetch relevant chunks from ChromaDB
     filtered by client_id (org.slug) and rag_doc_types.
  5. Call the LLM and return the result dict.
"""

from __future__ import annotations

import json
import time
from typing import Any, Optional

import structlog

from app.models.space import Space
from app.agents.resolved_agent import ResolvedAgent

logger = structlog.get_logger()


class DynamicAgentExecutor:
    """Executes a brand-specific agent pipeline at runtime."""

    def __init__(self, brand: Space = None, active_agents: list[ResolvedAgent] = None,
                 org: Space = None, mcp_server=None):
        self.org = org or brand
        self.active_agents = {a.slug: a for a in (active_agents or [])}
        self.mcp_server = mcp_server   # DataSourceMCPServer, loaded per org per request

    # ── Public entry point ────────────────────────────────────────────────────

    _GENERAL_FALLBACK_PROMPT = (
        "You are a helpful customer support assistant for {brand}. "
        "Answer the customer's question as best you can. "
        "Be friendly, concise, and accurate."
    )

    async def run(
        self,
        message: str,
        session_id: str,
        conversation_id: str,
    ) -> dict[str, Any]:
        """Route message and produce a reply dict."""
        from app.services.memory_service import mem0
        from app.config import settings

        # ── Mem0: retrieve past context + reformulate query ───────────────────
        reformulated_query = message
        if mem0 and session_id and session_id != "new":
            try:
                memories = mem0.search(message, user_id=session_id, limit=settings.MEM0_SEARCH_LIMIT)
                if memories:
                    context_summary = "\n".join(m["memory"] for m in memories)
                    rewrite_result = await self._call_llm(
                        system=(
                            "Rewrite the user question as a standalone search query using the "
                            "conversation context below. Return only the rewritten query, nothing else.\n\n"
                            f"Conversation context:\n{context_summary}"
                        ),
                        user_message=message,
                        temperature=0.1,
                        max_tokens=settings.MEM0_REWRITE_MAX_TOKENS,
                    )
                    if rewrite_result:
                        reformulated_query = rewrite_result
                        logger.info("mem0.query_rewritten", original=message, reformulated=reformulated_query)
            except Exception as e:
                logger.warning("mem0.search_failed", error=str(e))

        specialists = self.active_agents

        # If no specialists, answer directly as general assistant
        if not specialists:
            reply = await self._call_llm(
                system=self._GENERAL_FALLBACK_PROMPT.format(brand=self.org.display_name),
                user_message=message,
                temperature=0.5,
                max_tokens=500,
            )
            return {"reply": reply, "agent": "triage", "intent": "general", "rag_hit": False}

        # 1. Triage — pick among active specialists
        target_slug, intent = await self._triage(message)
        agent = self.active_agents.get(target_slug)

        if not agent:
            # Fallback to first available specialist
            agent = next(iter(specialists.values()))
            target_slug = agent.slug

        # 2. Compose system prompt
        system_prompt = await self._compose_system_prompt(agent)

        # 3. RAG context (if enabled)
        rag_context = ""
        rag_hit = False
        rag_citations: list[dict] = []
        if agent and agent.rag_enabled and (agent.rag_doc_types_list or agent.kb_ids):
            rag_context, rag_hit, rag_citations = await self._fetch_rag_context(
                message=reformulated_query,
                doc_types=agent.rag_doc_types_list,
                kb_ids=agent.kb_ids,
                top_k=agent.rag_top_k,
            )
            # If RAG is enabled but nothing matched, return a canned "not found"
            # response immediately — no LLM hallucination allowed.
            if not rag_hit:
                return {
                    "reply": (
                        "I'm sorry, I couldn't find relevant information in our knowledge base "
                        "to answer your question. Please contact our support team directly for "
                        "further assistance."
                    ),
                    "agent": target_slug,
                    "intent": intent,
                    "rag_hit": False,
                    "citations": [],
                }

        # 4. MCP tool call if data sources configured
        mcp_context = ""
        if self.mcp_server:
            mcp_context = await self._run_mcp_tools(message, target_slug)

        # 5. Call LLM
        full_prompt = system_prompt
        if rag_context:
            # RAG-only instruction: answer strictly from the retrieved chunks
            full_prompt += (
                "\n\nKNOWLEDGE BASE CONTEXT (use ONLY this to answer):\n"
                + rag_context
                + "\n\nCRITICAL: Base your answer solely on the KNOWLEDGE BASE CONTEXT above. "
                "Do not use any outside knowledge. If the context does not contain enough "
                "information to answer fully, say so and suggest the customer contact support."
            )
        if mcp_context:
            full_prompt += f"\n\nLIVE DATA FROM {self.org.display_name.upper()} SYSTEM:\n{mcp_context}"

        reply = await self._call_llm(
            system=full_prompt,
            user_message=message,
            temperature=agent.temperature if agent else 0.4,
            max_tokens=agent.max_tokens if agent else 500,
        )

        # Include citations only if org has citations enabled
        citations = rag_citations if getattr(self.org, "show_rag_citations", False) else []

        # ── Mem0: store turn for future context ───────────────────────────────
        if mem0 and session_id and session_id != "new":
            try:
                mem0.add([
                    {"role": "user",      "content": message},
                    {"role": "assistant", "content": reply},
                ], user_id=session_id)
            except Exception as e:
                logger.warning("mem0.add_failed", error=str(e))

        return {
            "reply": reply,
            "agent": target_slug,
            "intent": intent,
            "rag_hit": rag_hit,
            "citations": citations,
        }

    async def _run_mcp_tools(self, message: str, agent_slug: str) -> str:
        """
        Let the LLM decide which MCP tools to call based on the message,
        execute them, and return formatted context string.
        """
        from app.services.llm_service import llm_service as llm
        import json

        tools = self.mcp_server.tool_definitions()
        if not tools:
            return ""

        # Ask LLM if any tool should be called
        tool_decision = await llm.generate_with_fallback(
            messages=[{"role": "user", "content": message}],
            system_prompt=(
                "You decide whether to call a data tool to answer the user's question. "
                "If the user is asking about an order, call the appropriate tool with the order ID. "
                "If no tool is needed, respond with: {\"call\": null}\n"
                f"Available tools: {json.dumps([t['function']['name'] for t in tools])}\n"
                "Respond ONLY with JSON: {\"call\": \"tool_name\", \"args\": {\"id\": \"<value>\"}} or {\"call\": null}"
            ),
            temperature=0.1,
            max_tokens=100,
        )

        if not tool_decision:
            return ""

        try:
            content = tool_decision["content"].strip()
            if content.startswith("```"):
                content = content.split("```")[1].lstrip("json").strip()
            decision = json.loads(content)
            if not decision.get("call"):
                return ""

            result = await self.mcp_server.call_tool(decision["call"], decision.get("args", {}))
            if result.get("error"):
                return f"Data lookup failed: {result['error']}"

            records = result.get("records", [])
            if not records:
                return "No matching orders found in the system."

            return json.dumps(records, indent=2)
        except Exception as e:
            logger.warning("MCP tool decision parse failed", error=str(e))
            return ""

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _triage(self, message: str) -> tuple[str, str]:
        """Use the LLM to classify intent and pick the best active agent slug."""
        from app.services.llm_service import llm_service as llm

        specialists = self.active_agents
        if not specialists:
            return "general", "general"

        agent_descs = "\n".join(
            f"- {slug}: {agent.description or agent.name}"
            for slug, agent in specialists.items()
        )
        slugs = list(specialists.keys())

        triage_prompt = (
            "You are a triage classifier. Given the customer message and "
            "available agents, respond with JSON only:\n"
            '{"agent": "<slug>", "intent": "<short_label>"}\n\n'
            f"Available agents:\n{agent_descs}"
        )

        try:
            result = await llm.generate_with_fallback(
                messages=[{"role": "user", "content": message}],
                system_prompt=triage_prompt,
                temperature=0.1,
                max_tokens=60,
            )
            raw = result["content"] if result else ""
            data = json.loads(raw.strip())
            slug = data.get("agent", "")
            intent = data.get("intent", "general")
            if slug in specialists:
                return slug, intent
        except Exception as e:
            logger.warning("dynamic_triage.primary_failed", error=str(e))

        # Retry with a simpler forced-choice prompt (handles malformed JSON from primary)
        try:
            result = await llm.generate_with_fallback(
                messages=[{"role": "user", "content": message}],
                system_prompt=(
                    f"Pick the single best agent for this message from: {slugs}. "
                    "Reply with only the agent slug, nothing else."
                ),
                temperature=0.0,
                max_tokens=20,
            )
            slug = (result["content"] if result else "").strip().lower()
            if slug in specialists:
                return slug, "general"
        except Exception as e:
            logger.warning("dynamic_triage.retry_failed", error=str(e))

        # Final fallback: first available specialist
        return next(iter(specialists)), "general"

    async def _compose_system_prompt(self, agent: Optional[Any]) -> str:
        """
        Build full system prompt in priority order:
          1. base_prompt   — platform guardrails (set by super admin, hidden from org)
          2. system_prompt — org customisation (editable by org)
          3. PromptSkill fragments — instruction / format types
        """
        if not agent:
            return "You are a helpful support assistant."

        parts = []

        # 1. Base guardrail prompt (always first, non-negotiable)
        if agent.base_prompt and agent.base_prompt.strip():
            parts.append(agent.base_prompt.strip())

        # 2. Org-customised prompt (falls back to generic if empty)
        org_prompt = (agent.system_prompt or "").strip()
        if org_prompt:
            parts.append(org_prompt)
        elif not parts:
            parts.append("You are a helpful support assistant.")

        # 3. PromptSkill fragments
        if agent.skills_list:
            from app.core.database import AsyncSessionLocal
            from app.models.space import PromptSkill
            from sqlalchemy import select

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(PromptSkill).where(
                        PromptSkill.id.in_(agent.skills_list),
                        PromptSkill.active == True,
                    )
                )
                skills = result.scalars().all()

            for skill in skills:
                if skill.skill_type == "instruction":
                    parts.append(f"\nINSTRUCTION: {skill.prompt_text}")
                elif skill.skill_type == "format":
                    parts.append(f"\nFORMAT: {skill.prompt_text}")
                # "context" — prepended to user message (handled in _call_llm)
                # "rag_filter" — handled via rag_doc_types

        return "\n\n".join(parts)

    async def _fetch_rag_context(
        self,
        message: str,
        doc_types: list[str],
        top_k: int,
        kb_ids: list[str] | None = None,
    ) -> tuple[str, bool, list[dict]]:
        """Query ChromaDB for relevant chunks across the agent's doc types and/or KB doc_ids.

        Returns (context_text, rag_hit, citations)
        where citations is a list of {filename, page, section, score, excerpt}.
        """
        try:
            from app.rag.vector_store import get_vector_store, client_doc_type_where, client_where, COLLECTION_CLIENT
            from app.orchestra.ai.rag.vectorstore_rag import _resolve_kb_doc_ids

            store = get_vector_store()
            client_id = str(self.org.id)   # always org UUID — immutable, never changes
            all_hits: list[dict] = []

            for doc_type in doc_types:
                where = client_doc_type_where(client_id, doc_type)
                hits = store.query(
                    collection=COLLECTION_CLIENT,
                    query_text=message,
                    top_k=top_k,
                    where=where,
                )
                all_hits.extend(hits)

            if kb_ids:
                doc_ids = await _resolve_kb_doc_ids(kb_ids)
                for doc_id in doc_ids:
                    where = client_where(client_id, doc_id=doc_id)
                    hits = store.query(
                        collection=COLLECTION_CLIENT,
                        query_text=message,
                        top_k=top_k,
                        where=where,
                    )
                    all_hits.extend(hits)

            if not all_hits:
                return "", False, []

            # Sort by score, deduplicate, take top_k
            all_hits.sort(key=lambda h: h["score"], reverse=True)
            seen, chunks, citations = set(), [], []
            for h in all_hits:
                if h["id"] not in seen:
                    seen.add(h["id"])
                    chunks.append(h["document"])
                    meta = h.get("metadata") or {}
                    citations.append({
                        "filename": meta.get("filename") or meta.get("doc_name") or "Unknown",
                        "page":     meta.get("page", 0),
                        "section":  meta.get("section", ""),
                        "score":    round(h["score"], 3),
                        "excerpt":  h["document"][:200],
                    })
                if len(chunks) >= top_k:
                    break

            context = "\n---\n".join(chunks)
            return context, True, citations

        except Exception as e:
            logger.warning("dynamic_executor.rag_error", error=str(e))
            return "", False, []

    async def _call_llm(
        self,
        system: str,
        user_message: str,
        temperature: float,
        max_tokens: int,
    ) -> str:
        """Call the configured LLM and return the text response."""
        try:
            from app.services.llm_service import llm_service
            result = await llm_service.generate_with_fallback(
                messages=[{"role": "user", "content": user_message}],
                system_prompt=system,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return result["content"] if result else "I'm sorry, I'm unable to process your request right now."
        except Exception as e:
            logger.error("dynamic_executor.llm_error", error=str(e))
            return "I'm sorry, I encountered an error processing your request. Please try again."
