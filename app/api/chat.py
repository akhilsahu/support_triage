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
# Tracks per-conversation context: awaiting_identifier, resolved user_id, intent
conversation_state: Dict[str, dict] = {}

# ── Mock Data ────────────────────────────────────────────────────────────────

# Keyed by phone number or user ID
MOCK_USERS = {
    "5551234": {
        "name": "Alex Kim",
        "email": "alex.kim@email.com",
        "orders": [
            {
                "order_id": "ORD-1042",
                "item": "Sony WH-1000XM5 Headphones",
                "status": "In Transit",
                "tracking": "1Z999AA10123456784",
                "carrier": "UPS",
                "estimated_delivery": (datetime.utcnow() + timedelta(days=2)).strftime("%B %d, %Y"),
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
        ],
        "refunds": [
            {
                "refund_id": "REF-0091",
                "order_id": "ORD-1031",
                "amount": "$99.99",
                "status": "Processed",
                "reason": "Item not as described",
                "processed_on": "April 23, 2026",
            }
        ],
    },
    "5559876": {
        "name": "Jordan Lee",
        "email": "jordan.lee@email.com",
        "orders": [
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
        ],
        "refunds": [],
    },
}


def _extract_identifier(message: str) -> Optional[str]:
    """Extract phone number or user ID from message."""
    # Match 7+ digit numbers (phone or ID)
    match = re.search(r'\b(\d{7,})\b', message.replace("-", "").replace(" ", ""))
    if match:
        return match.group(1)
    # Match last-4 style short IDs
    match = re.search(r'\b(\d{4,6})\b', message)
    if match:
        return match.group(1)
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


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        logger.info("Chat request received", message=request.message[:50])

        message_id = str(uuid.uuid4())
        conversation_id = request.conversation_id or str(uuid.uuid4())

        sentiment_result = await empathy_engine.analyze_sentiment(request.message)

        # Load or init conversation state
        state = conversation_state.get(conversation_id, {})

        # If we're waiting for an identifier, try to resolve it
        if state.get("awaiting_identifier"):
            identifier = _extract_identifier(request.message)
            user = _lookup_user(identifier) if identifier else None
            if user:
                state["user"] = user
                state["awaiting_identifier"] = False
                conversation_state[conversation_id] = state
                intent = state.get("pending_intent", "general_inquiry")
                routing = state.get("pending_routing", "support")
                response_text = await _hand_off(
                    routing=routing,
                    intent=intent,
                    message=request.message,
                    sentiment_score=sentiment_result.score,
                    user=user,
                    conversation_id=conversation_id,
                )
            else:
                response_text = "I couldn't find an account with that number. Please try your 7-digit phone number or customer ID (e.g. **5551234**)."
                return ChatResponse(
                    message_id=message_id,
                    conversation_id=conversation_id,
                    response=response_text,
                    agent="Triage Agent",
                    sentiment_score=sentiment_result.score,
                    intent="verification",
                    timestamp=datetime.utcnow()
                )
        else:
            # Normal triage flow
            triage_result = await triage_agent.triage(
                customer_message=request.message,
                customer_id=conversation_id
            )
            intent = triage_result.intent.value if triage_result.intent else "general_inquiry"
            routing = triage_result.routed_to.value if triage_result.routed_to else "support"

            user = state.get("user")

            if not user and _needs_identifier(intent):
                # Ask for identifier before proceeding
                state["awaiting_identifier"] = True
                state["pending_intent"] = intent
                state["pending_routing"] = routing
                conversation_state[conversation_id] = state
                response_text = "Sure, I can help with that! To pull up your account, please provide your **phone number** or **customer ID**."
                return ChatResponse(
                    message_id=message_id,
                    conversation_id=conversation_id,
                    response=response_text,
                    agent="Triage Agent",
                    sentiment_score=sentiment_result.score,
                    intent=intent,
                    timestamp=datetime.utcnow()
                )

            response_text = await _hand_off(
                routing=routing,
                intent=intent,
                message=request.message,
                sentiment_score=sentiment_result.score,
                user=user,
                conversation_id=conversation_id,
            )
            conversation_state[conversation_id] = state

        logger.info("Chat complete", intent=intent, routing=routing, sentiment=sentiment_result.score)

        return ChatResponse(
            message_id=message_id,
            conversation_id=conversation_id,
            response=response_text,
            agent=f"Triage → {routing.capitalize()}",
            sentiment_score=sentiment_result.score,
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
