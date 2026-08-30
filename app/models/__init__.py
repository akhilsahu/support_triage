"""Database models — import all to ensure SQLAlchemy relationships resolve correctly."""

from app.models.space import Space, SpaceBuiltinAgentConfig, CustomAgent, ChatbotCustomAgent, BuiltinAgentCatalog
from app.models.chat import ChatSession, MessageThought
from app.models.chatbot import Chatbot
from app.models.chatbot_user import ChatbotUser, ChatbotUserIdentity
from app.models.datasource import SpaceDataSource
from app.models.ingestion_job import IngestionJob
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseItem, AgentKnowledgeBase
from app.models.kb_fact import KBFact
from app.models.agent import Agent, AgentType, AgentStatus
from app.models.workflow import Workflow, ExecutionType, WorkflowStatus
from app.models.task import Task, TaskStatus
from app.models.execution import Execution, ExecutionStatus
from app.models.conversation import Conversation, Message
from app.models.conversation_event import ConversationEvent
from app.models.evaluation import EvaluationSuite, EvaluationCase, EvaluationRun, EvaluationResult
from app.models.inbox import SessionWaitingQueue, SessionAssignmentHistory, SpaceAssignmentRule
from app.models.staff import StaffMember
from app.models.training_feedback import TrainingFeedback

__all__ = [
    "Space", "SpaceBuiltinAgentConfig", "CustomAgent", "ChatbotCustomAgent", "BuiltinAgentCatalog",
    "ChatSession", "MessageThought",
    "Chatbot",
    "ChatbotUser", "ChatbotUserIdentity",
    "SpaceDataSource",
    "IngestionJob",
    "KnowledgeBase", "KnowledgeBaseItem", "AgentKnowledgeBase", "KBFact",

    "Agent", "AgentType", "AgentStatus",
    "Workflow", "ExecutionType", "WorkflowStatus",
    "Task", "TaskStatus",
    "Execution", "ExecutionStatus",
    "Conversation", "Message", "ConversationEvent",
    "EvaluationSuite", "EvaluationCase", "EvaluationRun", "EvaluationResult",
    "SessionWaitingQueue", "SessionAssignmentHistory", "SpaceAssignmentRule",
    "StaffMember",
    "TrainingFeedback",
]

# Made with Bob
