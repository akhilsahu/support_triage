"""
CRM Service with Mock Database

This module implements a CRM service with mock database functionality.
Every successful resolution by the Orchestrator MUST call CRMService.update_record().

Key Features:
- Mock database for CRM records
- Mandatory update enforcement
- Audit trail logging
- Async operation support
- Validation to prevent completion without CRM update
"""

from typing import Any, Dict, List, Optional
from datetime import datetime
from uuid import uuid4
import asyncio
from enum import Enum

from pydantic import BaseModel, Field


class TicketStatus(str, Enum):
    """Ticket status enumeration"""
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"
    ESCALATED = "escalated"


class ActionType(str, Enum):
    """Action type enumeration"""
    TRIAGE_COMPLETE = "triage_complete"
    LOGISTICS_ACTION = "logistics_action"
    FINANCE_ACTION = "finance_action"
    ESCALATION_CREATED = "escalation_created"
    TICKET_CLOSED = "ticket_closed"


class CRMRecord(BaseModel):
    """CRM record model"""
    ticket_id: str
    customer_id: str
    status: TicketStatus
    last_action: Optional[ActionType] = None
    last_agent: Optional[str] = None
    priority: int = Field(ge=1, le=4)
    sentiment: Optional[str] = None
    actions: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class CRMUpdate(BaseModel):
    """CRM update request model"""
    ticket_id: str
    action_type: ActionType
    agent_id: str
    agent_type: str
    status: Optional[TicketStatus] = None
    details: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ActionRequiredException(Exception):
    """Exception raised when attempting to close ticket without CRM update"""
    pass


class CRMService:
    """
    CRM Service with mock database.
    
    Provides CRM functionality with a mock in-memory database.
    Enforces the "Action over Conversation" principle by requiring
    CRM updates before ticket completion.
    """
    
    def __init__(self):
        """Initialize the CRM service with mock database"""
        # Mock database: ticket_id -> CRMRecord
        self._records: Dict[str, CRMRecord] = {}
        # Track which tickets have been updated
        self._updated_tickets: set[str] = set()
        # Audit log
        self._audit_log: List[Dict[str, Any]] = []
    
    async def create_record(
        self,
        ticket_id: str,
        customer_id: str,
        priority: int = 3,
        sentiment: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> CRMRecord:
        """
        Create a new CRM record.
        
        Args:
            ticket_id: Unique ticket identifier
            customer_id: Customer identifier
            priority: Priority level (1-4)
            sentiment: Customer sentiment
            metadata: Additional metadata
            
        Returns:
            The created CRM record
        """
        record = CRMRecord(
            ticket_id=ticket_id,
            customer_id=customer_id,
            status=TicketStatus.OPEN,
            priority=priority,
            sentiment=sentiment,
            metadata=metadata or {}
        )
        
        self._records[ticket_id] = record
        
        # Log creation
        await self._log_audit(
            ticket_id=ticket_id,
            action="record_created",
            details={"customer_id": customer_id, "priority": priority}
        )
        
        return record
    
    async def update_record(
        self,
        update: CRMUpdate
    ) -> CRMRecord:
        """
        Update a CRM record.
        
        This is the MANDATORY method that must be called for every
        successful resolution. No ticket can be closed without calling this.
        
        Args:
            update: The CRM update data
            
        Returns:
            The updated CRM record
            
        Raises:
            ValueError: If ticket not found
        """
        ticket_id = update.ticket_id
        
        if ticket_id not in self._records:
            raise ValueError(f"Ticket {ticket_id} not found in CRM")
        
        record = self._records[ticket_id]
        
        # Update record fields
        record.last_action = update.action_type
        record.last_agent = update.agent_id
        record.updated_at = datetime.utcnow()
        
        if update.status:
            record.status = update.status
        
        # Add action to history
        action_entry = {
            "action_type": update.action_type.value,
            "agent_id": update.agent_id,
            "agent_type": update.agent_type,
            "timestamp": datetime.utcnow().isoformat(),
            "details": update.details,
            "metadata": update.metadata
        }
        record.actions.append(action_entry)
        
        # Mark ticket as updated
        self._updated_tickets.add(ticket_id)
        
        # Log update
        await self._log_audit(
            ticket_id=ticket_id,
            action="record_updated",
            details={
                "action_type": update.action_type.value,
                "agent_id": update.agent_id,
                "status": update.status.value if update.status else None
            }
        )
        
        return record
    
    async def get_record(self, ticket_id: str) -> Optional[CRMRecord]:
        """
        Get a CRM record by ticket ID.
        
        Args:
            ticket_id: The ticket identifier
            
        Returns:
            The CRM record if found, None otherwise
        """
        return self._records.get(ticket_id)
    
    async def check_update(self, ticket_id: str) -> bool:
        """
        Check if a ticket has been updated.
        
        Used by ActionEnforcementService to validate that CRM was updated
        before allowing ticket completion.
        
        Args:
            ticket_id: The ticket identifier
            
        Returns:
            True if ticket has been updated, False otherwise
        """
        return ticket_id in self._updated_tickets
    
    async def get_actions(self, ticket_id: str) -> List[Dict[str, Any]]:
        """
        Get all actions for a ticket.
        
        Args:
            ticket_id: The ticket identifier
            
        Returns:
            List of actions
        """
        record = self._records.get(ticket_id)
        if record:
            return record.actions
        return []
    
    async def get_audit_log(
        self,
        ticket_id: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get audit log entries.
        
        Args:
            ticket_id: Optional ticket ID to filter by
            limit: Maximum number of entries to return
            
        Returns:
            List of audit log entries
        """
        if ticket_id:
            logs = [
                log for log in self._audit_log
                if log.get("ticket_id") == ticket_id
            ]
        else:
            logs = self._audit_log
        
        return logs[-limit:]
    
    async def get_statistics(self) -> Dict[str, Any]:
        """
        Get CRM statistics.
        
        Returns:
            Dictionary with statistics
        """
        total_records = len(self._records)
        status_counts = {}
        
        for record in self._records.values():
            status = record.status.value
            status_counts[status] = status_counts.get(status, 0) + 1
        
        return {
            "total_records": total_records,
            "status_counts": status_counts,
            "updated_tickets": len(self._updated_tickets),
            "audit_log_entries": len(self._audit_log)
        }
    
    async def _log_audit(
        self,
        ticket_id: str,
        action: str,
        details: Dict[str, Any]
    ) -> None:
        """
        Log an audit entry.
        
        Args:
            ticket_id: The ticket identifier
            action: The action performed
            details: Action details
        """
        entry = {
            "id": str(uuid4()),
            "ticket_id": ticket_id,
            "action": action,
            "details": details,
            "timestamp": datetime.utcnow().isoformat()
        }
        self._audit_log.append(entry)
    
    def reset(self) -> None:
        """
        Reset the mock database.
        
        Used for testing purposes.
        """
        self._records.clear()
        self._updated_tickets.clear()
        self._audit_log.clear()


class ActionEnforcementService:
    """
    Service to enforce the "Action over Conversation" principle.
    
    Validates that required actions were taken before allowing
    ticket completion.
    """
    
    def __init__(self, crm_service: CRMService):
        """
        Initialize the action enforcement service.
        
        Args:
            crm_service: The CRM service instance
        """
        self.crm_service = crm_service
    
    async def validate_completion(
        self,
        ticket_id: str,
        agent_id: str
    ) -> bool:
        """
        Validate that required actions were taken before completion.
        
        Args:
            ticket_id: The ticket identifier
            agent_id: The agent attempting to complete the ticket
            
        Returns:
            True if validation passes
            
        Raises:
            ActionRequiredException: If CRM was not updated
        """
        # Check if CRM was updated
        crm_updated = await self.crm_service.check_update(ticket_id)
        
        if not crm_updated:
            raise ActionRequiredException(
                f"Agent {agent_id} attempted to close ticket {ticket_id} "
                "without any CRM updates. Every resolution MUST update the CRM."
            )
        
        # Check if at least one action was taken
        actions = await self.crm_service.get_actions(ticket_id)
        
        if not actions:
            raise ActionRequiredException(
                f"Agent {agent_id} attempted to close ticket {ticket_id} "
                "without any system actions. Every resolution MUST result in action."
            )
        
        return True
    
    async def log_action(
        self,
        ticket_id: str,
        action_type: ActionType,
        agent_id: str,
        agent_type: str,
        details: Dict[str, Any],
        status: Optional[TicketStatus] = None
    ) -> None:
        """
        Log an action and update CRM.
        
        This is a convenience method that combines action logging
        with CRM update.
        
        Args:
            ticket_id: The ticket identifier
            action_type: The type of action
            agent_id: The agent identifier
            agent_type: The agent type
            details: Action details
            status: Optional new status
        """
        update = CRMUpdate(
            ticket_id=ticket_id,
            action_type=action_type,
            agent_id=agent_id,
            agent_type=agent_type,
            status=status,
            details=details
        )
        
        await self.crm_service.update_record(update)


# Global service instances
_crm_service: Optional[CRMService] = None
_action_enforcement_service: Optional[ActionEnforcementService] = None


def get_crm_service() -> CRMService:
    """
    Get the global CRM service instance.
    
    Returns:
        The CRM service
    """
    global _crm_service
    if _crm_service is None:
        _crm_service = CRMService()
    return _crm_service


def get_action_enforcement_service() -> ActionEnforcementService:
    """
    Get the global action enforcement service instance.
    
    Returns:
        The action enforcement service
    """
    global _action_enforcement_service
    if _action_enforcement_service is None:
        _action_enforcement_service = ActionEnforcementService(get_crm_service())
    return _action_enforcement_service

# Made with Bob
