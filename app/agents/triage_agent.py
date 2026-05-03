"""
Triage Agent with Empathy Engine

This module implements the Triage Agent that performs sentiment analysis,
classifies intent, assigns priority, and routes to specialist agents.

Key Features:
- Sentiment analysis using Empathy Engine
- Logic gate at sentiment_score < 0.4 (bypasses FAQs, routes to Finance)
- Intent classification
- Priority assignment
- Routing to specialist agents
- Mandatory CRM updates
"""

from typing import Dict, Any, Optional, List
from enum import Enum
from datetime import datetime
from uuid import uuid4

import json
from pydantic import BaseModel, Field

from app.services.llm_service import llm_service
from app.agents.empathy_engine import (
    EmpathyEngine,
    SentimentAnalysis,
    get_empathy_engine
)
from app.services.crm_service import (
    CRMService,
    ActionEnforcementService,
    ActionType,
    TicketStatus,
    get_crm_service,
    get_action_enforcement_service
)


class IntentType(str, Enum):
    """Customer intent classification"""
    SHIPPING = "shipping"
    DELIVERY = "delivery"
    TRACKING = "tracking"
    REFUND = "refund"
    CREDIT = "credit"
    COMPENSATION = "compensation"
    PRODUCT_ISSUE = "product_issue"
    ACCOUNT = "account"
    BROWSE_PRODUCTS = "browse_products"
    PLACE_ORDER = "place_order"
    REPLACEMENT = "replacement"
    GENERAL_INQUIRY = "general_inquiry"


class RoutingTarget(str, Enum):
    """Routing target agents"""
    LOGISTICS = "logistics"
    FINANCE = "finance"
    ORDER = "order"
    ESCALATION = "escalation"


class TriageDecision(BaseModel):
    """Triage decision result"""
    ticket_id: str
    sentiment_analysis: Dict[str, Any]
    intent: IntentType
    priority: int = Field(ge=1, le=4)
    routed_to: RoutingTarget
    bypass_faq: bool = False
    proactive_compensation: bool = False
    reasoning: str
    confidence: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class TriageAgent:
    """
    Triage Agent - First point of contact for all customer interactions.
    
    Responsibilities:
    1. Analyze sentiment using Empathy Engine
    2. Classify customer intent
    3. Assign priority based on sentiment and urgency
    4. Route to appropriate specialist agent
    5. Trigger empathy protocol for low sentiment (< 0.4)
    6. Update CRM with triage decision
    """
    
    # Intent classification keywords
    INTENT_KEYWORDS = {
        IntentType.SHIPPING: [
            "ship", "shipping", "shipped", "delivery", "deliver",
            "tracking", "track", "package", "order", "sent"
        ],
        IntentType.REFUND: [
            "refund", "money back", "return", "reimburse",
            "reimbursement", "pay back"
        ],
        IntentType.CREDIT: [
            "credit", "store credit", "voucher", "coupon"
        ],
        IntentType.BROWSE_PRODUCTS: [
            "browse", "show products", "what products", "catalog",
            "available", "buy", "purchase", "shop", "looking for",
            "recommend", "suggestion", "list products", "what do you sell"
        ],
        IntentType.PLACE_ORDER: [
            "place order", "order now", "i want to buy", "add to cart",
            "checkout", "purchase", "i'd like to order", "can i order"
        ],
        IntentType.REPLACEMENT: [
            "replacement", "replace", "exchange", "swap",
            "broken", "damaged", "defective", "not working", "send another"
        ],
        IntentType.COMPENSATION: [
            "compensation", "compensate", "make up for",
            "make it right", "sorry"
        ],
        IntentType.PRODUCT_ISSUE: [
            "broken", "damaged", "defective", "wrong item",
            "missing", "incorrect", "faulty", "not working"
        ],
        IntentType.ACCOUNT: [
            "account", "login", "password", "profile",
            "settings", "email", "phone"
        ],
    }
    
    def __init__(
        self,
        empathy_engine: Optional[EmpathyEngine] = None,
        crm_service: Optional[CRMService] = None,
        action_enforcement: Optional[ActionEnforcementService] = None
    ):
        """
        Initialize the Triage Agent.
        
        Args:
            empathy_engine: Empathy engine instance
            crm_service: CRM service instance
            action_enforcement: Action enforcement service instance
        """
        self.empathy_engine = empathy_engine or get_empathy_engine()
        self.crm_service = crm_service or get_crm_service()
        self.action_enforcement = action_enforcement or get_action_enforcement_service()
        
        self.triage_count = 0
        self.empathy_bypass_count = 0
    
    async def triage(
        self,
        customer_message: str,
        customer_id: str,
        ticket_id: Optional[str] = None
    ) -> TriageDecision:
        """
        Perform triage on customer message.
        
        This is the main entry point for the Triage Agent.
        
        Args:
            customer_message: The customer's message
            customer_id: Customer identifier
            ticket_id: Optional existing ticket ID
            
        Returns:
            TriageDecision with routing and priority
        """
        self.triage_count += 1
        
        # Generate ticket ID if not provided
        if not ticket_id:
            ticket_id = f"TKT-{uuid4().hex[:8].upper()}"
        
        # Step 1: Analyze sentiment using Empathy Engine
        sentiment_analysis = await self.empathy_engine.analyze(customer_message)
        
        # Step 2: Check if empathy protocol should be triggered
        empathy_triggered = sentiment_analysis.empathy_triggered
        
        if empathy_triggered:
            self.empathy_bypass_count += 1
            # EMPATHY PROTOCOL: Bypass FAQs, route directly to Finance
            return await self._handle_empathy_protocol(
                ticket_id=ticket_id,
                customer_id=customer_id,
                customer_message=customer_message,
                sentiment_analysis=sentiment_analysis
            )
        
        # Step 3: Standard triage flow
        return await self._handle_standard_triage(
            ticket_id=ticket_id,
            customer_id=customer_id,
            customer_message=customer_message,
            sentiment_analysis=sentiment_analysis
        )
    
    async def _handle_empathy_protocol(
        self,
        ticket_id: str,
        customer_id: str,
        customer_message: str,
        sentiment_analysis: SentimentAnalysis
    ) -> TriageDecision:
        """
        Handle empathy protocol for low sentiment scores.
        
        When sentiment_score < 0.4:
        - Bypass standard FAQs
        - Route directly to Finance Agent
        - Offer proactive compensation
        - Set high priority
        
        Args:
            ticket_id: Ticket identifier
            customer_id: Customer identifier
            customer_message: Customer message
            sentiment_analysis: Sentiment analysis result
            
        Returns:
            TriageDecision with empathy routing
        """
        # Create CRM record with high priority
        await self.crm_service.create_record(
            ticket_id=ticket_id,
            customer_id=customer_id,
            priority=1,  # High priority
            sentiment=sentiment_analysis.level.value,
            metadata={
                "empathy_protocol": True,
                "sentiment_score": sentiment_analysis.score,
                "triggers": sentiment_analysis.triggers
            }
        )
        
        # Log triage action with empathy flag
        await self.action_enforcement.log_action(
            ticket_id=ticket_id,
            action_type=ActionType.TRIAGE_COMPLETE,
            agent_id="triage-001",
            agent_type="triage",
            details={
                "sentiment_score": sentiment_analysis.score,
                "sentiment_level": sentiment_analysis.level.value,
                "urgency": sentiment_analysis.urgency.value,
                "empathy_protocol": True,
                "bypass_faq": True,
                "proactive_compensation": True,
                "triggers": sentiment_analysis.triggers
            },
            status=TicketStatus.IN_PROGRESS
        )
        
        # Respect actual intent — don't force Finance if message is about orders/shipping
        _actual_intent = await self._classify_intent(customer_message)
        _logistics_intents = {IntentType.SHIPPING, IntentType.DELIVERY, IntentType.TRACKING}
        if _actual_intent in _logistics_intents:
            _empathy_intent = _actual_intent
            _empathy_routing = RoutingTarget.LOGISTICS
            _empathy_compensation = False
        else:
            _empathy_intent = IntentType.COMPENSATION
            _empathy_routing = RoutingTarget.FINANCE
            _empathy_compensation = True

        decision = TriageDecision(
            ticket_id=ticket_id,
            sentiment_analysis={
                "score": sentiment_analysis.score,
                "level": sentiment_analysis.level.value,
                "urgency": sentiment_analysis.urgency.value,
                "empathy_triggered": True,
                "triggers": sentiment_analysis.triggers
            },
            intent=_empathy_intent,
            priority=1,
            routed_to=_empathy_routing,
            bypass_faq=True,
            proactive_compensation=_empathy_compensation,
            reasoning=(
                f"Empathy protocol activated (score={sentiment_analysis.score:.2f}). "
                f"Actual intent: {_empathy_intent.value}. Routed to {_empathy_routing.value}."
            ),
            confidence=sentiment_analysis.confidence
        )
        
        return decision
    
    async def _handle_standard_triage(
        self,
        ticket_id: str,
        customer_id: str,
        customer_message: str,
        sentiment_analysis: SentimentAnalysis
    ) -> TriageDecision:
        """
        Handle standard triage flow.
        
        Args:
            ticket_id: Ticket identifier
            customer_id: Customer identifier
            customer_message: Customer message
            sentiment_analysis: Sentiment analysis result
            
        Returns:
            TriageDecision with standard routing
        """
        # Classify intent
        intent = await self._classify_intent(customer_message)
        
        # Assign priority based on sentiment and urgency
        priority = self._assign_priority(sentiment_analysis)
        
        # Determine routing target
        routed_to = self._determine_routing(intent, sentiment_analysis)
        
        # Create CRM record
        await self.crm_service.create_record(
            ticket_id=ticket_id,
            customer_id=customer_id,
            priority=priority,
            sentiment=sentiment_analysis.level.value,
            metadata={
                "intent": intent.value,
                "sentiment_score": sentiment_analysis.score,
                "urgency": sentiment_analysis.urgency.value
            }
        )
        
        # Log triage action
        await self.action_enforcement.log_action(
            ticket_id=ticket_id,
            action_type=ActionType.TRIAGE_COMPLETE,
            agent_id="triage-001",
            agent_type="triage",
            details={
                "sentiment_score": sentiment_analysis.score,
                "sentiment_level": sentiment_analysis.level.value,
                "urgency": sentiment_analysis.urgency.value,
                "intent": intent.value,
                "priority": priority,
                "routed_to": routed_to.value
            },
            status=TicketStatus.IN_PROGRESS
        )
        
        decision = TriageDecision(
            ticket_id=ticket_id,
            sentiment_analysis={
                "score": sentiment_analysis.score,
                "level": sentiment_analysis.level.value,
                "urgency": sentiment_analysis.urgency.value,
                "empathy_triggered": False
            },
            intent=intent,
            priority=priority,
            routed_to=routed_to,
            bypass_faq=False,
            proactive_compensation=False,
            reasoning=self._generate_reasoning(
                intent, sentiment_analysis, priority, routed_to
            ),
            confidence=sentiment_analysis.confidence
        )
        
        return decision
    
    async def _classify_intent(self, message: str) -> IntentType:
        """
        Classify customer intent using LLM. Falls back to keyword scoring only if LLM fails.
        """
        valid_intents = [i.value for i in IntentType]
        try:
            result = await llm_service.generate_with_fallback(
                messages=[{"role": "user", "content": message}],
                system_prompt=(
                    "You are an intent classifier for a customer support system. "
                    "Classify the customer message into exactly ONE of these intents:\n"
                    f"{', '.join(valid_intents)}\n\n"
                    "Definitions:\n"
                    "- shipping/delivery/tracking: questions about order shipment or tracking\n"
                    "- refund: wants money back to original payment method\n"
                    "- credit: wants store credit or voucher\n"
                    "- compensation: wants something for bad experience\n"
                    "- product_issue: broken, damaged, wrong, or missing item\n"
                    "- replacement: wants a new item sent instead of refund\n"
                    "- account: login, password, profile settings\n"
                    "- browse_products: wants to see what's available to buy\n"
                    "- place_order: wants to buy a specific product\n"
                    "- general_inquiry: anything else\n\n"
                    'Respond with JSON only: {"intent": "<value>"}'
                ),
                temperature=0.0,
                max_tokens=30,
            )
            if result:
                raw = result["content"].strip()
                # extract JSON even if wrapped in markdown
                if "```" in raw:
                    raw = raw.split("```")[1].strip().lstrip("json").strip()
                data = json.loads(raw)
                intent_val = data.get("intent", "").strip()
                if intent_val in valid_intents:
                    return IntentType(intent_val)
        except Exception:
            pass

        # Keyword fallback (last resort)
        message_lower = message.lower()
        intent_scores = {}
        for intent_type, keywords in self.INTENT_KEYWORDS.items():
            score = sum(1 for kw in keywords if kw in message_lower)
            if score > 0:
                intent_scores[intent_type] = score
        if intent_scores:
            return max(intent_scores, key=intent_scores.get)
        return IntentType.GENERAL_INQUIRY
    
    def _assign_priority(self, sentiment_analysis: SentimentAnalysis) -> int:
        """
        Assign priority based on sentiment and urgency.
        
        Priority levels:
        1 = Critical (very negative + high urgency)
        2 = High (negative + medium/high urgency)
        3 = Medium (neutral or positive + some urgency)
        4 = Low (positive + low urgency)
        
        Args:
            sentiment_analysis: Sentiment analysis result
            
        Returns:
            Priority level (1-4)
        """
        score = sentiment_analysis.score
        urgency = sentiment_analysis.urgency.value
        
        # Critical: Very negative + high urgency
        if score < 0.3 and urgency in ["high", "critical"]:
            return 1
        
        # High: Negative + medium/high urgency
        if score < 0.4 or urgency in ["high", "critical"]:
            return 2
        
        # Medium: Neutral or some urgency
        if score < 0.7 or urgency == "medium":
            return 3
        
        # Low: Positive + low urgency
        return 4
    
    def _determine_routing(
        self,
        intent: IntentType,
        sentiment_analysis: SentimentAnalysis
    ) -> RoutingTarget:
        """
        Determine routing target based on intent and sentiment.
        
        Args:
            intent: Classified intent
            sentiment_analysis: Sentiment analysis result
            
        Returns:
            RoutingTarget
        """
        # Escalate if critical urgency
        if sentiment_analysis.urgency.value == "critical":
            return RoutingTarget.ESCALATION
        
        # Route based on intent
        if intent in [
            IntentType.SHIPPING,
            IntentType.DELIVERY,
            IntentType.TRACKING,
            IntentType.PRODUCT_ISSUE
        ]:
            return RoutingTarget.LOGISTICS
        
        if intent in [
            IntentType.REFUND,
            IntentType.CREDIT,
            IntentType.COMPENSATION
        ]:
            return RoutingTarget.FINANCE
        
        # Default to logistics for general inquiries
        return RoutingTarget.LOGISTICS
    
    def _generate_reasoning(
        self,
        intent: IntentType,
        sentiment_analysis: SentimentAnalysis,
        priority: int,
        routed_to: RoutingTarget
    ) -> str:
        """
        Generate human-readable reasoning for triage decision.
        
        Args:
            intent: Classified intent
            sentiment_analysis: Sentiment analysis result
            priority: Assigned priority
            routed_to: Routing target
            
        Returns:
            Reasoning string
        """
        return (
            f"Customer intent classified as '{intent.value}' with "
            f"{sentiment_analysis.level.value} sentiment (score: {sentiment_analysis.score:.2f}) "
            f"and {sentiment_analysis.urgency.value} urgency. "
            f"Assigned priority {priority} and routing to {routed_to.value} agent."
        )
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get triage agent statistics.
        
        Returns:
            Dictionary with statistics
        """
        empathy_bypass_rate = 0.0
        if self.triage_count > 0:
            empathy_bypass_rate = self.empathy_bypass_count / self.triage_count
        
        return {
            "total_triages": self.triage_count,
            "empathy_bypasses": self.empathy_bypass_count,
            "empathy_bypass_rate": round(empathy_bypass_rate, 3),
            "empathy_engine_stats": self.empathy_engine.get_statistics()
        }


# Global triage agent instance
_triage_agent: Optional[TriageAgent] = None


def get_triage_agent() -> TriageAgent:
    """
    Get the global triage agent instance.
    
    Returns:
        The triage agent
    """
    global _triage_agent
    if _triage_agent is None:
        _triage_agent = TriageAgent()
    return _triage_agent

# Made with Bob
