"""Database models — import all to ensure SQLAlchemy relationships resolve correctly."""

from app.models.space import Space, SpaceBuiltinAgentConfig, CustomAgent, ChatbotCustomAgent, BuiltinAgentCatalog
from app.models.chat import ChatSession
from app.models.chatbot import Chatbot
from app.models.datasource import SpaceDataSource
from app.models.document import Document
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseItem, AgentKnowledgeBase
from app.models.agent import Agent, AgentType, AgentStatus
from app.models.workflow import Workflow, ExecutionType, WorkflowStatus
from app.models.task import Task, TaskStatus
from app.models.execution import Execution, ExecutionStatus
from app.models.conversation import Conversation, Message
from app.models.inbox import SessionWaitingQueue, SessionAssignmentHistory, SpaceAssignmentRule
from app.models.staff import StaffMember

__all__ = [
    "Space", "SpaceBuiltinAgentConfig", "CustomAgent", "ChatbotCustomAgent", "BuiltinAgentCatalog",
    "ChatSession",
    "Chatbot",
    "SpaceDataSource",
    "Document",
    "KnowledgeBase", "KnowledgeBaseItem", "AgentKnowledgeBase",

    "Agent", "AgentType", "AgentStatus",
    "Workflow", "ExecutionType", "WorkflowStatus",
    "Task", "TaskStatus",
    "Execution", "ExecutionStatus",
    "Conversation", "Message",
    "SessionWaitingQueue", "SessionAssignmentHistory", "SpaceAssignmentRule",
    "StaffMember",
]

# Made with Bob
