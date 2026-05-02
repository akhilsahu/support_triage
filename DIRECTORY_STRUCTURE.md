# OrchestraSupport Directory Structure

## Complete Project Layout

```
bob-watson-hackathon/
├── .bob/                                    # Bob AI configuration
│   └── rules-custom/                        # Custom agent mode rules
│       ├── mode-triage.md                   # Triage agent mode definition
│       ├── mode-logistics.md                # Logistics agent mode definition
│       ├── mode-finance.md                  # Finance agent mode definition
│       └── README.md                        # Modes documentation
│
├── app/                                     # Main application directory
│   ├── __init__.py                          # App package initialization
│   ├── main.py                              # FastAPI application entry point
│   ├── config.py                            # Configuration management
│   │
│   ├── core/                                # Core functionality
│   │   ├── __init__.py
│   │   ├── database.py                      # Database connection & session
│   │   ├── redis.py                         # Redis client setup
│   │   ├── langgraph_persistence.py         # PostgresSaver implementation ⭐
│   │   ├── security.py                      # Authentication & authorization
│   │   └── logging.py                       # Logging configuration
│   │
│   ├── models/                              # SQLAlchemy models
│   │   ├── __init__.py
│   │   ├── agent.py                         # Agent model
│   │   ├── workflow.py                      # Workflow model
│   │   ├── task.py                          # Task model
│   │   ├── execution.py                     # Execution model
│   │   ├── conversation.py                  # Conversation model
│   │   ├── document.py                      # Document model with vectors
│   │   ├── ticket.py                        # Ticket model ⭐
│   │   └── crm_record.py                    # CRM record model ⭐
│   │
│   ├── schemas/                             # Pydantic v2 schemas
│   │   ├── __init__.py
│   │   ├── agent.py                         # Agent schemas
│   │   ├── workflow.py                      # Workflow schemas
│   │   ├── task.py                          # Task schemas
│   │   ├── ticket.py                        # Ticket schemas ⭐
│   │   ├── crm.py                           # CRM schemas ⭐
│   │   ├── sentiment.py                     # Sentiment analysis schemas ⭐
│   │   └── common.py                        # Common/shared schemas
│   │
│   ├── agents/                              # Agent implementations
│   │   ├── __init__.py
│   │   ├── base_agent.py                    # Base agent class
│   │   ├── triage_agent.py                  # Triage agent with Empathy Engine ⭐
│   │   ├── logistics_agent.py               # Logistics agent with mock APIs ⭐
│   │   ├── finance_agent.py                 # Finance agent with RAG ⭐
│   │   └── empathy_engine.py                # Sentiment scoring logic ⭐
│   │
│   ├── orchestrator/                        # LangGraph orchestration
│   │   ├── __init__.py
│   │   ├── workflow.py                      # Multi-agent workflow graph ⭐
│   │   ├── state.py                         # State definitions ⭐
│   │   ├── routing.py                       # Routing logic ⭐
│   │   └── validation.py                    # Action validation ⭐
│   │
│   ├── services/                            # Business logic services
│   │   ├── __init__.py
│   │   ├── crm_service.py                   # CRM service with mock DB ⭐
│   │   ├── action_enforcement.py            # Action enforcement service ⭐
│   │   ├── llm_service.py                   # LLM service (OpenAI/Anthropic)
│   │   ├── embedding_service.py             # Embedding generation
│   │   ├── shipping_api.py                  # Mock shipping API ⭐
│   │   ├── inventory_api.py                 # Mock inventory API ⭐
│   │   └── audit_service.py                 # Audit logging service ⭐
│   │
│   ├── rag/                                 # RAG implementation
│   │   ├── __init__.py
│   │   ├── retriever.py                     # Vector similarity search
│   │   ├── chain.py                         # RAG chain
│   │   ├── embeddings.py                    # Embedding utilities
│   │   └── policy_loader.py                 # Policy document loader ⭐
│   │
│   ├── api/                                 # API routes
│   │   ├── __init__.py
│   │   └── v1/                              # API version 1
│   │       ├── __init__.py
│   │       ├── tickets.py                   # Ticket management endpoints ⭐
│   │       ├── agents.py                    # Agent execution endpoints ⭐
│   │       ├── crm.py                       # CRM integration endpoints ⭐
│   │       ├── workflows.py                 # Workflow endpoints
│   │       ├── documents.py                 # Document & RAG endpoints
│   │       └── health.py                    # Health check endpoints
│   │
│   ├── openapi/                             # OpenAPI generation
│   │   ├── __init__.py
│   │   ├── generator.py                     # watsonx OpenAPI generator ⭐
│   │   ├── docstring_parser.py              # Docstring extraction ⭐
│   │   └── watsonx_extensions.py            # watsonx-specific metadata ⭐
│   │
│   └── utils/                               # Utility functions
│       ├── __init__.py
│       ├── exceptions.py                    # Custom exceptions
│       ├── validators.py                    # Input validators
│       └── helpers.py                       # Helper functions
│
├── tests/                                   # Test suite
│   ├── __init__.py
│   ├── conftest.py                          # Pytest configuration
│   │
│   ├── unit/                                # Unit tests
│   │   ├── __init__.py
│   │   ├── test_triage_agent.py             # Triage agent tests ⭐
│   │   ├── test_logistics_agent.py          # Logistics agent tests ⭐
│   │   ├── test_finance_agent.py            # Finance agent tests ⭐
│   │   ├── test_empathy_engine.py           # Empathy engine tests ⭐
│   │   ├── test_crm_service.py              # CRM service tests ⭐
│   │   ├── test_openapi_generator.py        # OpenAPI generator tests ⭐
│   │   └── test_persistence.py              # PostgresSaver tests ⭐
│   │
│   ├── integration/                         # Integration tests
│   │   ├── __init__.py
│   │   ├── test_workflow.py                 # Workflow integration tests ⭐
│   │   ├── test_api_endpoints.py            # API endpoint tests ⭐
│   │   └── test_end_to_end.py               # End-to-end tests ⭐
│   │
│   └── fixtures/                            # Test fixtures
│       ├── __init__.py
│       ├── mock_data.py                     # Mock data generators
│       └── policy_documents/                # Test policy documents
│           ├── refund_policy.pdf
│           ├── credit_policy.pdf
│           └── compensation_guidelines.pdf
│
├── alembic/                                 # Database migrations
│   ├── versions/                            # Migration versions
│   │   ├── 001_initial_schema.py
│   │   ├── 002_add_tickets.py               # Ticket table migration ⭐
│   │   ├── 003_add_crm_records.py           # CRM records migration ⭐
│   │   └── 004_add_checkpoints.py           # LangGraph checkpoints ⭐
│   ├── env.py                               # Alembic environment
│   └── script.py.mako                       # Migration template
│
├── docker/                                  # Docker configuration
│   ├── Dockerfile                           # Application Dockerfile
│   ├── Dockerfile.dev                       # Development Dockerfile
│   └── nginx.conf                           # Nginx configuration
│
├── docs/                                    # Documentation
│   ├── API_REFERENCE.md                     # Complete API documentation ⭐
│   ├── AGENT_GUIDE.md                       # Agent implementation guide ⭐
│   ├── WATSONX_INTEGRATION.md               # watsonx setup guide ⭐
│   ├── DEPLOYMENT.md                        # Deployment instructions ⭐
│   ├── EMPATHY_ENGINE.md                    # Empathy Engine documentation ⭐
│   └── images/                              # Documentation images
│       ├── architecture.png
│       ├── workflow.png
│       └── empathy_flow.png
│
├── scripts/                                 # Utility scripts
│   ├── init_db.py                           # Database initialization
│   ├── load_policies.py                     # Load policy documents ⭐
│   ├── generate_openapi.py                  # Generate OpenAPI schema ⭐
│   └── seed_data.py                         # Seed test data
│
├── policies/                                # Policy documents for RAG
│   ├── refund_policy.pdf                    # Refund policy ⭐
│   ├── credit_policy.pdf                    # Credit policy ⭐
│   ├── compensation_guidelines.pdf          # Compensation guidelines ⭐
│   └── terms_of_service.pdf                 # Terms of service ⭐
│
├── .env.example                             # Environment variables template
├── .gitignore                               # Git ignore rules
├── alembic.ini                              # Alembic configuration
├── docker-compose.yml                       # Docker Compose configuration
├── pyproject.toml                           # Poetry dependencies
├── requirements.txt                         # Pip requirements
├── pytest.ini                               # Pytest configuration
├── mypy.ini                                 # MyPy configuration
├── .pre-commit-config.yaml                  # Pre-commit hooks
│
├── AGENTS.md                                # Agent architecture documentation
├── ARCHITECTURE_PLAN.md                     # System architecture plan
├── IMPLEMENTATION_GUIDE.md                  # Implementation guide
├── IMPLEMENTATION_PLAN.md                   # Detailed implementation plan ⭐
├── DIRECTORY_STRUCTURE.md                   # This file
├── README.md                                # Project README
└── QUICKSTART.md                            # Quick start guide

⭐ = New files to be created for specific requirements
```

## Key Directories Explained

### `/app/core/`
Core infrastructure components including database connections, Redis client, and the critical **PostgresSaver** implementation for LangGraph state persistence.

### `/app/agents/`
Three specialized agents implementing the OrchestraSupport architecture:
- **Triage Agent**: First contact with Empathy Engine (sentiment_score < 0.4 triggers bypass)
- **Logistics Agent**: Handles shipping/inventory with mock API integrations
- **Finance Agent**: Processes refunds/credits using RAG for policy verification

### `/app/orchestrator/`
LangGraph-based multi-agent workflow orchestration with:
- State management using PostgresSaver
- Conditional routing logic
- Action validation enforcement
- CRM update requirements

### `/app/services/`
Business logic layer including:
- **CRMService**: Mock database with mandatory update enforcement
- **ActionEnforcementService**: Validates "Action over Conversation" principle
- **Mock APIs**: Shipping and inventory API simulators
- **AuditService**: Comprehensive audit trail logging

### `/app/openapi/`
watsonx Orchestrate integration:
- **Generator**: Extracts docstrings to create OpenAPI 3.0 schema
- **DocstringParser**: Parses Python docstrings for summary/description
- **WatsonxExtensions**: Adds watsonx-specific metadata for autonomous discovery

### `/app/rag/`
Retrieval-Augmented Generation for policy verification:
- Vector similarity search using pgvector
- Policy document loading and chunking
- RAG chain with confidence scoring

### `/tests/`
Comprehensive test suite:
- **Unit tests**: Individual component testing
- **Integration tests**: Multi-component workflow testing
- **Fixtures**: Mock data and test policy documents

### `/policies/`
Policy documents for RAG system:
- Refund policy
- Credit policy
- Compensation guidelines
- Terms of service

## File Naming Conventions

### Python Files
- **Models**: Singular noun (e.g., `agent.py`, `ticket.py`)
- **Services**: `{domain}_service.py` (e.g., `crm_service.py`)
- **Agents**: `{type}_agent.py` (e.g., `triage_agent.py`)
- **Tests**: `test_{module}.py` (e.g., `test_triage_agent.py`)

### Documentation
- **Guides**: `{TOPIC}_GUIDE.md` (e.g., `AGENT_GUIDE.md`)
- **Plans**: `{TOPIC}_PLAN.md` (e.g., `IMPLEMENTATION_PLAN.md`)
- **References**: `{TOPIC}_REFERENCE.md` (e.g., `API_REFERENCE.md`)

## Import Structure

### Absolute Imports
```python
from app.core.database import get_db
from app.models.ticket import Ticket
from app.schemas.ticket import TicketCreate
from app.services.crm_service import CRMService
from app.agents.triage_agent import TriageAgent
```

### Relative Imports (within same package)
```python
from .base_agent import BaseAgent
from .empathy_engine import EmpathyEngine
```

## Configuration Files

### Environment Variables (`.env`)
```bash
# Database
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/orchestrasupport
REDIS_URL=redis://localhost:6379/0

# LLM APIs
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Security
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Application
DEBUG=false
LOG_LEVEL=INFO
CORS_ORIGINS=["http://localhost:3000"]

# Empathy Engine
EMPATHY_THRESHOLD=0.4
```

### Docker Compose (`docker-compose.yml`)
```yaml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg15
    environment:
      POSTGRES_DB: orchestrasupport
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  app:
    build:
      context: .
      dockerfile: docker/Dockerfile
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://user:pass@postgres/orchestrasupport
      REDIS_URL: redis://redis:6379/0
    depends_on:
      - postgres
      - redis
    volumes:
      - ./app:/app/app
      - ./policies:/app/policies

volumes:
  postgres_data:
  redis_data:
```

## Development Workflow

### 1. Initial Setup
```bash
# Clone repository
git clone <repo-url>
cd bob-watson-hackathon

# Install dependencies
poetry install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Start services
docker-compose up -d postgres redis

# Run migrations
alembic upgrade head

# Load policy documents
python scripts/load_policies.py
```

### 2. Development
```bash
# Run development server
uvicorn app.main:app --reload

# Run tests
pytest

# Run tests with coverage
pytest --cov=app --cov-report=html

# Format code
black app/ tests/

# Lint code
ruff check app/ tests/

# Type check
mypy app/
```

### 3. Generate OpenAPI Schema
```bash
# Generate watsonx-ready OpenAPI schema
python scripts/generate_openapi.py > openapi.json
```

### 4. Database Migrations
```bash
# Create new migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback migration
alembic downgrade -1
```

## Production Deployment

### Build Docker Image
```bash
docker build -t orchestrasupport:latest -f docker/Dockerfile .
```

### Run Container
```bash
docker run -d \
  -p 8000:8000 \
  -e DATABASE_URL=postgresql+asyncpg://... \
  -e REDIS_URL=redis://... \
  -e OPENAI_API_KEY=sk-... \
  orchestrasupport:latest
```

### Health Check
```bash
curl http://localhost:8000/api/v1/health
```

## Key Implementation Files

### Critical Files (Must Implement First)
1. `app/core/langgraph_persistence.py` - PostgresSaver for state persistence
2. `app/services/crm_service.py` - CRM service with mandatory updates
3. `app/agents/triage_agent.py` - Triage agent with Empathy Engine
4. `app/agents/empathy_engine.py` - Sentiment scoring logic
5. `app/orchestrator/workflow.py` - LangGraph multi-agent workflow
6. `app/openapi/generator.py` - watsonx OpenAPI generator

### Supporting Files
7. `app/agents/logistics_agent.py` - Logistics agent
8. `app/agents/finance_agent.py` - Finance agent
9. `app/services/shipping_api.py` - Mock shipping API
10. `app/services/inventory_api.py` - Mock inventory API
11. `app/services/action_enforcement.py` - Action validation
12. `app/rag/policy_loader.py` - Policy document loader

## Next Steps

1. **Review** this directory structure
2. **Confirm** the implementation plan in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md)
3. **Switch to Code mode** to begin implementation
4. **Start with** Phase 1: Core Infrastructure (PostgresSaver, CRMService)
5. **Continue with** Phase 2: Agent Implementation (Triage, Logistics, Finance)

---

**Ready to implement**: All planning documentation is complete. Switch to Code mode to begin implementation.