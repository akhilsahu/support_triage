"""
Support Escalation Workflow — second Agno Workflow example.

Triggered when the chat pipeline cannot resolve a customer issue:
  - RAG returned no hits after N turns
  - Customer explicitly asks for human
  - Sentiment analysis detects high frustration

Steps:
  Step 1: summarise_conversation  — condense the chat history into a ticket summary
  Step 2: classify_urgency        — assign priority (low / medium / high / critical)
  Step 3: draft_agent_brief       — write a brief for the human agent taking over
  Step 4: (future) create_ticket  — POST to ticketing system via MCP/datasource

Separation from chat pipeline:
  - NOT called from customer.py — called from a dedicated escalation trigger
  - Can be triggered by: sentiment score threshold, keyword detection, explicit request
  - Intended to run as a background task (FastAPI BackgroundTasks or Celery)

Future wiring in customer.py:
    if should_escalate(result):
        from fastapi import BackgroundTasks
        background_tasks.add_task(
            run_escalation_workflow,
            session_id=session_id,
            space_id=org.id,
            history=conversation_history,
        )
"""

from __future__ import annotations
from typing import List, Optional
import structlog

logger = structlog.get_logger()


async def run_escalation_workflow(
    session_id: str,
    space_id: str,
    org_name: str,
    history: List[dict],
    customer_id: Optional[str] = None,
) -> dict:
    """
    Main entry point — runs the full escalation workflow asynchronously.

    Args:
        session_id:   Chat session UUID (for logging / ticket linking)
        space_id:       str(org.id)
        org_name:     Space display name
        history:      List of {"role": "user"|"assistant", "content": str}
        customer_id:  Optional customer identifier

    Returns:
        dict with keys: summary, urgency, agent_brief, ticket_id (future)
    """
    try:
        from agno.agent import Agent
        from agno.team import Team, TeamMode
    except ImportError:
        logger.warning("agno not installed — escalation workflow unavailable")
        return {"error": "agno not installed"}

    from app.orchestra.ai.core.config import build_config
    from app.orchestra.ai.factories.llm import LLMFactory

    cfg   = build_config()
    model = LLMFactory(cfg).build()

    # Format conversation history for context
    history_text = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in history[-20:]  # last 20 turns
    )

    # ── Step agents ───────────────────────────────────────────────────────────

    summariser = Agent(
        name="Conversation Summariser",
        model=model,
        instructions=(
            "Summarise a customer support conversation into a concise ticket summary. "
            "Include: the customer's core issue, what was tried, what failed. "
            "Max 100 words. Output plain text."
        ),
    )

    urgency_classifier = Agent(
        name="Urgency Classifier",
        model=model,
        instructions=(
            "Classify the urgency of a support issue as one of: low | medium | high | critical. "
            "Criteria — critical: financial loss or system down; high: blocked workflow; "
            "medium: degraded experience; low: general question. "
            "Output JSON: {\"urgency\": \"<level>\", \"reason\": \"<one line>\"}"
        ),
    )

    brief_writer = Agent(
        name="Agent Brief Writer",
        model=model,
        instructions=(
            "Write a brief handover note for the human support agent taking over this case. "
            "Include: issue summary, urgency, what the AI already tried, suggested next steps. "
            "Be direct. Max 150 words."
        ),
    )

    # ── Coordinate team ───────────────────────────────────────────────────────

    escalation_team = Team(
        name="Escalation Team",
        mode=TeamMode.coordinate,
        model=model,
        members=[summariser, urgency_classifier, brief_writer],
        instructions=(
            "Process a support escalation. "
            "Step 1: summarise the conversation. "
            "Step 2: classify urgency. "
            "Step 3: write a human agent brief. "
            "Return all three as a structured report."
        ),
    )

    prompt = (
        f"Org: {org_name}\n"
        f"Session: {session_id}\n"
        f"Customer: {customer_id or 'unknown'}\n\n"
        f"Conversation:\n{history_text}"
    )

    logger.info(
        "escalation_workflow.start",
        session_id=session_id,
        space_id=space_id,
        turns=len(history),
    )

    try:
        response = await escalation_team.arun(prompt)
        content  = response.content if hasattr(response, "content") else str(response)

        logger.info("escalation_workflow.complete", session_id=session_id)

        return {
            "session_id":   session_id,
            "space_id":       space_id,
            "agent_brief":  content,
            "ticket_id":    None,   # populated when ticketing MCP is wired
        }

    except Exception as e:
        logger.error("escalation_workflow.error", session_id=session_id, error=str(e))
        return {"error": str(e), "session_id": session_id}


def should_escalate(result: dict, turn_count: int = 0) -> bool:
    """
    Heuristic to decide if a chat result warrants escalation.
    Called in customer.py after executor.run() returns.

    Triggers escalation if:
      - RAG returned no hit AND this is the 3rd+ turn (persistent failure)
      - Reply contains explicit escalation phrases
      - (future) sentiment score from empathy engine exceeds threshold
    """
    if not result.get("rag_hit") and turn_count >= 3:
        return True

    reply = (result.get("reply") or "").lower()
    escalation_phrases = [
        "contact our support team",
        "speak to a human",
        "reach out directly",
        "call us",
    ]
    return any(phrase in reply for phrase in escalation_phrases)
