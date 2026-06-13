"""
OrchestraSupport Chatbot-Level Orchestration PoC  [DEPRECATED]

This module has been superseded by the agno-based orchestrator:
    app/orchestra/ai/orchestrators/agno.py  ← production path
    app/orchestra/ai/run.py                 ← interactive demo

A copy is preserved in app/orchestra/legacy/poc.py for reference.
This file is kept here only so existing imports don't break during migration.

DO NOT add new features here.
"""

import sys
from pathlib import Path

# Add project root to path to ensure app imports resolve when run as script
sys.path.append(str(Path(__file__).resolve().parents[2]))

import asyncio
import uuid
import time
from typing import Dict, Any, List, Optional
import structlog
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal, check_db_connection
from app.models.space import (
    Space, PromptSkill, ConversationLog,
    BuiltinAgentCatalog, SpaceBuiltinAgentConfig, CustomAgent, ChatbotCustomAgent
)
from app.models.chatbot import Chatbot
from app.models.chat import ChatSession
from app.agents.resolved_agent import ResolvedAgent
from app.services.llm_service import llm_service
from app.rag.vector_store import get_vector_store, client_where, COLLECTION_CLIENT
from app.core.redis import redis_client

logger = structlog.get_logger()


class ChatbotOrchestrator:
    """PoC Orchestrator executing dynamic agent grid at the Chatbot session tier."""

    def __init__(self, db_session, chatbot_id: uuid.UUID):
        self.db = db_session
        self.chatbot_id = chatbot_id
        self.chatbot: Optional[Chatbot] = None
        self.org: Optional[Space] = None
        self.active_agents: Dict[str, ResolvedAgent] = {}

    async def initialize(self) -> bool:
        """Load Chatbot, Org, and compile the list of active agents from PostgreSQL."""
        # 1. Fetch Chatbot & Org
        cb_result = await self.db.execute(
            select(Chatbot)
            .options(selectinload(Chatbot.org))
            .where(Chatbot.id == self.chatbot_id, Chatbot.active == True)
        )
        self.chatbot = cb_result.scalar_one_or_none()
        if not self.chatbot:
            logger.error("orchestrator.init_failed", error="Chatbot not found or inactive", chatbot_id=str(self.chatbot_id))
            return False

        self.org = self.chatbot.org
        if not self.org or not self.org.active:
            logger.error("orchestrator.init_failed", error="Parent Space not active", chatbot_id=str(self.chatbot_id))
            return False

        # 2. Fetch Active Builtin Configs (platform enabled & org toggled enabled)
        builtin_res = await self.db.execute(
            select(SpaceBuiltinAgentConfig)
            .options(selectinload(SpaceBuiltinAgentConfig.catalog))
            .join(BuiltinAgentCatalog, SpaceBuiltinAgentConfig.catalog_id == BuiltinAgentCatalog.id)
            .where(
                SpaceBuiltinAgentConfig.chatbot_id == self.chatbot_id,
                BuiltinAgentCatalog.platform_enabled == True,
                SpaceBuiltinAgentConfig.enabled == True,
            )
        )
        builtin_agents = [
            ResolvedAgent.from_builtin(cfg)
            for cfg in builtin_res.scalars().all()
        ]

        # 3. Fetch Active Custom Agents linked to this Chatbot via junction
        custom_res = await self.db.execute(
            select(CustomAgent)
            .options(selectinload(CustomAgent.knowledge_bases))
            .join(ChatbotCustomAgent, ChatbotCustomAgent.agent_id == CustomAgent.id)
            .where(
                ChatbotCustomAgent.chatbot_id == self.chatbot_id,
                CustomAgent.active == True
            )
        )
        custom_agents = [
            ResolvedAgent.from_custom(ca)
            for ca in custom_res.scalars().all()
        ]

        # 4. Map into Active Agent Registry
        all_agents = builtin_agents + custom_agents
        self.active_agents = {a.slug: a for a in all_agents}
        
        logger.info(
            "orchestrator.initialized",
            org=self.org.slug,
            chatbot=self.chatbot.name,
            active_agents=list(self.active_agents.keys())
        )
        return True

    async def execute_chat_turn(
        self,
        message: str,
        session_id: str,
        history: List[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """Execute a single dynamic conversational loop scoped to the Chatbot."""
        t0 = time.time()
        specialists = {s: a for s, a in self.active_agents.items() if s != "triage"}

        # --- Phase 1: Dynamic Triage & Routing ---
        target_slug = "triage"
        intent = "general"
        
        if not specialists:
            # Fallback: No specialists active, general assistant handles it
            logger.info("orchestrator.routing", route="general_fallback", reason="No active specialists configured")
            target_slug = "triage"
            intent = "general"
        elif len(specialists) == 1:
            # BYPASS TRIAGE: Only a single specialist agent is enabled
            agent = next(iter(specialists.values()))
            target_slug = agent.slug
            intent = "direct_specialist"
            logger.info("orchestrator.routing", route=target_slug, reason="Bypassed triage - single specialist active")
        else:
            # Active Multi-Agent Triage routing
            target_slug, intent = await self._run_triage(message, specialists)
            logger.info("orchestrator.routing", route=target_slug, intent=intent, reason="Multi-agent triage completed")

        selected_agent = self.active_agents.get(target_slug)

        # --- Phase 2: Compile Sandboxed Prompts + PromptSkills ---
        system_prompt = await self._compose_system_prompt(selected_agent)

        # --- Phase 3: Scoped Multi-Tenant RAG Ingestion ---
        rag_context = ""
        rag_hit = False
        rag_citations = []

        if selected_agent and selected_agent.rag_enabled:
            # Scoped strictly to org UUID (never slug!)
            client_id = str(self.org.id)
            rag_context, rag_hit, rag_citations = await self._fetch_scoped_rag(
                query=message,
                client_id=client_id,
                agent=selected_agent
            )
            
            # Anti-Hallucination Gate: Return pre-configured grounding fallback if empty RAG hits
            if not rag_hit:
                logger.warn("orchestrator.rag_gate", agent=target_slug, outcome="halted - no matching chunks found")
                return {
                    "reply": (
                        "I am sorry, I could not find relevant information in our knowledge base "
                        "to answer your question. Please contact our support team for further help."
                    ),
                    "agent": target_slug,
                    "intent": intent,
                    "rag_hit": False,
                    "citations": []
                }

        # --- Phase 3b: Scoped Multi-Tenant Tool & MCP Execution ---
        mcp_context = ""
        if selected_agent and selected_agent.slug in ("finance", "logistics"):
            mcp_context = await self._simulate_mcp_tool_call(message, selected_agent.slug)

        # --- Phase 4: Final Sandboxed LLM Polishing ---
        full_system = system_prompt
        if mcp_context:
            full_system += f"\n\nLIVE DATABASE DATA FROM CLIENT SYSTEM:\n{mcp_context}"
        if rag_context:
            full_system += (
                "\n\nVERIFIED SYSTEM CONTEXT (use ONLY this context to formulate your reply):\n"
                + rag_context
                + "\n\nCRITICAL: Base your answer strictly on the VERIFIED SYSTEM CONTEXT above. "
                "Do not reference outside knowledge. If the context does not contain the answer, "
                "state that you do not know."
            )

        # Merge conversation history window
        history_window = (history or [])[-10:]  # cap last 10 turns
        history_window.append({"role": "user", "content": message})

        llm_response = await llm_service.generate_with_fallback(
            messages=history_window,
            system_prompt=full_system,
            temperature=selected_agent.temperature if selected_agent else 0.4,
            max_tokens=selected_agent.max_tokens if selected_agent else 500
        )

        reply_text = llm_response["content"] if llm_response else "System unavailable, please try again."
        elapsed_ms = int((time.time() - t0) * 1000)

        # --- Phase 5: Transactional Database & Cache Logging ---
        await self._log_conversation(
            session_id=session_id,
            user_message=message,
            assistant_reply=reply_text,
            intent=intent,
            agent_slug=target_slug,
            rag_hit=rag_hit,
            elapsed_ms=elapsed_ms
        )

        return {
            "reply": reply_text,
            "agent": target_slug,
            "intent": intent,
            "rag_hit": rag_hit,
            "citations": rag_citations if self.org.show_rag_citations else [],
            "response_ms": elapsed_ms
        }

    # ── Private Helper Operations ─────────────────────────────────────────────

    async def _simulate_mcp_tool_call(self, message: str, agent_slug: str) -> str:
        """Simulates parameter extraction and execution of tenant dynamic REST / MCP APIs."""
        import re
        import json
        
        # 1. Parameter extraction via regex mapping (simulating LLM parameter mapping)
        order_match = re.search(r'ORD-\d+', message.upper())
        tracking_match = re.search(r'TRK-\d+', message.upper())
        
        # 2. Scoped data compilation from dynamic tenant connection mapping
        if agent_slug == "finance":
            order_id = order_match.group(0) if order_match else "ORD-1001"
            # Return normalized mock finance refund data for this specific tenant's order
            records = {
                "source_system": f"Tenant {self.org.display_name} Payment Gateway API",
                "tool_type": "get_refund",
                "order_id": order_id,
                "customer_name": "Valued Customer",
                "amount": 99.99,
                "currency": "USD",
                "status": "eligible",
                "policy_verification": "Qualified under general 30-day refund rules",
                "restocking_fee": "0.00"
            }
            logger.info("orchestrator.tool_call", agent=agent_slug, tool="get_refund", parameters={"order_id": order_id})
            return json.dumps(records, indent=2)
            
        elif agent_slug == "logistics":
            tracking_number = tracking_match.group(0) if tracking_match else "TRK-987654"
            # Return normalized logistics tracking data
            records = {
                "source_system": f"Tenant {self.org.display_name} Carrier SSE MCP Server",
                "tool_type": "get_logistics",
                "tracking_number": tracking_number,
                "status": "In Transit",
                "carrier": "FedEx",
                "current_location": "Distribution Center, Chicago IL",
                "estimated_delivery": "2026-05-28T18:00:00Z",
                "last_update": "2026-05-24T12:00:00Z"
            }
            logger.info("orchestrator.tool_call", agent=agent_slug, tool="get_logistics", parameters={"tracking_number": tracking_number})
            return json.dumps(records, indent=2)
            
        return ""

    async def _run_triage(self, message: str, specialists: Dict[str, ResolvedAgent]) -> tuple[str, str]:
        """Triage classified selection routing."""
        # Fast Keyword/Regex matches first
        msg_lower = message.lower()
        for slug, agent in specialists.items():
            for kw in agent.keywords_list:
                if kw.lower() in msg_lower:
                    return slug, "keyword_match"

        # LLM structured triage routing
        agent_descs = "\n".join(
            f"- {slug}: {agent.description or agent.name}"
            for slug, agent in specialists.items()
        )
        
        triage_system = (
            "You are a triage classifier. Analyze the customer message and select "
            "the best matching active agent slug. Respond ONLY with structured JSON:\n"
            '{"agent": "<slug>", "intent": "<short_label>"}\n\n'
            f"Available agents:\n{agent_descs}"
        )

        try:
            res = await llm_service.generate_with_fallback(
                messages=[{"role": "user", "content": message}],
                system_prompt=triage_system,
                temperature=0.0,
                max_tokens=60
            )
            if res:
                data = json.loads(res["content"].strip())
                slug = data.get("agent", "")
                intent = data.get("intent", "general")
                if slug in self.active_agents:
                    return slug, intent
        except Exception as e:
            logger.warn("orchestrator.triage_fallback", error=str(e))

        # Absolute default fallback
        return next(iter(specialists.keys())), "general_triage_fallback"

    async def _compose_system_prompt(self, agent: Optional[ResolvedAgent]) -> str:
        """Dynamic system prompt assembler resolving guardrails + customizations + skills."""
        if not agent:
            return f"You are a helpful customer support assistant for {self.org.display_name}."

        parts = []
        if agent.base_prompt:
            parts.append(agent.base_prompt.strip())
        if agent.system_prompt:
            parts.append(agent.system_prompt.strip())
        else:
            parts.append(f"You are a helpful support specialist ({agent.name}) for {self.org.display_name}.")

        # Retrieve attached PromptSkills from DB dynamically
        if agent.skills_list:
            skills_res = await self.db.execute(
                select(PromptSkill).where(
                    PromptSkill.id.in_(agent.skills_list),
                    PromptSkill.active == True
                )
            )
            for skill in skills_res.scalars().all():
                parts.append(f"\n[{skill.name.upper()} DIRECTIVE]: {skill.prompt_text}")

        return "\n\n".join(parts)

    async def _fetch_scoped_rag(
        self,
        query: str,
        client_id: str,
        agent: ResolvedAgent
    ) -> tuple[str, bool, list[dict]]:
        """Fetch RAG chunks scoped to client UUID and doc type filters."""
        try:
            store = get_vector_store()
            all_hits = []

            # Determine query scoping: custom agent vs built-in agent doc link parameters
            if not agent.is_builtin:
                # Custom agent: scope strictly to its attached doc_ids list.
                # If no docs are linked, skip RAG — agent has no knowledge base.
                linked_doc_ids = [str(lnk.kb_id) for lnk in (agent.kb_ids or [])]
                if not linked_doc_ids:
                    return "", False, []
                for doc_id in linked_doc_ids:
                    where = client_where(client_id, doc_id=doc_id)
                    hits = store.query(
                        collection=COLLECTION_CLIENT,
                        query_text=query,
                        top_k=agent.rag_top_k,
                        where=where
                    )
                    all_hits.extend(hits)
            else:
                # Builtin agent: scope to standard doc types list using consolidated single query
                from app.rag.vector_store import client_doc_type_where
                for doc_type in agent.rag_doc_types_list:
                    where = client_doc_type_where(client_id, doc_type)
                    hits = store.query(
                        collection=COLLECTION_CLIENT,
                        query_text=query,
                        top_k=agent.rag_top_k,
                        where=where
                    )
                    all_hits.extend(hits)

            if not all_hits:
                return "", False, []

            # Deduplicate, sort by cosine score (cosine distance mapped to similarity)
            all_hits.sort(key=lambda h: h["score"], reverse=True)
            seen_chunks = set()
            chunks = []
            citations = []

            # 0.7 Hard Cosine Grounding Gate Threshold
            for h in all_hits:
                if h["score"] < 0.7:
                    continue
                if h["id"] not in seen_chunks:
                    seen_chunks.add(h["id"])
                    chunks.append(h["document"])
                    meta = h.get("metadata") or {}
                    citations.append({
                        "filename": meta.get("filename") or "Document",
                        "page": meta.get("page", 1),
                        "section": meta.get("section", ""),
                        "score": h["score"],
                        "excerpt": h["document"][:200]
                    })
                if len(chunks) >= agent.rag_top_k:
                    break

            if not chunks:
                return "", False, []

            context = "\n---\n".join(chunks)
            return context, True, citations

        except Exception as e:
            logger.error("orchestrator.rag_failed", error=str(e))
            return "", False, []

    async def _log_conversation(
        self,
        session_id: str,
        user_message: str,
        assistant_reply: str,
        intent: str,
        agent_slug: str,
        rag_hit: bool,
        elapsed_ms: int
    ):
        """Perform transactional Postgres logging + Redis cache TTL extension."""
        try:
            # 1. Update Chat Session
            sess_res = await self.db.execute(
                select(ChatSession).where(ChatSession.id == uuid.UUID(session_id))
            )
            session = sess_res.scalar_one_or_none()
            if session:
                session.agent_slug = agent_slug
                session.message_count = (session.message_count or 0) + 2
                session.last_message_at = datetime.utcnow()

            # 2. Write both turns into Postgres under single atomic transaction
            self.db.add(ConversationLog(
                space_id=self.org.id,
                chatbot_id=self.chatbot_id,
                session_id=session_id,
                role="user",
                message=user_message,
                intent=intent,
                agent_slug=agent_slug,
                rag_hit=rag_hit,
                response_ms=elapsed_ms
            ))
            self.db.add(ConversationLog(
                space_id=self.org.id,
                chatbot_id=self.chatbot_id,
                session_id=session_id,
                role="assistant",
                message=assistant_reply,
                intent=intent,
                agent_slug=agent_slug
            ))
            await self.db.commit()

            # 3. Extend session caching history in Redis
            from app.api.v1.chat_sessions import _history_key, HISTORY_TTL
            await redis_client.expire(_history_key(session_id), HISTORY_TTL)

        except Exception as e:
            await self.db.rollback()
            logger.error("orchestrator.logging_failed", error=str(e))


# ── PoC Simulation Runner ─────────────────────────────────────────────────────

import json
from datetime import datetime

async def simulate_poc():
    """PoC Diagnostic Runner fetching active DB chatbot and executing turns."""
    print("\n=============================================")
    print("🚀 OrchestraSupport Chatbot Orchestrator PoC")
    print("=============================================\n")

    # Connect to PostgreSQL
    is_connected = await check_db_connection()
    if not is_connected:
        print("❌ Cannot connect to PostgreSQL database. Exiting PoC.")
        return

    async with AsyncSessionLocal() as db:
        # Fetch the first active tenant default Chatbot from the DB
        cb_res = await db.execute(
            select(Chatbot).where(Chatbot.active == True, Chatbot.is_default == True).limit(1)
        )
        chatbot = cb_res.scalar_one_or_none()
        if not chatbot:
            print("❌ No active default Chatbot found in the database. Ensure database is seeded.")
            return

        print(f"🎯 Default Chatbot Loaded: {chatbot.name} (ID: {chatbot.id})")
        
        # Instantiate Chatbot Orchestrator
        orchestrator = ChatbotOrchestrator(db, chatbot.id)
        initialized = await orchestrator.initialize()
        if not initialized:
            print("❌ Failed to compile active agent registry for chatbot.")
            return

        # Prepare dummy Session ID and test questions
        session_uuid = str(uuid.uuid4())
        test_questions = [
            "What is your refund policy window?",
            "Where is my shipping packages tracking?",
            "Can you tell me how to resolve account login?"
        ]

        # Create dummy session row for transactional logging
        try:
            db.add(ChatSession(
                id=uuid.UUID(session_uuid),
                space_id=orchestrator.org.id,
                chatbot_id=chatbot.id,
                title="Simulation PoC Chat Session",
                status="open",
                message_count=0
            ))
            await db.commit()
        except Exception as e:
            await db.rollback()
            print(f"⚠️ Failed to seed test ChatSession row: {e}")

        # Run conversations
        conversation_history = []
        for question in test_questions:
            print(f"\n👤 Customer Question: \"{question}\"")
            print("🤖 Orchestrating agents...")
            
            result = await orchestrator.execute_chat_turn(
                message=question,
                session_id=session_uuid,
                history=conversation_history
            )
            
            print(f"🏷️  Resolved Routing Agent Slug: [{result['agent']}] (Intent: '{result['intent']}')")
            print(f"🔍 RAG Grounding Hit: {result['rag_hit']} (Citations: {len(result['citations'])})")
            print(f"⏱️  Orchestrator Latency: {result['response_ms']} ms")
            print(f"💬 Assistant Response:\n{result['reply']}")
            print("-" * 50)
            
            # Save turns
            conversation_history.append({"role": "user", "content": question})
            conversation_history.append({"role": "assistant", "content": result["reply"]})

        print("\n🎉 Chatbot-Tier Orchestration PoC Execution Completed.")


if __name__ == "__main__":
    # Run PoC simulation loop
    asyncio.run(simulate_poc())
