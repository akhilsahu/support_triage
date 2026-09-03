"""
triage_prompt_generator.py — Auto-generates structured Triage System Prompts
& Domain Taxonomies for Chatbots based on their underlying Specialist Agents & Knowledge Bases.

Usage via Code:
    from app.utils.ai.triage_prompt_generator import generate_triage_prompt_for_chatbot

    result = await generate_triage_prompt_for_chatbot(db, chatbot_id)

Usage via CLI:
    ./.venv/bin/python -m app.utils.ai.triage_prompt_generator --chatbot-id <UUID>
"""

import argparse
import asyncio
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID
import structlog
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.chatbot import Chatbot
from app.models.space import (
    SpaceBuiltinAgentConfig,
    BuiltinAgentCatalog,
    CustomAgent,
    ChatbotCustomAgent,
)
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseItem, AgentKnowledgeBase


from app.services.llm_service import llm_service

logger = structlog.get_logger()


_META_PROMPT_SYSTEM = """You are an expert AI Prompt Engineer and Multi-Agent Systems Architect.

Your task is to analyze an organization's chatbot configuration, its specialist agents, and their linked knowledge base documents, and synthesize a master Triage System Prompt for the Chatbot's Team Leader / Triage Router.

Follow these 5 meta-analysis steps to synthesize system prompts for ANY unknown document domain (Education, Healthcare, Real Estate, E-Commerce, SaaS, Financial Services, Legal, etc.):

1. META-STEP 1 (Domain & Persona Discovery): Infer the industry, brand identity, and customer intent scope from the uploaded KB summaries.
2. META-STEP 2 (Taxonomy & Entity Mapping): Extract structural entity tiers, product variants, service levels, or policy classes present in the documents (e.g. Grade/Class tiers, Base vs Rider plans, Card/Product variants).
3. META-STEP 3 (Domain 360° Overview Dimensions): Determine what constitutes a complete 360° overview for THIS domain (Executive Summary, Fee/Pricing Table, Welcome/Included Perks, Feature Matrix, Milestones, Exclusions).
4. META-STEP 4 (Restriction & Penalty Clause Discovery): Identify explicit non-eligible items, restricted categories, penalty fees, waiting periods, or exclusion codes (e.g. non-refundable fees, MCC codes, excluded pre-existing conditions).
5. META-STEP 5 (Runtime SOP Synthesis): Output a structured 3-part Markdown prompt containing a 5-step execution protocol for the target agent.

The generated prompt MUST be structured cleanly into 3 distinct sections using GitHub-flavored Markdown:

# 1. Chatbot Role & Scope
- State the chatbot persona, brand identity, and high-level responsibilities.
- Define what user intents are supported vs out-of-scope.
- IMPORTANT: Do NOT mark "contact customer support", "complaints", "working hours", or similar meta/operational queries as out-of-scope. These must be delegated to the closest specialist who may have this information in their knowledge base.

# 2. Specialist Agent Routing Directory
- List every available Specialist Agent (using its exact name and slug).
- Define precise routing criteria and intent triggers specifying when to delegate user messages to each specialist.
- Include a **Fallback Routing Rule**: Any query that does not clearly match a specific specialist (meta/operational queries, contact info, complaints, hours, general inquiries) MUST be routed to the specialist with the broadest or most relevant scope. The triage agent must NEVER answer such queries directly.

# 3. Domain Taxonomy & Disambiguation Guardrails
- Automatically extract domain-specific entity rules and taxonomy boundaries from the knowledge base summaries.
- **Ambiguous Query & Clarification Rule**: Instruct the agent that when a customer asks a general or ambiguous question that applies to multiple products, plans, or policies in the knowledge base, it MUST call the `ask_user` tool immediately to present a choice of available options rather than guessing.
- **Ambiguous Product Reference Rule**: Instruct the agent that when the customer uses non-specific references like "my card", "my plan", "my policy", or "my account" without naming the exact product, and multiple specialists exist covering different variants — it MUST call the `ask_user` tool to let the customer select which product/card they hold before routing. Never guess which product the customer holds.
- **Strict Numerical Preservation**: Instruct the agent that when quoting fees, pricing schedules, interest rates, or percentages, it MUST quote exact figures verbatim for each specific variant without cross-contaminating figures.
- **Rich Visual Formatting**: Instruct the agent to ALWAYS present fees, rates, charges, or comparisons in clean Markdown Tables or via `render_table` / `render_cards` tools instead of plain bullet walls.
- **360° Comprehensive Product/Policy Overview**: Instruct the agent that when asked for key features, details, or an overview of a specific entity (product/plan/policy/grade), it MUST provide a complete 360-degree overview (Executive Summary, Fee/Pricing Table, Welcome/Included Perks, Feature Matrix, Milestones, Excluded Rules, and Perks) in one response.
- **Restriction & Exclusion Verification**: Instruct the agent that when asked about benefits, coverage, or refunds on a specific item or category, it MUST check explicit non-eligible transaction rules, cite specific restriction codes or clause references (e.g. MCC 5094/5944 for Jewelry, Policy Clause 13.1, Non-refundable Deposit Clause), and state clearly if a category is excluded (0% benefit / non-eligible).
- **Runtime Step-by-Step SOP Protocol**: Instruct the agent to follow a sequential 5-step retrieval protocol: (1) Intent & Entity Parsing, (2) Multi-Angle Search, (3) Exclusion & Code Verification, (4) Structured Layout Assembly, (5) Completeness Audit.

The generated prompt MUST end with this exact block (do not paraphrase it):
CRITICAL REMINDER: You are a ROUTER ONLY. You must NEVER generate a customer-facing answer under any circumstances — not for greetings, not for meta questions, not for off-topic queries, not for anything. Every single message must result in a delegation to a specialist or a clarifying ask_user call. There are absolutely no exceptions.

Be clear, authoritative, and concise. Output ONLY the 3-part Markdown prompt text without meta-commentary."""









async def generate_triage_prompt_for_chatbot(
    db: Any,
    chatbot_id: UUID,
    save_to_db: bool = True,
) -> Dict[str, Any]:
    """
    Analyzes all Specialist Agents and Knowledge Bases linked to a Chatbot
    and auto-generates a structured 3-part Triage System Prompt.
    """
    # 1. Fetch Chatbot
    res_cb = await db.execute(select(Chatbot).where(Chatbot.id == chatbot_id))
    chatbot = res_cb.scalars().first()
    if not chatbot:
        raise ValueError(f"Chatbot with id '{chatbot_id}' not found.")

    # 2. Fetch linked Custom / Specialist Agents
    res_agents = await db.execute(
        select(CustomAgent)
        .join(ChatbotCustomAgent, ChatbotCustomAgent.agent_id == CustomAgent.id)
        .options(
            selectinload(CustomAgent.knowledge_bases).selectinload(AgentKnowledgeBase.kb).selectinload(KnowledgeBase.items),
        )
        .where(
            ChatbotCustomAgent.chatbot_id == chatbot_id,
            CustomAgent.active == True,
        )
    )
    specialist_agents = list(res_agents.scalars().all())

    # 3. Build Metadata Inventory for Meta-Prompt LLM Call
    inventory_parts = [
        f"Chatbot Display Name: {chatbot.display_name}",
        f"Chatbot Description: {chatbot.description or 'N/A'}",
        f"Total Active Specialist Agents: {len(specialist_agents)}\n",
        "--- SPECIALIST AGENTS & KNOWLEDGE BASE INVENTORY ---",
    ]

    all_kb_ids = set()

    if not specialist_agents:
        inventory_parts.append("No active specialist agents linked. Chatbot operates in general support mode.")
    else:
        for idx, agent in enumerate(specialist_agents, 1):
            agent_text = (
                f"\nSpecialist Agent {idx}: {agent.name} (slug: '{agent.slug}')\n"
                f"Description: {agent.description or 'General specialist'}\n"
                f"Configured Topics: {agent.topics or 'All linked topics'}\n"
                f"Configured Keywords: {agent.keywords_list}\n"
            )
            
            kb_summaries = []
            for agent_kb in (agent.knowledge_bases or []):
                kb = agent_kb.kb
                if not kb:
                    continue
                all_kb_ids.add(str(kb.id))
                item_details = []
                for item in (kb.items or [])[:10]:   # sample top 10 items
                    item_details.append(
                        f"  - [{item.item_type.upper()}] Title: '{item.title or item.doc_id}', "
                        f"Topic: '{item.topic or 'ungrouped'}', Label: '{item.doc_label or 'N/A'}'\n"
                        f"    Summary: {item.description or 'No description'}"
                    )

                kb_summaries.append(
                    f" Knowledge Base: '{kb.name}' (default_topic: '{kb.default_topic or 'None'}')\n"
                    f" Description: {kb.description or 'N/A'}\n"
                    f" Items:\n" + ("\n".join(item_details) if item_details else "  (No items)")
                )


            if kb_summaries:
                agent_text += " Linked Knowledge Bases:\n" + "\n".join(kb_summaries)
            else:
                agent_text += " Linked Knowledge Bases: None\n"
            
            inventory_parts.append(agent_text)

    full_inventory = "\n".join(inventory_parts)

    logger.info(
        "triage_prompt_generator.starting",
        chatbot_id=str(chatbot_id),
        specialists=len(specialist_agents),
        kbs=len(all_kb_ids),
    )

    # 4. Invoke LLM to Synthesize Prompt
    user_prompt = (
        f"Organization Chatbot Inventory & Knowledge Base Metadata:\n\n"
        f"{full_inventory[:12000]}\n\n"
        "Generate the master 3-part Triage System Prompt following the system instructions."
    )

    llm_res = await llm_service.generate_with_fallback(
        messages=[{"role": "user", "content": user_prompt}],
        system_prompt=_META_PROMPT_SYSTEM,
        temperature=0.2,
        max_tokens=1500,
    )

    if not llm_res or not llm_res.get("content"):
        raise RuntimeError("LLM service failed to generate triage prompt.")

    generated_prompt = llm_res["content"].strip()

    # 5. Optionally Save directly to SpaceBuiltinAgentConfig (Triage Agent)
    triage_cfg = None
    if save_to_db:
        res_triage = await db.execute(
            select(SpaceBuiltinAgentConfig)
            .join(BuiltinAgentCatalog, SpaceBuiltinAgentConfig.catalog_id == BuiltinAgentCatalog.id)
            .where(
                SpaceBuiltinAgentConfig.chatbot_id == chatbot_id,
                SpaceBuiltinAgentConfig.enabled == True,
                BuiltinAgentCatalog.platform_enabled == True,
                BuiltinAgentCatalog.agent_type == "triage",
            )
        )
        triage_cfg = res_triage.scalars().first()
        if triage_cfg:
            triage_cfg.system_prompt = generated_prompt
            await db.commit()
            await db.refresh(triage_cfg)
            
            # Invalidate session pool cache so active sessions pick up the new triage prompt immediately
            try:
                from app.orchestra.ai.session.pool import pool as _pool
                cache_key = f"{chatbot.space_id}:{chatbot_id}:triage"
                _pool.invalidate(cache_key)
            except Exception:
                pass

    logger.info(
        "triage_prompt_generator.completed",
        chatbot_id=str(chatbot_id),
        saved_to_db=bool(triage_cfg),
        prompt_len=len(generated_prompt),
    )

    return {
        "status": "success",
        "chatbot_id": str(chatbot_id),
        "triage_config_id": str(triage_cfg.id) if triage_cfg else None,
        "generated_prompt": generated_prompt,
        "specialist_agent_count": len(specialist_agents),
        "kb_count": len(all_kb_ids),
    }


async def generate_prompt_for_specialist_agent(
    db: Any,
    agent_id: UUID,
    save_to_db: bool = True,
) -> Dict[str, Any]:
    """
    Analyzes a single Custom / Specialist Agent's linked Knowledge Bases
    and auto-generates a domain-focused Specialist System Prompt.
    """
    res_agent = await db.execute(
        select(CustomAgent)
        .options(
            selectinload(CustomAgent.knowledge_bases).selectinload(AgentKnowledgeBase.kb).selectinload(KnowledgeBase.items),
        )
        .where(CustomAgent.id == agent_id)
    )

    agent = res_agent.scalars().first()
    if not agent:
        raise ValueError(f"CustomAgent with id '{agent_id}' not found.")

    kb_details = []
    for agent_kb in (agent.knowledge_bases or []):
        kb = agent_kb.kb
        if not kb:
            continue
        items_str = "\n".join([
            f"  - [{it.item_type}] {it.title or it.doc_id}: {it.description or 'N/A'}"
            for it in (kb.items or [])[:12]
        ])
        kb_details.append(f"Knowledge Base: {kb.name}\nDescription: {kb.description}\nItems:\n{items_str}")

    prompt_context = (
        f"Agent Name: {agent.name} (slug: {agent.slug})\n"
        f"Description: {agent.description}\n"
        f"Topics: {agent.topics}\n"
        f"Keywords: {agent.keywords_list}\n\n"
        f"Linked Knowledge:\n" + ("\n\n".join(kb_details) if kb_details else "No linked KBs.")
    )

    system_instr = (
        "You are an expert prompt engineer. Generate a clear, concise system prompt for a specialist customer support AI agent. "
        "Define its role, domain boundary, and retrieval instructions based on the knowledge provided. Return ONLY the Markdown prompt."
    )

    llm_res = await llm_service.generate_with_fallback(
        messages=[{"role": "user", "content": prompt_context[:8000]}],
        system_prompt=system_instr,
        temperature=0.2,
        max_tokens=800,
    )

    if not llm_res or not llm_res.get("content"):
        raise RuntimeError("LLM service failed to generate specialist prompt.")

    generated_prompt = llm_res["content"].strip()

    if save_to_db:
        agent.system_prompt = generated_prompt
        await db.commit()
        await db.refresh(agent)

    return {
        "status": "success",
        "agent_id": str(agent_id),
        "generated_prompt": generated_prompt,
    }


# ── CLI Entrypoint ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Auto-generate AI Triage or Specialist Agent System Prompts.")
    parser.add_argument("--chatbot-id", type=str, help="UUID of the chatbot to generate Triage Prompt for")
    parser.add_argument("--agent-id", type=str, help="UUID of the specialist agent to generate prompt for")
    args = parser.parse_args()

    async def _main():
        from app.core.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            if args.chatbot_id:
                res = await generate_triage_prompt_for_chatbot(db, UUID(args.chatbot_id))
                print("\n=== GENERATED TRIAGE SYSTEM PROMPT ===")
                print(res["generated_prompt"])
            elif args.agent_id:
                res = await generate_prompt_for_specialist_agent(db, UUID(args.agent_id))
                print("\n=== GENERATED SPECIALIST SYSTEM PROMPT ===")
                print(res["generated_prompt"])
            else:
                print("Please specify --chatbot-id <UUID> or --agent-id <UUID>")

    asyncio.run(_main())
