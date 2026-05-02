"""
Finance Agent with RAG-Based Policy Retrieval

This module implements the Finance Agent that handles refunds, credits,
and financial compensation using RAG for policy verification.

Key Features:
- RAG-based policy retrieval
- Eligibility verification
- Compensation calculation
- Approval workflow routing
- Refund processing
- Policy reference logging
- Mandatory CRM updates
"""

from typing import Dict, Any, Optional, List
from enum import Enum
from datetime import datetime, timedelta
from uuid import uuid4

from pydantic import BaseModel, Field

from app.services.rag_service import (
    MockRAGService,
    RAGResponse,
    PolicyDocument,
    PolicySection,
    get_rag_service
)
from app.services.crm_service import (
    CRMService,
    ActionEnforcementService,
    ActionType,
    TicketStatus,
    get_crm_service,
    get_action_enforcement_service
)


class FinanceActionType(str, Enum):
    """Finance action types"""
    REFUND_PROCESSED = "refund_processed"
    CREDIT_ISSUED = "credit_issued"
    COMPENSATION_CALCULATED = "compensation_calculated"
    POLICY_VERIFIED = "policy_verified"
    APPROVAL_REQUESTED = "approval_requested"


class ApprovalLevel(str, Enum):
    """Approval level enumeration"""
    AUTO_APPROVED = "auto_approved"
    MANAGER = "manager"
    DIRECTOR = "director"
    EXECUTIVE = "executive"


class EligibilityResult(BaseModel):
    """Eligibility verification result"""
    qualified: bool
    reason: str
    restrictions: List[str] = Field(default_factory=list)
    policy_references: List[Dict[str, Any]] = Field(default_factory=list)


class CompensationCalculation(BaseModel):
    """Compensation calculation result"""
    base_amount: float
    adjustments: List[Dict[str, Any]] = Field(default_factory=list)
    final_amount: float
    currency: str = "USD"
    policy_references: List[Dict[str, Any]] = Field(default_factory=list)


class FinanceDecision(BaseModel):
    """Finance decision result"""
    ticket_id: str
    order_id: Optional[str] = None
    action_type: FinanceActionType
    amount: Optional[float] = None
    currency: str = "USD"
    policy_references: List[Dict[str, Any]] = Field(default_factory=list)
    rag_confidence: float
    eligibility: Optional[EligibilityResult] = None
    calculation: Optional[CompensationCalculation] = None
    approval_required: bool = False
    approval_level: Optional[ApprovalLevel] = None
    transaction_id: Optional[str] = None
    processing_time: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class FinanceAgent:
    """
    Finance Agent - Handles refunds, credits, and financial compensation.
    
    Responsibilities:
    1. Query RAG for relevant policies
    2. Verify customer eligibility
    3. Calculate compensation based on policy
    4. Route for approval if needed
    5. Process financial transactions
    6. Log policy references
    7. Update CRM with finance actions
    """
    
    # Approval thresholds
    APPROVAL_THRESHOLDS = {
        "auto_approve": 100.00,      # < $100: Auto-approve
        "manager": 500.00,           # $100-$500: Manager approval
        "director": 1000.00,         # $500-$1000: Director approval
        "executive": float('inf')    # > $1000: Executive approval
    }
    
    def __init__(
        self,
        rag_service: Optional[MockRAGService] = None,
        crm_service: Optional[CRMService] = None,
        action_enforcement: Optional[ActionEnforcementService] = None
    ):
        """
        Initialize the Finance Agent.
        
        Args:
            rag_service: RAG service instance
            crm_service: CRM service instance
            action_enforcement: Action enforcement service instance
        """
        self.rag_service = rag_service or get_rag_service()
        self.crm_service = crm_service or get_crm_service()
        self.action_enforcement = action_enforcement or get_action_enforcement_service()
        
        self.actions_count = 0
        self.refunds_processed = 0
        self.credits_issued = 0
        self.total_amount_processed = 0.0
    
    async def process_refund_request(
        self,
        ticket_id: str,
        order_id: str,
        reason: str,
        purchase_date: str,
        amount: float
    ) -> FinanceDecision:
        """
        Process a refund request.
        
        Args:
            ticket_id: Ticket identifier
            order_id: Order identifier
            reason: Reason for refund
            purchase_date: Purchase date (YYYY-MM-DD)
            amount: Refund amount
            
        Returns:
            FinanceDecision with refund details
        """
        self.actions_count += 1
        
        # Step 1: Query RAG for refund policy
        rag_query = f"refund policy for {reason} purchased {purchase_date}"
        rag_response = await self.rag_service.query(
            query=rag_query,
            documents=[PolicyDocument.REFUND_POLICY, PolicyDocument.COMPENSATION_GUIDELINES],
            max_results=3
        )
        
        # Extract policy references
        policy_references = [
            {
                "document": section.document.value,
                "section": section.section,
                "title": section.title,
                "content": section.content,
                "relevance_score": section.relevance_score
            }
            for section in rag_response.documents
        ]
        
        # Step 2: Verify eligibility
        eligibility = await self._verify_refund_eligibility(
            purchase_date=purchase_date,
            reason=reason,
            policy_sections=rag_response.documents
        )
        
        if not eligibility.qualified:
            # Not eligible - log and return
            await self.action_enforcement.log_action(
                ticket_id=ticket_id,
                action_type=ActionType.FINANCE_ACTION,
                agent_id="finance-001",
                agent_type="finance",
                details={
                    "action": "refund_denied",
                    "reason": eligibility.reason,
                    "policy_references": policy_references
                },
                status=TicketStatus.IN_PROGRESS
            )
            
            return FinanceDecision(
                ticket_id=ticket_id,
                order_id=order_id,
                action_type=FinanceActionType.POLICY_VERIFIED,
                policy_references=policy_references,
                rag_confidence=rag_response.confidence,
                eligibility=eligibility,
                approval_required=False
            )
        
        # Step 3: Calculate refund amount
        calculation = await self._calculate_refund(
            base_amount=amount,
            reason=reason,
            policy_sections=rag_response.documents
        )
        
        # Step 4: Check approval requirements
        approval_level = self._get_approval_level(calculation.final_amount)
        approval_required = approval_level != ApprovalLevel.AUTO_APPROVED
        
        # Step 5: Process refund if auto-approved
        transaction_id = None
        processing_time = None
        
        if not approval_required:
            transaction_id = f"TXN-{uuid4().hex[:8].upper()}"
            processing_time = "3-5 business days"
            self.refunds_processed += 1
            self.total_amount_processed += calculation.final_amount
        
        # Step 6: Update CRM
        await self.action_enforcement.log_action(
            ticket_id=ticket_id,
            action_type=ActionType.FINANCE_ACTION,
            agent_id="finance-001",
            agent_type="finance",
            details={
                "action": "refund_processed" if not approval_required else "approval_requested",
                "order_id": order_id,
                "amount": calculation.final_amount,
                "approval_required": approval_required,
                "approval_level": approval_level.value if approval_required else None,
                "transaction_id": transaction_id,
                "policy_references": policy_references
            },
            status=TicketStatus.IN_PROGRESS if approval_required else TicketStatus.RESOLVED
        )
        
        return FinanceDecision(
            ticket_id=ticket_id,
            order_id=order_id,
            action_type=FinanceActionType.REFUND_PROCESSED if not approval_required else FinanceActionType.APPROVAL_REQUESTED,
            amount=calculation.final_amount,
            policy_references=policy_references,
            rag_confidence=rag_response.confidence,
            eligibility=eligibility,
            calculation=calculation,
            approval_required=approval_required,
            approval_level=approval_level if approval_required else None,
            transaction_id=transaction_id,
            processing_time=processing_time
        )
    
    async def issue_store_credit(
        self,
        ticket_id: str,
        order_id: str,
        reason: str,
        amount: float
    ) -> FinanceDecision:
        """
        Issue store credit.
        
        Args:
            ticket_id: Ticket identifier
            order_id: Order identifier
            reason: Reason for credit
            amount: Credit amount
            
        Returns:
            FinanceDecision with credit details
        """
        self.actions_count += 1
        
        # Step 1: Query RAG for credit policy
        rag_query = f"store credit policy for {reason}"
        rag_response = await self.rag_service.query(
            query=rag_query,
            documents=[PolicyDocument.CREDIT_POLICY, PolicyDocument.COMPENSATION_GUIDELINES],
            max_results=3
        )
        
        # Extract policy references
        policy_references = [
            {
                "document": section.document.value,
                "section": section.section,
                "title": section.title,
                "content": section.content,
                "relevance_score": section.relevance_score
            }
            for section in rag_response.documents
        ]
        
        # Step 2: Calculate credit amount based on policy
        calculation = await self._calculate_credit(
            base_amount=amount,
            reason=reason,
            policy_sections=rag_response.documents
        )
        
        # Step 3: Check approval requirements
        approval_level = self._get_approval_level(calculation.final_amount)
        approval_required = approval_level != ApprovalLevel.AUTO_APPROVED
        
        # Step 4: Issue credit if auto-approved
        transaction_id = None
        
        if not approval_required:
            transaction_id = f"CRD-{uuid4().hex[:8].upper()}"
            self.credits_issued += 1
            self.total_amount_processed += calculation.final_amount
        
        # Step 5: Update CRM
        await self.action_enforcement.log_action(
            ticket_id=ticket_id,
            action_type=ActionType.FINANCE_ACTION,
            agent_id="finance-001",
            agent_type="finance",
            details={
                "action": "credit_issued" if not approval_required else "approval_requested",
                "order_id": order_id,
                "amount": calculation.final_amount,
                "approval_required": approval_required,
                "approval_level": approval_level.value if approval_required else None,
                "transaction_id": transaction_id,
                "policy_references": policy_references
            },
            status=TicketStatus.IN_PROGRESS if approval_required else TicketStatus.RESOLVED
        )
        
        return FinanceDecision(
            ticket_id=ticket_id,
            order_id=order_id,
            action_type=FinanceActionType.CREDIT_ISSUED if not approval_required else FinanceActionType.APPROVAL_REQUESTED,
            amount=calculation.final_amount,
            policy_references=policy_references,
            rag_confidence=rag_response.confidence,
            calculation=calculation,
            approval_required=approval_required,
            approval_level=approval_level if approval_required else None,
            transaction_id=transaction_id
        )
    
    async def calculate_compensation(
        self,
        ticket_id: str,
        order_id: str,
        issue_type: str,
        severity: str,
        order_amount: float
    ) -> FinanceDecision:
        """
        Calculate compensation for service issues.
        
        Args:
            ticket_id: Ticket identifier
            order_id: Order identifier
            issue_type: Type of issue (delay, damage, wrong_item, etc.)
            severity: Severity level (minor, moderate, severe)
            order_amount: Original order amount
            
        Returns:
            FinanceDecision with compensation details
        """
        self.actions_count += 1
        
        # Step 1: Query RAG for compensation guidelines
        rag_query = f"compensation for {issue_type} {severity} severity"
        rag_response = await self.rag_service.query(
            query=rag_query,
            documents=[PolicyDocument.COMPENSATION_GUIDELINES],
            max_results=3
        )
        
        # Extract policy references
        policy_references = [
            {
                "document": section.document.value,
                "section": section.section,
                "title": section.title,
                "content": section.content,
                "relevance_score": section.relevance_score
            }
            for section in rag_response.documents
        ]
        
        # Step 2: Calculate compensation based on policy
        calculation = await self._calculate_compensation_amount(
            issue_type=issue_type,
            severity=severity,
            order_amount=order_amount,
            policy_sections=rag_response.documents
        )
        
        # Step 3: Update CRM
        await self.action_enforcement.log_action(
            ticket_id=ticket_id,
            action_type=ActionType.FINANCE_ACTION,
            agent_id="finance-001",
            agent_type="finance",
            details={
                "action": "compensation_calculated",
                "order_id": order_id,
                "issue_type": issue_type,
                "severity": severity,
                "amount": calculation.final_amount,
                "policy_references": policy_references
            },
            status=TicketStatus.IN_PROGRESS
        )
        
        return FinanceDecision(
            ticket_id=ticket_id,
            order_id=order_id,
            action_type=FinanceActionType.COMPENSATION_CALCULATED,
            amount=calculation.final_amount,
            policy_references=policy_references,
            rag_confidence=rag_response.confidence,
            calculation=calculation,
            approval_required=False
        )
    
    async def _verify_refund_eligibility(
        self,
        purchase_date: str,
        reason: str,
        policy_sections: List[PolicySection]
    ) -> EligibilityResult:
        """
        Verify refund eligibility based on policy.
        
        Args:
            purchase_date: Purchase date (YYYY-MM-DD)
            reason: Reason for refund
            policy_sections: Retrieved policy sections
            
        Returns:
            EligibilityResult
        """
        # Calculate days since purchase
        purchase_dt = datetime.strptime(purchase_date, "%Y-%m-%d")
        days_since_purchase = (datetime.utcnow() - purchase_dt).days
        
        # Check 30-day window (from policy)
        if days_since_purchase > 30:
            # Check if defective (no time limit for defects)
            if "defect" in reason.lower() or "broken" in reason.lower():
                return EligibilityResult(
                    qualified=True,
                    reason="Defective products eligible regardless of purchase date",
                    policy_references=[
                        {"document": "refund_policy.pdf", "section": "4.0"}
                    ]
                )
            else:
                return EligibilityResult(
                    qualified=False,
                    reason=f"Purchase date exceeds 30-day return window ({days_since_purchase} days)",
                    restrictions=["Must be within 30 days of purchase"]
                )
        
        # Within 30-day window
        return EligibilityResult(
            qualified=True,
            reason=f"Within 30-day return window ({days_since_purchase} days)",
            policy_references=[
                {"document": "refund_policy.pdf", "section": "1.0"}
            ]
        )
    
    async def _calculate_refund(
        self,
        base_amount: float,
        reason: str,
        policy_sections: List[PolicySection]
    ) -> CompensationCalculation:
        """
        Calculate refund amount based on policy.
        
        Args:
            base_amount: Base refund amount
            reason: Reason for refund
            policy_sections: Retrieved policy sections
            
        Returns:
            CompensationCalculation
        """
        adjustments = []
        final_amount = base_amount
        
        # Check for restocking fee (opened electronics)
        if "electronic" in reason.lower() and "opened" in reason.lower():
            restocking_fee = base_amount * 0.15
            adjustments.append({
                "type": "restocking_fee",
                "amount": -restocking_fee,
                "reason": "15% restocking fee for opened electronics"
            })
            final_amount -= restocking_fee
        
        # No restocking fee for damaged items
        if "damaged" in reason.lower() or "defect" in reason.lower():
            adjustments.append({
                "type": "no_restocking_fee",
                "amount": 0.0,
                "reason": "No restocking fee for damaged/defective items"
            })
        
        return CompensationCalculation(
            base_amount=base_amount,
            adjustments=adjustments,
            final_amount=round(final_amount, 2),
            policy_references=[
                {"document": "refund_policy.pdf", "section": "2.0"}
            ]
        )
    
    async def _calculate_credit(
        self,
        base_amount: float,
        reason: str,
        policy_sections: List[PolicySection]
    ) -> CompensationCalculation:
        """
        Calculate store credit amount based on policy.
        
        Args:
            base_amount: Base credit amount
            reason: Reason for credit
            policy_sections: Retrieved policy sections
            
        Returns:
            CompensationCalculation
        """
        adjustments = []
        final_amount = base_amount
        
        # Check for late delivery credit
        if "late" in reason.lower() or "delay" in reason.lower():
            # Extract days late if mentioned
            if "1-3 days" in reason.lower():
                credit_pct = 0.05
            elif "4-7 days" in reason.lower():
                credit_pct = 0.10
            elif "8" in reason.lower() or "more" in reason.lower():
                credit_pct = 0.15
            else:
                credit_pct = 0.10  # Default
            
            credit_amount = base_amount * credit_pct
            adjustments.append({
                "type": "late_delivery_credit",
                "amount": credit_amount,
                "reason": f"{int(credit_pct*100)}% credit for late delivery"
            })
            final_amount = credit_amount
        
        return CompensationCalculation(
            base_amount=base_amount,
            adjustments=adjustments,
            final_amount=round(final_amount, 2),
            policy_references=[
                {"document": "credit_policy.pdf", "section": "3.0"}
            ]
        )
    
    async def _calculate_compensation_amount(
        self,
        issue_type: str,
        severity: str,
        order_amount: float,
        policy_sections: List[PolicySection]
    ) -> CompensationCalculation:
        """
        Calculate compensation amount based on issue and severity.
        
        Args:
            issue_type: Type of issue
            severity: Severity level
            order_amount: Original order amount
            policy_sections: Retrieved policy sections
            
        Returns:
            CompensationCalculation
        """
        adjustments = []
        
        # Base compensation by issue type
        if issue_type == "delay":
            if severity == "minor":
                compensation = order_amount * 0.05
            elif severity == "moderate":
                compensation = order_amount * 0.10
            else:  # severe
                compensation = order_amount * 0.15
        elif issue_type == "damage":
            compensation = order_amount * 0.10  # 10% for inconvenience
        elif issue_type == "wrong_item":
            compensation = order_amount * 0.15  # 15% for inconvenience
        else:
            compensation = 25.00  # Default goodwill gesture
        
        adjustments.append({
            "type": "base_compensation",
            "amount": compensation,
            "reason": f"Compensation for {issue_type} ({severity} severity)"
        })
        
        return CompensationCalculation(
            base_amount=order_amount,
            adjustments=adjustments,
            final_amount=round(compensation, 2),
            policy_references=[
                {"document": "compensation_guidelines.pdf", "section": "2.0"}
            ]
        )
    
    def _get_approval_level(self, amount: float) -> ApprovalLevel:
        """
        Determine approval level based on amount.
        
        Args:
            amount: Transaction amount
            
        Returns:
            ApprovalLevel
        """
        if amount < self.APPROVAL_THRESHOLDS["auto_approve"]:
            return ApprovalLevel.AUTO_APPROVED
        elif amount < self.APPROVAL_THRESHOLDS["manager"]:
            return ApprovalLevel.MANAGER
        elif amount < self.APPROVAL_THRESHOLDS["director"]:
            return ApprovalLevel.DIRECTOR
        else:
            return ApprovalLevel.EXECUTIVE
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get finance agent statistics.
        
        Returns:
            Dictionary with statistics
        """
        return {
            "total_actions": self.actions_count,
            "refunds_processed": self.refunds_processed,
            "credits_issued": self.credits_issued,
            "total_amount_processed": round(self.total_amount_processed, 2),
            "rag_stats": self.rag_service.get_statistics()
        }


# Global finance agent instance
_finance_agent: Optional[FinanceAgent] = None


def get_finance_agent() -> FinanceAgent:
    """
    Get the global finance agent instance.
    
    Returns:
        The finance agent
    """
    global _finance_agent
    if _finance_agent is None:
        _finance_agent = FinanceAgent()
    return _finance_agent

# Made with Bob
