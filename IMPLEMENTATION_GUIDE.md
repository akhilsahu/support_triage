# FastAPI Multi-Agent Backend - Implementation Guide

## Table of Contents
1. [Project Setup](#project-setup)
2. [Database Configuration](#database-configuration)
3. [Core Models](#core-models)
4. [RAG Implementation](#rag-implementation)
5. [Agent System](#agent-system)
6. [Workflow Engine](#workflow-engine)
7. [API Implementation](#api-implementation)
8. [Testing Strategy](#testing-strategy)

---

## 1. Project Setup

### Dependencies (pyproject.toml)

```toml
[tool.poetry]
name = "fastapi-multi-agent-backend"
version = "1.0.0"
description = "FastAPI backend for AI Support multi-agent system"
authors = ["Your Name <your.email@example.com>"]

[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.109.0"
uvicorn = {extras = ["standard"], version = "^0.27.0"}
sqlalchemy = "^2.0.25"
asyncpg = "^0.29.0"
psycopg2-binary = "^2.9.9"
pgvector = "^0.2.4"
alembic = "^1.13.1"
pydantic = "^2.5.3"
pydantic-settings = "^2.1.0"
redis = "^5.0.1"
langchain = "^0.1.0"
langchain-openai = "^0.0.2"
langchain-community = "^0.0.10"
langgraph = "^0.0.20"
sentence-transformers = "^2.3.1"
openai = "^1.10.0"
anthropic = "^0.8.1"
celery = "^5.3.6"
python-multipart = "^0.0.6"
python-jose = {extras = ["cryptography"], version = "^3.3.0"}
passlib = {extras = ["bcrypt"], version = "^1.7.4"}
python-dotenv = "^1.0.0"
httpx = "^0.26.0"
websockets = "^12.0"
prometheus-client = "^0.19.0"
structlog = "^24.1.0"

[tool.poetry.group.dev.dependencies]
pytest = "^7.4.4"
pytest-asyncio = "^0.23.3"
pytest-cov = "^4.1.0"
black = "^24.1.1"
ruff = "^0.1.14"
mypy = "^1.8.0"
pre-commit = "^3.6.0"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
```

### Environment Configuration (.env.example)

```bash
# Application
APP_NAME=FastAPI Multi-Agent Backend
APP_VERSION=1.0.0
DEBUG=false
LOG_LEVEL=INFO
ENVIRONMENT=development

# Server
HOST=0.0.0.0
PORT=8000
WORKERS=4

# Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/multiagent
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=10

# Redis
REDIS_URL=redis://localhost:6379/0
REDIS_MAX_CONNECTIONS=50

# Security
SECRET_KEY=your-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS
CORS_ORIGINS=["http://localhost:3000","http://localhost:8080"]
CORS_ALLOW_CREDENTIALS=true
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]

# LLM APIs
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4-turbo-preview
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-opus-20240229

# Embeddings
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSION=384
EMBEDDING_BATCH_SIZE=32

# RAG Configuration
RAG_TOP_K=5
RAG_SIMILARITY_THRESHOLD=0.7
RAG_CHUNK_SIZE=1000
RAG_CHUNK_OVERLAP=200

# Celery
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2
CELERY_TASK_TRACK_STARTED=true
CELERY_TASK_TIME_LIMIT=3600

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
```

---

## 2. Database Configuration

### SQLAlchemy Setup with pgvector

**File: `app/core/database.py`**

```python
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import event
from pgvector.sqlalchemy import Vector
from app.config import settings

# Create async engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=settings.DATABASE_POOL_SIZE,
    max_overflow=settings.DATABASE_MAX_OVERFLOW,
    pool_pre_ping=True,
)

# Create session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Base class for models
Base = declarative_base()

# Enable pgvector extension
@event.listens_for(engine.sync_engine, "connect")
def enable_pgvector(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("CREATE EXTENSION IF NOT EXISTS vector")
    cursor.close()

async def get_db() -> AsyncSession:
    """Dependency for getting async database session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

async def init_db():
    """Initialize database tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
```

### Alembic Configuration

**File: `alembic/env.py`**

```python
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context
from app.core.database import Base
from app.config import settings

# Import all models
from app.models import agent, workflow, task, document, conversation, execution

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()

async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()

def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    import asyncio
    asyncio.run(run_migrations_online())
```

---

## 3. Core Models

### Document Model with Vector Support

**File: `app/models/document.py`**

```python
from sqlalchemy import Column, String, Text, Integer, DateTime, JSON, Index
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector
from datetime import datetime
import uuid
from app.core.database import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content = Column(Text, nullable=False)
    metadata = Column(JSON, default={})
    embedding = Column(Vector(384), nullable=True)  # Dimension based on model
    source = Column(String(500), nullable=False)
    chunk_index = Column(Integer, default=0)
    parent_document_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Create vector index for similarity search
    __table_args__ = (
        Index(
            'ix_documents_embedding',
            'embedding',
            postgresql_using='ivfflat',
            postgresql_with={'lists': 100},
            postgresql_ops={'embedding': 'vector_cosine_ops'}
        ),
    )
```

### Agent Model

**File: `app/models/agent.py`**

```python
from sqlalchemy import Column, String, Text, Enum, DateTime, JSON
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
import enum
from app.core.database import Base

class AgentType(str, enum.Enum):
    CHAT = "chat"
    TASK = "task"
    ANALYSIS = "analysis"
    ORCHESTRATOR = "orchestrator"
    CUSTOM = "custom"

class AgentStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    MAINTENANCE = "maintenance"

class Agent(Base):
    __tablename__ = "agents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, unique=True)
    type = Column(Enum(AgentType), nullable=False)
    description = Column(Text)
    capabilities = Column(JSON, default=[])
    configuration = Column(JSON, default={})
    status = Column(Enum(AgentStatus), default=AgentStatus.ACTIVE)
    version = Column(String(50), default="1.0.0")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

### Workflow Model

**File: `app/models/workflow.py`**

```python
from sqlalchemy import Column, String, Text, Enum, DateTime, JSON
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
import enum
from app.core.database import Base

class ExecutionType(str, enum.Enum):
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    CONDITIONAL = "conditional"
    GRAPH = "graph"

class WorkflowStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"

class Workflow(Base):
    __tablename__ = "workflows"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    execution_type = Column(Enum(ExecutionType), nullable=False)
    steps = Column(JSON, nullable=False)  # Workflow definition
    configuration = Column(JSON, default={})
    status = Column(Enum(WorkflowStatus), default=WorkflowStatus.DRAFT)
    version = Column(String(50), default="1.0.0")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

### Task Model

**File: `app/models/task.py`**

```python
from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum
from app.core.database import Base

class TaskStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(UUID(as_uuid=True), ForeignKey("workflows.id"), nullable=True)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False)
    name = Column(String(255), nullable=False)
    input_data = Column(JSON, nullable=False)
    output_data = Column(JSON, nullable=True)
    error_message = Column(String(1000), nullable=True)
    status = Column(Enum(TaskStatus), default=TaskStatus.PENDING)
    priority = Column(Integer, default=0)
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    workflow = relationship("Workflow", backref="tasks")
    agent = relationship("Agent", backref="tasks")
```

---

## 4. RAG Implementation

### Embedding Service

**File: `app/services/embedding_service.py`**

```python
from sentence_transformers import SentenceTransformer
from typing import List
import numpy as np
from app.config import settings

class EmbeddingService:
    def __init__(self):
        self.model = SentenceTransformer(settings.EMBEDDING_MODEL)
        self.dimension = settings.EMBEDDING_DIMENSION

    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for a single text"""
        embedding = self.model.encode(text, convert_to_numpy=True)
        return embedding.tolist()

    async def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts"""
        embeddings = self.model.encode(
            texts,
            batch_size=settings.EMBEDDING_BATCH_SIZE,
            convert_to_numpy=True
        )
        return embeddings.tolist()

    def cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        vec1_np = np.array(vec1)
        vec2_np = np.array(vec2)
        return np.dot(vec1_np, vec2_np) / (
            np.linalg.norm(vec1_np) * np.linalg.norm(vec2_np)
        )

embedding_service = EmbeddingService()
```

### RAG Retriever

**File: `app/rag/retriever.py`**

```python
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
from app.models.document import Document
from app.services.embedding_service import embedding_service
from app.config import settings

class RAGRetriever:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def retrieve(
        self,
        query: str,
        top_k: int = None,
        similarity_threshold: float = None,
        filters: Dict[str, Any] = None
    ) -> List[Document]:
        """Retrieve relevant documents using vector similarity"""
        top_k = top_k or settings.RAG_TOP_K
        similarity_threshold = similarity_threshold or settings.RAG_SIMILARITY_THRESHOLD

        # Generate query embedding
        query_embedding = await embedding_service.generate_embedding(query)

        # Build query with vector similarity
        stmt = select(
            Document,
            func.cosine_distance(Document.embedding, query_embedding).label("distance")
        )

        # Apply filters if provided
        if filters:
            for key, value in filters.items():
                if hasattr(Document, key):
                    stmt = stmt.where(getattr(Document, key) == value)

        # Order by similarity and limit results
        stmt = stmt.order_by("distance").limit(top_k)

        result = await self.db.execute(stmt)
        documents = []

        for doc, distance in result:
            similarity = 1 - distance
            if similarity >= similarity_threshold:
                documents.append(doc)

        return documents

    async def retrieve_with_scores(
        self,
        query: str,
        top_k: int = None,
        filters: Dict[str, Any] = None
    ) -> List[tuple[Document, float]]:
        """Retrieve documents with similarity scores"""
        top_k = top_k or settings.RAG_TOP_K
        query_embedding = await embedding_service.generate_embedding(query)

        stmt = select(
            Document,
            func.cosine_distance(Document.embedding, query_embedding).label("distance")
        )

        if filters:
            for key, value in filters.items():
                if hasattr(Document, key):
                    stmt = stmt.where(getattr(Document, key) == value)

        stmt = stmt.order_by("distance").limit(top_k)
        result = await self.db.execute(stmt)

        return [(doc, 1 - distance) for doc, distance in result]
```

### LangChain RAG Chain

**File: `app/rag/chain.py`**

```python
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from langchain.schema import Document as LangChainDocument
from typing import List, Dict, Any
from app.models.document import Document
from app.rag.retriever import RAGRetriever
from app.config import settings

class RAGChain:
    def __init__(self, retriever: RAGRetriever):
        self.retriever = retriever
        self.llm = ChatOpenAI(
            model=settings.OPENAI_MODEL,
            temperature=0.7,
            api_key=settings.OPENAI_API_KEY
        )

        self.prompt_template = PromptTemplate(
            template="""Use the following context to answer the question.
If you cannot answer based on the context, say so.

Context:
{context}

Question: {question}

Answer:""",
            input_variables=["context", "question"]
        )

    async def query(
        self,
        question: str,
        filters: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Execute RAG query"""
        # Retrieve relevant documents
        documents = await self.retriever.retrieve(question, filters=filters)

        if not documents:
            return {
                "answer": "I don't have enough information to answer this question.",
                "sources": []
            }

        # Format context
        context = "\n\n".join([doc.content for doc in documents])

        # Generate answer
        prompt = self.prompt_template.format(context=context, question=question)
        response = await self.llm.ainvoke(prompt)

        return {
            "answer": response.content,
            "sources": [
                {
                    "id": str(doc.id),
                    "content": doc.content[:200] + "...",
                    "source": doc.source,
                    "metadata": doc.metadata
                }
                for doc in documents
            ]
        }

    async def query_with_reranking(
        self,
        question: str,
        filters: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Execute RAG query with result reranking"""
        # Retrieve documents with scores
        docs_with_scores = await self.retriever.retrieve_with_scores(
            question,
            top_k=settings.RAG_TOP_K * 2,
            filters=filters
        )

        # Rerank based on relevance (simplified - can use cross-encoder)
        reranked_docs = sorted(
            docs_with_scores,
            key=lambda x: x[1],
            reverse=True
        )[:settings.RAG_TOP_K]

        documents = [doc for doc, _ in reranked_docs]

        if not documents:
            return {
                "answer": "I don't have enough information to answer this question.",
                "sources": []
            }

        context = "\n\n".join([doc.content for doc in documents])
        prompt = self.prompt_template.format(context=context, question=question)
        response = await self.llm.ainvoke(prompt)

        return {
            "answer": response.content,
            "sources": [
                {
                    "id": str(doc.id),
                    "content": doc.content[:200] + "...",
                    "source": doc.source,
                    "metadata": doc.metadata,
                    "score": score
                }
                for doc, score in reranked_docs
            ]
        }
```

### Document Chunking

**File: `app/rag/chunking.py`**

```python
from typing import List, Dict, Any
from app.config import settings

class DocumentChunker:
    def __init__(
        self,
        chunk_size: int = None,
        chunk_overlap: int = None
    ):
        self.chunk_size = chunk_size or settings.RAG_CHUNK_SIZE
        self.chunk_overlap = chunk_overlap or settings.RAG_CHUNK_OVERLAP

    def chunk_text(self, text: str, metadata: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """Split text into overlapping chunks"""
        chunks = []
        start = 0
        text_length = len(text)

        while start < text_length:
            end = start + self.chunk_size
            chunk_text = text[start:end]

            chunk = {
                "content": chunk_text,
                "metadata": metadata or {},
                "chunk_index": len(chunks),
                "start_char": start,
                "end_char": min(end, text_length)
            }
            chunks.append(chunk)

            start += self.chunk_size - self.chunk_overlap

        return chunks

    def chunk_by_sentences(self, text: str, metadata: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """Split text by sentences while respecting chunk size"""
        import re
        sentences = re.split(r'(?<=[.!?])\s+', text)
        chunks = []
        current_chunk = []
        current_length = 0

        for sentence in sentences:
            sentence_length = len(sentence)

            if current_length + sentence_length > self.chunk_size and current_chunk:
                chunk_text = " ".join(current_chunk)
                chunks.append({
                    "content": chunk_text,
                    "metadata": metadata or {},
                    "chunk_index": len(chunks)
                })
                current_chunk = []
                current_length = 0

            current_chunk.append(sentence)
            current_length += sentence_length

        if current_chunk:
            chunk_text = " ".join(current_chunk)
            chunks.append({
                "content": chunk_text,
                "metadata": metadata or {},
                "chunk_index": len(chunks)
            })

        return chunks

chunker = DocumentChunker()
```

---

## 5. Agent System

### Base Agent Class

**File: `app/agents/base_agent.py`**

```python
from abc import ABC, abstractmethod
from typing import Dict, Any, List
from uuid import UUID
import structlog

logger = structlog.get_logger()

class BaseAgent(ABC):
    def __init__(self, agent_id: UUID, name: str, config: Dict[str, Any] = None):
        self.agent_id = agent_id
        self.name = name
        self.config = config or {}
        self.capabilities = self._define_capabilities()

    @abstractmethod
    def _define_capabilities(self) -> List[str]:
        """Define agent capabilities"""
        pass

    @abstractmethod
    async def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute agent task"""
        pass

    async def validate_input(self, input_data: Dict[str, Any]) -> bool:
        """Validate input data"""
        return True

    async def preprocess(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Preprocess input data"""
        return input_data

    async def postprocess(self, output_data: Dict[str, Any]) -> Dict[str, Any]:
        """Postprocess output data"""
        return output_data

    async def run(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Main execution flow"""
        try:
            logger.info(f"Agent {self.name} starting execution", agent_id=str(self.agent_id))

            # Validate input
            if not await self.validate_input(input_data):
                raise ValueError("Invalid input data")

            # Preprocess
            processed_input = await self.preprocess(input_data)

            # Execute
            output = await self.execute(processed_input)

            # Postprocess
            final_output = await self.postprocess(output)

            logger.info(f"Agent {self.name} completed execution", agent_id=str(self.agent_id))
            return final_output

        except Exception as e:
            logger.error(f"Agent {self.name} execution failed", error=str(e))
            raise
```

### Agent Registry

**File: `app/agents/registry.py`**

```python
from typing import Dict, Type, Optional
from uuid import UUID
from app.agents.base_agent import BaseAgent
import structlog

logger = structlog.get_logger()

class AgentRegistry:
    def __init__(self):
        self._agents: Dict[str, Type[BaseAgent]] = {}
        self._instances: Dict[UUID, BaseAgent] = {}

    def register(self, agent_type: str, agent_class: Type[BaseAgent]):
        """Register an agent class"""
        self._agents[agent_type] = agent_class
        logger.info(f"Registered agent type: {agent_type}")

    def create_instance(
        self,
        agent_id: UUID,
        agent_type: str,
        name: str,
        config: Dict = None
    ) -> BaseAgent:
        """Create an agent instance"""
        if agent_type not in self._agents:
            raise ValueError(f"Unknown agent type: {agent_type}")

        agent_class = self._agents[agent_type]
        instance = agent_class(agent_id, name, config)
        self._instances[agent_id] = instance

        logger.info(f"Created agent instance: {name}", agent_id=str(agent_id))
        return instance

    def get_instance(self, agent_id: UUID) -> Optional[BaseAgent]:
        """Get an agent instance by ID"""
        return self._instances.get(agent_id)

    def remove_instance(self, agent_id: UUID):
        """Remove an agent instance"""
        if agent_id in self._instances:
            del self._instances[agent_id]
            logger.info(f"Removed agent instance", agent_id=str(agent_id))

    def list_types(self) -> list[str]:
        """List all registered agent types"""
        return list(self._agents.keys())

agent_registry = AgentRegistry()
```

---

## 6. Workflow Engine

### Workflow Engine Core

**File: `app/workflows/engine.py`**

```python
from typing import Dict, Any, List
from uuid import UUID
from app.models.workflow import Workflow, ExecutionType
from app.agents.registry import agent_registry
from app.workflows.sequential import SequentialExecutor
from app.workflows.parallel import ParallelExecutor
from app.workflows.conditional import ConditionalExecutor
import structlog

logger = structlog.get_logger()

class WorkflowEngine:
    def __init__(self):
        self.executors = {
            ExecutionType.SEQUENTIAL: SequentialExecutor(),
            ExecutionType.PARALLEL: ParallelExecutor(),
            ExecutionType.CONDITIONAL: ConditionalExecutor(),
        }

    async def execute_workflow(
        self,
        workflow: Workflow,
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute a workflow"""
        logger.info(
            f"Starting workflow execution",
            workflow_id=str(workflow.id),
            execution_type=workflow.execution_type
        )

        executor = self.executors.get(workflow.execution_type)
        if not executor:
            raise ValueError(f"Unknown execution type: {workflow.execution_type}")

        try:
            result = await executor.execute(workflow.steps, input_data)
            logger.info(f"Workflow completed", workflow_id=str(workflow.id))
            return result
        except Exception as e:
            logger.error(
                f"Workflow execution failed",
                workflow_id=str(workflow.id),
                error=str(e)
            )
            raise

workflow_engine = WorkflowEngine()
```

### Sequential Executor

**File: `app/workflows/sequential.py`**

```python
from typing import Dict, Any, List
from app.agents.registry import agent_registry
import structlog

logger = structlog.get_logger()

class SequentialExecutor:
    async def execute(
        self,
        steps: List[Dict[str, Any]],
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute steps sequentially, passing output to next step"""
        current_data = input_data
        results = []

        for i, step in enumerate(steps):
            logger.info(f"Executing step {i+1}/{len(steps)}", step_name=step.get("name"))

            agent_id = step.get("agent_id")
            agent = agent_registry.get_instance(agent_id)

            if not agent:
                raise ValueError(f"Agent not found: {agent_id}")

            # Execute agent with current data
            step_result = await agent.run(current_data)
            results.append({
                "step": i + 1,
                "agent_id": str(agent_id),
                "result": step_result
            })

            # Pass output to next step
            current_data = step_result

        return {
            "final_result": current_data,
            "step_results": results
        }
```

---

## 7. API Implementation

### Agent Endpoints

**File: `app/api/v1/agents.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from uuid import UUID
from app.core.database import get_db
from app.schemas.agent import AgentCreate, AgentUpdate, AgentResponse
from app.services.agent_service import agent_service

router = APIRouter(prefix="/agents", tags=["agents"])

@router.post("/", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    agent_data: AgentCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new agent"""
    return await agent_service.create_agent(db, agent_data)

@router.get("/", response_model=List[AgentResponse])
async def list_agents(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """List all agents"""
    return await agent_service.list_agents(db, skip, limit)

@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get agent by ID"""
    agent = await agent_service.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent

@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: UUID,
    agent_data: AgentUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update agent"""
    agent = await agent_service.update_agent(db, agent_id, agent_data)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent

@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    agent_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Delete agent"""
    success = await agent_service.delete_agent(db, agent_id)
    if not success:
        raise HTTPException(status_code=404, detail="Agent not found")

@router.post("/{agent_id}/execute")
async def execute_agent(
    agent_id: UUID,
    input_data: Dict[str, Any],
    db: AsyncSession = Depends(get_db)
):
    """Execute agent task"""
    result = await agent_service.execute_agent(db, agent_id, input_data)
    return result
```

### RAG Endpoints

**File: `app/api/v1/documents.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from uuid import UUID
from app.core.database import get_db
from app.schemas.document import DocumentCreate, DocumentResponse, SearchRequest
from app.services.rag_service import rag_service

router = APIRouter(prefix="/documents", tags=["documents"])

@router.post("/", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    document_data: DocumentCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new document with embeddings"""
    return await rag_service.create_document(db, document_data)

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload and process a document file"""
    return await rag_service.upload_document(db, file)

@router.post("/search")
async def search_documents(
    search_request: SearchRequest,
    db: AsyncSession = Depends(get_db)
):
    """Search documents using vector similarity"""
    return await rag_service.search_documents(db, search_request)

@router.post("/rag/query")
async def rag_query(
    query: str,
    filters: Dict[str, Any] = None,
    db: AsyncSession = Depends(get_db)
):
    """Execute RAG query"""
    return await rag_service.rag_query(db, query, filters)
```

---

## 8. Testing Strategy

### Test Configuration

**File: `tests/conftest.py`**

```python
import pytest
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.database import Base
from app.main import app

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(
        "postgresql+asyncpg://postgres:postgres@localhost:5432/test_multiagent",
        echo=True
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest.fixture
async def test_db(test_engine):
    async_session = sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session() as session:
        yield session
```

This implementation guide provides the technical foundation for building the FastAPI multi-agent backend. Each section includes working code examples that can be directly implemented.