"""Chat API endpoints for UI integration"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict
from datetime import datetime
import uuid
import re
import structlog

from app.mock.users import MOCK_USERS
from app.mock.products import search_products, get_product, CATEGORIES
from app.agents.empathy_engine import get_empathy_engine
from app.agents.triage_agent import TriageAgent
from app.agents.finance_agent import FinanceAgent
from app.agents.logistics_agent import LogisticsAgent
from app.agents.order_agent import get_order_agent
from app.agents.support_agent import get_support_agent
from app.services.llm_service import llm_service

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1", tags=["chat"])

# ── Conversation State (in-memory) ───────────────────────────────────────────
# Keys: awaiting_identifier, user, pending_intent, pending_routing, last_intent, history
conversation_state: Dict[str, dict] = {}



def _extract_identifier(message: str) -> Optional[str]:
    """Extract phone number or user ID from message."""
    # Search on original message (don't strip spaces — breaks word boundaries)
    # Longest digit sequence first
    all_numbers = re.findall(r'\d+', message.replace("-", "").replace(" ", ""))
    for num in sorted(all_numbers, key=len, reverse=True):
        if len(num) >= 4:
            return num
    return None


def _lookup_user(identifier: str) -> Optional[dict]:
    """Look up user by phone/ID (last 7 digits match)."""
    clean = identifier.replace("-", "").replace(" ", "")
    for key, user in MOCK_USERS.items():
        if clean.endswith(key) or key.endswith(clean):
            return user
    return None


def _format_order(o: dict) -> str:
    return (
        f"• **{o['order_id']}** — {o['item']}\n"
        f"  Status: **{o['status']}**  |  {o['carrier']} `{o['tracking']}`\n"
        f"  Estimated delivery: {o['estimated_delivery']}  |  {o['total']}"
    )


def _build_order_list(user: dict) -> str:
    orders = user["orders"]
    if not orders:
        return "I don't see any orders on your account."
    lines = [f"Here are the orders for **{user['name']}**:\n"]
    for o in orders:
        lines.append(_format_order(o))
    return "\n\n".join(lines)


def _build_shipping_status(user: dict, message: str) -> str:
    orders = user["orders"]
    msg = message.lower()
    for o in orders:
        if o["order_id"].lower() in msg:
            return f"Here's the status for your order:\n\n{_format_order(o)}"
    # Return latest in-transit, else most recent
    for o in orders:
        if o["status"] == "In Transit":
            return f"Here's the status of your most recent active order:\n\n{_format_order(o)}"
    return f"Here's your most recent order:\n\n{_format_order(orders[0])}"


def _build_refund_response(user: dict) -> str:
    refunds = user.get("refunds", [])
    if not refunds:
        return "I don't see any refund requests on your account. Would you like to initiate one?"
    r = refunds[0]
    return (
        f"Here's your latest refund:\n\n"
        f"• **Refund ID:** {r['refund_id']}  (Order: {r['order_id']})\n"
        f"• **Amount:** {r['amount']}  |  **Status:** {r['status']}\n"
        f"• **Reason:** {r['reason']}  |  Processed: {r['processed_on']}"
    )


def _needs_identifier(intent: str) -> bool:
    return intent in ("shipping", "delivery", "tracking", "refund", "credit", "compensation", "account", "product_issue")


_AFFIRMATIVE = {"yes", "yeah", "yep", "sure", "ok", "okay", "please", "show", "yup", "go ahead", "do it"}
_FOLLOWUP_ORDER = {"previous", "older", "earlier", "before", "past", "more", "others", "rest", "all", "list"}

def _is_affirmative(msg: str) -> bool:
    return msg.strip().lower().rstrip("?.!") in _AFFIRMATIVE

def _is_followup_orders(msg: str) -> bool:
    lower = msg.lower()
    return any(w in lower for w in _FOLLOWUP_ORDER)


def _generate_response(intent: str, message: str, sentiment_score: float, user: Optional[dict] = None) -> str:
    if user and intent in ("shipping", "delivery", "tracking"):
        msg = message.lower()
        if any(w in msg for w in ("list", "all", "previous", "history", "orders")):
            body = _build_order_list(user)
        else:
            body = _build_shipping_status(user, message)
    elif user and intent in ("refund", "credit", "compensation"):
        body = _build_refund_response(user)
    elif user and intent == "account":
        orders = user["orders"]
        total = sum(float(o["total"].replace("$", "")) for o in orders)
        body = (
            f"Here's your account summary:\n\n"
            f"• **Name:** {user['name']}\n"
            f"• **Email:** {user['email']}\n"
            f"• **Total orders:** {len(orders)}  |  **Total spent:** ${total:.2f}"
        )
    elif user and intent == "product_issue":
        orders = user["orders"]
        latest = orders[0] if orders else None
        if latest:
            body = (
                f"I'm sorry about the product issue. I've flagged order **{latest['order_id']}** "
                f"({latest['item']}) for a quality review. A specialist will follow up within 24 hours."
            )
        else:
            body = "I'm sorry about the product issue. A specialist will follow up within 24 hours."
    else:
        body = (
            "I'm here to help! You can ask me about:\n\n"
            "• **Order status** — \"Where is my order?\"\n"
            "• **All orders** — \"List my orders\"\n"
            "• **Refunds** — \"What's my refund status?\"\n"
            "• **Account info** — \"Show my account\""
        )

    if sentiment_score < 0.3:
        return f"I'm sorry you're having a frustrating experience. {body}\n\nThis has been marked **high priority**."
    elif sentiment_score < 0.6:
        return f"Thank you for reaching out. {body}"
    return body


# ── Agent Hand-off ───────────────────────────────────────────────────────────

async def _hand_off(
    routing: str,
    intent: str,
    message: str,
    sentiment_score: float,
    user: Optional[dict],
    conversation_id: str,
) -> str:
    ticket_id = f"TKT-{conversation_id[:8].upper()}"

    if routing == "finance" and user:
        order = user["orders"][0] if user["orders"] else None
        try:
            if intent in ("refund", "compensation"):
                decision = await finance_agent.process_refund_request(
                    ticket_id=ticket_id,
                    order_id=order["order_id"] if order else "UNKNOWN",
                    reason=message,
                    purchase_date=datetime.strptime(
                        order["placed_on"], "%B %d, %Y"
                    ).strftime("%Y-%m-%d") if order else "2026-01-01",
                    amount=float(order["total"].replace("$", "")) if order else 0.0,
                )
                if decision.eligibility and not decision.eligibility.qualified:
                    body = f"Unfortunately your refund request isn't eligible: {decision.eligibility.reason}."
                elif decision.approval_required:
                    body = (
                        f"Your refund of **${decision.amount:.2f}** for order "
                        f"**{decision.order_id}** requires **{decision.approval_level.value.replace('_', ' ').title()}** approval. "
                        f"You'll be notified within 1–2 business days."
                    )
                else:
                    body = (
                        f"✅ Refund of **${decision.amount:.2f}** for order **{decision.order_id}** has been approved.\n\n"
                        f"• **Transaction ID:** {decision.transaction_id}\n"
                        f"• **Processing time:** {decision.processing_time}\n"
                        f"• **Policy confidence:** {decision.rag_confidence:.0%}"
                    )
            elif intent == "credit":
                decision = await finance_agent.issue_store_credit(
                    ticket_id=ticket_id,
                    order_id=order["order_id"] if order else "UNKNOWN",
                    reason=message,
                    amount=float(order["total"].replace("$", "")) if order else 0.0,
                )
                body = (
                    f"✅ Store credit of **${decision.amount:.2f}** has been issued to your account.\n"
                    f"• **Transaction ID:** {decision.transaction_id}"
                ) if not decision.approval_required else (
                    f"Store credit of **${decision.amount:.2f}** requires approval. You'll hear back within 1–2 days."
                )
            else:
                body = _generate_response(intent, message, sentiment_score, user)
        except Exception as e:
            logger.error("Finance agent error", error=str(e))
            body = _generate_response(intent, message, sentiment_score, user)

    elif routing == "logistics" and user:
        order = next((o for o in user["orders"] if o["status"] == "In Transit"), user["orders"][0] if user["orders"] else None)
        try:
            if order and intent in ("shipping", "delivery", "tracking"):
                decision = await logistics_agent.track_order(
                    ticket_id=ticket_id,
                    tracking_number=order["tracking"],
                )
                d = decision.details
                body = (
                    f"Here's the live tracking for order **{order['order_id']}** ({order['item']}):\n\n"
                    f"• **Status:** {d.get('status', order['status'])}\n"
                    f"• **Carrier:** {d.get('carrier', order['carrier'])}  |  Tracking: `{d.get('tracking_number', order['tracking'])}`\n"
                    f"• **Location:** {d.get('current_location', 'In transit')}\n"
                    f"• **Est. Delivery:** {d.get('estimated_delivery', order['estimated_delivery'])}"
                )
            else:
                body = _generate_response(intent, message, sentiment_score, user)
        except Exception as e:
            logger.error("Logistics agent error", error=str(e))
            body = _generate_response(intent, message, sentiment_score, user)

    else:
        body = _generate_response(intent, message, sentiment_score, user)

    # Tone prefix based on sentiment
    if sentiment_score < 0.3:
        tone = "The customer is very frustrated. Be empathetic and apologetic."
    elif sentiment_score < 0.6:
        tone = "The customer is somewhat concerned. Be helpful and reassuring."
    else:
        tone = "The customer is neutral or positive. Be friendly and efficient."

    # Try to get a natural LLM-polished response
    llm_result = await llm_service.generate_with_fallback(
        messages=[{"role": "user", "content": message}],
        system_prompt=(
            f"You are a customer support agent for an e-commerce platform. {tone}\n"
            f"You have already gathered the following information from internal systems:\n\n"
            f"{body}\n\n"
            f"Write a natural, concise support reply using the above data. "
            f"Do not make up any information not present above. Keep it under 100 words."
        ),
        temperature=0.5,
        max_tokens=300,
    )

    if llm_result:
        return llm_result["content"]

    # Fallback to template response
    logger.warning("Using keyword fallback response")
    if sentiment_score < 0.3:
        return f"I'm sorry you're having a frustrating experience. {body}\n\nThis ticket has been marked **high priority**."
    elif sentiment_score < 0.6:
        return f"Thank you for reaching out. {body}"
    return body


# ── Request/Response Models ───────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(..., description="User message")
    conversation_id: Optional[str] = Field(None, description="Conversation ID for context")
    space_id: Optional[str] = Field(None, description="Org UUID — scopes KB queries to this org")

class ChatResponse(BaseModel):
    message_id: str
    conversation_id: str
    response: str
    agent: str
    sentiment_score: Optional[float] = None
    intent: Optional[str] = None
    timestamp: datetime

# Initialize services
empathy_engine = get_empathy_engine()
triage_agent = TriageAgent()
finance_agent = FinanceAgent()
logistics_agent = LogisticsAgent()
order_agent = get_order_agent()
support_agent = get_support_agent()


def _build_user_context(user: dict) -> str:
    """Serialize full user data as context for the LLM."""
    orders_text = "\n".join(
        f"  - {o['order_id']}: {o['item']} | Status: {o['status']} | "
        f"Carrier: {o['carrier']} | Tracking: {o['tracking']} | "
        f"Placed: {o['placed_on']} | Est. Delivery: {o['estimated_delivery']} | Total: {o['total']}"
        for o in user["orders"]
    )
    refunds_text = "\n".join(
        f"  - {r['refund_id']}: Order {r['order_id']} | Amount: {r['amount']} | "
        f"Status: {r['status']} | Reason: {r['reason']} | Processed: {r['processed_on']}"
        for r in user.get("refunds", [])
    ) or "  None"

    wallet = user.get("wallet", {})
    wallet_text = (
        f"Balance: ${wallet.get('balance', 0):.2f} | "
        f"Store Credits: ${wallet.get('credits', 0):.2f} | "
        f"Pending Refunds: ${wallet.get('pending', 0):.2f}"
    ) if wallet else "N/A"

    return (
        f"CUSTOMER ACCOUNT:\n"
        f"  Name: {user['name']} | Email: {user['email']} | Member since: {user.get('member_since', 'N/A')}\n"
        f"  Wallet: {wallet_text}\n\n"
        f"ALL ORDERS ({len(user['orders'])} total):\n{orders_text}\n\n"
        f"ALL REFUNDS:\n{refunds_text}"
    )


SYSTEM_PROMPT = """You are an AI customer support agent for an e-commerce platform.

Your job:
1. Identify the customer using their phone number or customer ID (7 digits: 5551234, 5559876, or 5550001).
2. Once identified, answer questions using ONLY the data provided in the CUSTOMER ACCOUNT section.
3. If not yet identified and the request needs account data, ask for their phone number or customer ID.
4. If the customer includes their phone number in their first message, extract it and proceed directly.
5. Always show ALL relevant data (e.g., if asked for all orders, list every single one).
6. Never invent data. Never say you "don't have access" if the data is provided below.
7. Be concise, friendly, and use markdown formatting (bold, bullet points).

Capabilities: order status, order history, tracking, refunds, account info, browse products, place orders, request replacements."""


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        logger.info("Chat request received", message=request.message[:50])

        message_id = str(uuid.uuid4())
        conversation_id = request.conversation_id or str(uuid.uuid4())

        state = conversation_state.get(conversation_id, {"history": []})
        state.setdefault("history", [])
        user = state.get("user")

        # ── Try to resolve user from current message even if not yet identified ──
        if not user:
            identifier = _extract_identifier(request.message)
            if identifier:
                user = _lookup_user(identifier)
                if user:
                    state["user"] = user
                    logger.info("User identified from message", name=user["name"])

        # ── AI Triage: classify intent and determine routing ─────────────────
        ticket_id = f"TKT-{conversation_id[:8].upper()}"
        triage_result = await triage_agent.triage(
            customer_message=request.message,
            customer_id=conversation_id,
            ticket_id=ticket_id,
        )
        intent = triage_result.intent.value
        routing = triage_result.routed_to.value
        logger.info("Triage complete", intent=intent, routing=routing, sentiment=triage_result.sentiment_analysis.get("score"))

        # ── Call FinanceAgent for finance routing ────────────────────────────
        agent_context = ""
        if user and routing == "finance":
            try:
                wallet_data = await finance_agent.check_wallet_balance(
                    ticket_id=ticket_id,
                    customer_id=user["name"],
                    wallet=user.get("wallet", {}),
                )
                agent_context = (
                    f"\n\nFINANCE AGENT RESULT (wallet check):\n"
                    f"  Balance: ${wallet_data['balance']:.2f} {wallet_data['currency']}\n"
                    f"  Store Credits: ${wallet_data['store_credits']:.2f}\n"
                    f"  Pending Refunds: ${wallet_data['pending_refunds']:.2f}\n"
                    f"  Total Available: ${wallet_data['total_available']:.2f}\n"
                    f"  (Action logged to CRM audit trail)"
                )
                logger.info("FinanceAgent wallet check complete", balance=wallet_data["balance"])
            except Exception as e:
                logger.error("FinanceAgent wallet check failed", error=str(e))

        # ── Always query org KB if org_slug is provided ──────────────────────
        kb_context = ""
        space_id = request.space_id or state.get("space_id")
        if space_id:
            state["space_id"] = space_id   # persist across turns
            try:
                kb_result = await support_agent.answer(
                    question=request.message,
                    client_id=space_id,
                    ticket_id=ticket_id,
                )
                if kb_result.rag_hit:
                    source_lines = "\n".join(
                        f"  - {s['filename']} p.{s['page']}"
                        + (f" · {s['section']}" if s["section"] else "")
                        + f" [{s.get('doc_type', '')}] (score: {s['score']:.2f})"
                        for s in kb_result.sources
                    )
                    kb_context = (
                        f"\n\nKNOWLEDGE BASE ANSWER (from org docs):\n"
                        f"{kb_result.answer}\n\n"
                        f"Sources:\n{source_lines}"
                    )
                    logger.info("SupportAgent answered from KB", space_id=space_id, rag_hit=True)
                else:
                    logger.info("SupportAgent: no KB hits", space_id=space_id)
            except Exception as e:
                logger.error("SupportAgent failed", error=str(e))

        # ── Call OrderAgent for order/browse routing ─────────────────────────
        order_context = ""
        msg_lower = request.message.lower()
        if routing == "order" or intent in ("browse_products", "place_order", "replacement"):
            try:
                browse_result = await order_agent.browse_products(ticket_id=ticket_id)
                products = browse_result["products"][:8]
                if products:
                    prod_lines = "\n".join(
                        f"  - {p['product_id']}: {p['name']} | ${p['price']:.2f} | "
                        f"Stock: {p['stock']} | Rating: {p['rating']} | Category: {p['category']}"
                        for p in products
                    )
                    order_context = (
                        f"\n\nPRODUCT CATALOG ({browse_result['total']} items):\n{prod_lines}\n"
                        f"Available categories: {', '.join(CATEGORIES)}\n"
                        "To place an order the customer must provide a product ID and quantity."
                    )
                    if intent == "replacement":
                        order_context += (
                            "\n\nREPLACEMENT: Customer wants to replace a damaged/defective item. "
                            "Use their order history to identify the relevant order."
                        )
            except Exception as e:
                logger.error("OrderAgent browse failed", error=str(e))

        # ── Build system prompt with user context if available ───────────────
        system = SYSTEM_PROMPT
        if user:
            system += f"\n\nSTATUS: Customer is IDENTIFIED.\n\n{_build_user_context(user)}"
            if agent_context:
                system += agent_context
        else:
            system += "\n\nSTATUS: Customer is NOT yet identified. Ask for phone number or customer ID (7 digits) before showing any account data."
        if order_context:
            system += order_context
        if kb_context:
            system += kb_context

        # ── Append current message to history ────────────────────────────────
        state["history"].append({"role": "user", "content": request.message})

        # ── Call LLM with full conversation history ───────────────────────────
        llm_result = await llm_service.generate_with_fallback(
            messages=state["history"][-10:],  # last 10 turns for context window
            system_prompt=system,
            temperature=0.4,
            max_tokens=500,
        )

        if llm_result:
            response_text = llm_result["content"]
            provider = llm_result.get("provider", "llm")
            logger.info("LLM response generated", provider=provider)
        else:
            logger.warning("All LLM providers failed, using template fallback")
            response_text = _generate_response(intent, request.message, triage_result.sentiment_analysis.get("score", 0.5), user)
            provider = "template-fallback"

        state["history"].append({"role": "assistant", "content": response_text})
        conversation_state[conversation_id] = state

        # routing already set from triage_result above

        sentiment_score = triage_result.sentiment_analysis.get("score")
        logger.info("Chat complete", sentiment=sentiment_score, provider=provider)

        return ChatResponse(
            message_id=message_id, conversation_id=conversation_id,
            response=response_text,
            agent=f"AI Agent → {routing.replace('_', ' ').title()}",
            sentiment_score=sentiment_score,
            intent=intent,
            timestamp=datetime.utcnow()
        )

    except Exception as e:
        logger.error("Chat request failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Chat processing failed: {str(e)}")


@router.get("/agents/status")
async def get_agent_status():
    """Get status of all agents"""
    return {
        "agents": [
            {
                "name": "Triage Agent",
                "type": "triage",
                "status": "active",
                "model": "claude-3-5-sonnet-20241022",
                "tasks_completed": 0
            },
            {
                "name": "Logistics Agent",
                "type": "logistics",
                "status": "idle",
                "model": "claude-3-5-sonnet-20241022",
                "tasks_completed": 0
            },
            {
                "name": "Finance Agent",
                "type": "finance",
                "status": "idle",
                "model": "ibm/granite-20b-multilingual",
                "tasks_completed": 0
            }
        ],
        "timestamp": datetime.utcnow()
    }


@router.post("/empathy/analyze")
async def analyze_sentiment(request: ChatRequest):
    """Analyze sentiment of a message"""
    try:
        result = await empathy_engine.analyze(request.message)

        return {
            "sentiment_score": result.score,
            "level": result.level.value,
            "urgency": result.urgency.value,
            "triggers": result.triggers,
            "empathy_triggered": result.empathy_triggered,
            "confidence": result.confidence
        }
    except Exception as e:
        logger.error("Sentiment analysis failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Sentiment analysis failed: {str(e)}")

# Made with Bob
