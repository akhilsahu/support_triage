"""Chat API endpoints for UI integration"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict
from datetime import datetime, timedelta
import uuid
import re
import structlog

from app.services.empathy import EmpathyEngine
from app.agents.triage_agent import TriageAgent
from app.agents.finance_agent import FinanceAgent
from app.agents.logistics_agent import LogisticsAgent
from app.services.llm_service import llm_service

logger = structlog.get_logger()

router = APIRouter(prefix="/api/v1", tags=["chat"])

# ── Conversation State (in-memory) ───────────────────────────────────────────
# Keys: awaiting_identifier, user, pending_intent, pending_routing, last_intent, history
conversation_state: Dict[str, dict] = {}

# ── Mock Data ────────────────────────────────────────────────────────────────

_D = datetime.utcnow()

MOCK_USERS = {
    "5551234": {
        "name": "Alex Kim",
        "email": "alex.kim@email.com",
        "member_since": "January 2024",
        "orders": [
            {
                "order_id": "ORD-1042",
                "item": "Sony WH-1000XM5 Headphones",
                "status": "In Transit",
                "tracking": "1Z999AA10123456784",
                "carrier": "UPS",
                "estimated_delivery": (_D + timedelta(days=2)).strftime("%B %d, %Y"),
                "placed_on": "April 29, 2026",
                "total": "$349.99",
            },
            {
                "order_id": "ORD-1031",
                "item": "Logitech MX Master 3 Mouse",
                "status": "Delivered",
                "tracking": "1Z999AA10123456700",
                "carrier": "UPS",
                "estimated_delivery": "April 27, 2026",
                "placed_on": "April 24, 2026",
                "total": "$99.99",
            },
            {
                "order_id": "ORD-1019",
                "item": "Keychron K2 Mechanical Keyboard",
                "status": "Delivered",
                "tracking": "1Z999AA10123456611",
                "carrier": "UPS",
                "estimated_delivery": "April 10, 2026",
                "placed_on": "April 7, 2026",
                "total": "$89.99",
            },
            {
                "order_id": "ORD-1005",
                "item": "Anker 65W USB-C Charger",
                "status": "Delivered",
                "tracking": "9400111899223450000001",
                "carrier": "USPS",
                "estimated_delivery": "March 22, 2026",
                "placed_on": "March 19, 2026",
                "total": "$35.99",
            },
        ],
        "refunds": [
            {
                "refund_id": "REF-0091",
                "order_id": "ORD-1031",
                "amount": "$99.99",
                "status": "Processed",
                "reason": "Item not as described",
                "processed_on": "April 30, 2026",
            },
            {
                "refund_id": "REF-0078",
                "order_id": "ORD-1005",
                "amount": "$35.99",
                "status": "Processed",
                "reason": "Arrived damaged",
                "processed_on": "March 25, 2026",
            },
        ],
    },
    "5559876": {
        "name": "Jordan Lee",
        "email": "jordan.lee@email.com",
        "member_since": "June 2023",
        "orders": [
            {
                "order_id": "ORD-1038",
                "item": "Apple AirPods Pro (2nd Gen)",
                "status": "Out for Delivery",
                "tracking": "9400111899223450123457",
                "carrier": "USPS",
                "estimated_delivery": (_D + timedelta(days=0)).strftime("%B %d, %Y"),
                "placed_on": "April 28, 2026",
                "total": "$249.99",
            },
            {
                "order_id": "ORD-1018",
                "item": "Samsung 27\" 4K Monitor",
                "status": "Delivered",
                "tracking": "9400111899223450123456",
                "carrier": "USPS",
                "estimated_delivery": "April 20, 2026",
                "placed_on": "April 16, 2026",
                "total": "$429.99",
            },
            {
                "order_id": "ORD-1002",
                "item": "Bose QuietComfort 45 Headphones",
                "status": "Delivered",
                "tracking": "1Z999BB10123456001",
                "carrier": "UPS",
                "estimated_delivery": "February 14, 2026",
                "placed_on": "February 10, 2026",
                "total": "$279.99",
            },
        ],
        "refunds": [
            {
                "refund_id": "REF-0085",
                "order_id": "ORD-1018",
                "amount": "$429.99",
                "status": "Pending",
                "reason": "Dead pixel on screen",
                "processed_on": "Pending review",
            },
        ],
    },
    "5550001": {
        "name": "Sam Rivera",
        "email": "sam.rivera@email.com",
        "member_since": "March 2025",
        "orders": [
            {
                "order_id": "ORD-1044",
                "item": "iPad Air M2",
                "status": "Processing",
                "tracking": "N/A",
                "carrier": "FedEx",
                "estimated_delivery": (_D + timedelta(days=5)).strftime("%B %d, %Y"),
                "placed_on": "May 1, 2026",
                "total": "$699.99",
            },
            {
                "order_id": "ORD-1033",
                "item": "Apple Pencil (2nd Gen)",
                "status": "Delivered",
                "tracking": "7749000100000000001",
                "carrier": "FedEx",
                "estimated_delivery": "April 22, 2026",
                "placed_on": "April 19, 2026",
                "total": "$129.99",
            },
            {
                "order_id": "ORD-1021",
                "item": "Magic Keyboard with Touch ID",
                "status": "Delivered",
                "tracking": "7749000100000000002",
                "carrier": "FedEx",
                "estimated_delivery": "April 5, 2026",
                "placed_on": "April 2, 2026",
                "total": "$149.99",
            },
        ],
        "refunds": [],
    },
}


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

class ChatResponse(BaseModel):
    message_id: str
    conversation_id: str
    response: str
    agent: str
    sentiment_score: Optional[float] = None
    intent: Optional[str] = None
    timestamp: datetime

# Initialize services
empathy_engine = EmpathyEngine()
triage_agent = TriageAgent()
finance_agent = FinanceAgent()
logistics_agent = LogisticsAgent()


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

    return (
        f"CUSTOMER ACCOUNT:\n"
        f"  Name: {user['name']} | Email: {user['email']} | Member since: {user.get('member_since', 'N/A')}\n\n"
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

Capabilities: order status, order history, tracking, refunds, account info."""


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        logger.info("Chat request received", message=request.message[:50])

        message_id = str(uuid.uuid4())
        conversation_id = request.conversation_id or str(uuid.uuid4())

        sentiment_result = await empathy_engine.analyze_sentiment(request.message)
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

        # ── Build system prompt with user context if available ───────────────
        system = SYSTEM_PROMPT
        if user:
            system += f"\n\nSTATUS: Customer is IDENTIFIED.\n\n{_build_user_context(user)}"
        else:
            system += "\n\nSTATUS: Customer is NOT yet identified. Ask for phone number or customer ID (7 digits) before showing any account data."

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
            # Hard fallback — keyword only
            logger.warning("All LLM providers failed, using keyword fallback")
            triage_result = await triage_agent.triage(
                customer_message=request.message, customer_id=conversation_id
            )
            intent = triage_result.intent.value if triage_result.intent else "general_inquiry"
            routing = triage_result.routed_to.value if triage_result.routed_to else "support"
            response_text = _generate_response(intent, request.message, sentiment_result.score, user)
            provider = "keyword-fallback"

        state["history"].append({"role": "assistant", "content": response_text})
        conversation_state[conversation_id] = state

        # ── Determine routing label for UI ────────────────────────────────────
        msg_lower = request.message.lower()
        if any(w in msg_lower for w in ("refund", "credit", "compensation")):
            routing = "finance"
        elif any(w in msg_lower for w in ("order", "ship", "track", "deliver", "package")):
            routing = "logistics"
        else:
            routing = "support"

        logger.info("Chat complete", sentiment=sentiment_result.score, provider=provider)

        return ChatResponse(
            message_id=message_id, conversation_id=conversation_id,
            response=response_text,
            agent=f"AI Agent → {routing.capitalize()}",
            sentiment_score=sentiment_result.score,
            intent=routing,
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
        result = await empathy_engine.analyze_sentiment(request.message)
        
        return {
            "sentiment_score": result.score,
            "emotion": result.emotion,
            "urgency": result.urgency,
            "key_phrases": result.key_phrases,
            "confidence": result.confidence
        }
    except Exception as e:
        logger.error("Sentiment analysis failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Sentiment analysis failed: {str(e)}")

# Made with Bob
