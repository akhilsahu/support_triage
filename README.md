# FastAPI Multi-Agent Backend

A production-ready FastAPI backend for AI Support multi-agent systems with RAG (Retrieval-Augmented Generation) capabilities, vector storage, and workflow orchestration.

## 🚀 Features

- **Multi-Agent System**: Support for multiple AI agent types with orchestration
- **RAG Implementation**: Document storage with vector embeddings using pgvector
- **Workflow Engine**: Sequential, parallel, and conditional agent execution
- **Vector Search**: Efficient similarity search with PostgreSQL pgvector extension
- **Real-time Communication**: WebSocket support for live updates
- **Caching Layer**: Redis integration for performance optimization
- **Task Queue**: Celery for async task processing
- **API Documentation**: Auto-generated OpenAPI/Swagger documentation
- **Production Ready**: Comprehensive logging, monitoring, and error handling

## 📋 Prerequisites

- Python 3.11+
- PostgreSQL 15+ with pgvector extension
- Redis 7+
- Poetry (recommended) or pip

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd bob-watson-hackathon
```

### 2. Install Dependencies

**Using Poetry (Recommended):**
```bash
poetry install
poetry shell
```

**Using pip:**
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Set Up PostgreSQL with pgvector

```bash
# Install PostgreSQL (if not already installed)
# macOS
brew install postgresql@15

# Ubuntu/Debian
sudo apt-get install postgresql-15

# Install pgvector extension
# macOS
brew install pgvector

# Ubuntu/Debian
sudo apt-get install postgresql-15-pgvector
```

Start PostgreSQL and create the database:
```bash
# macOS — start the service
brew services start postgresql@15

# Ubuntu/Debian
sudo systemctl start postgresql

# Create the database
createdb multiagent
```

Enable pgvector in your database:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 4. Set Up Redis

```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis
```

### 5. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and configure:
- Database connection URL
- Redis URL
- OpenAI/Anthropic API keys
- Other settings as needed

### 6. Initialize Database

```bash
# Run Alembic migrations
alembic upgrade head

# Or initialize directly (for development)
python -c "from app.core.database import init_db; import asyncio; asyncio.run(init_db())"
```

## 🚀 Running the Application

### Development Mode

```bash
# Using uvicorn directly
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Or using the main.py script
python -m app.main
```

### Production Mode

```bash
# Using Gunicorn with Uvicorn workers
gunicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --log-level info
```

### Using Docker

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## 📚 API Documentation

Once the application is running, access the interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## 🏗️ Project Structure

```
fastapi-multi-agent-backend/
├── app/
│   ├── api/v1/              # API endpoints
│   │   ├── agents.py        # Agent management
│   │   ├── workflows.py     # Workflow orchestration
│   │   ├── tasks.py         # Task execution
│   │   └── documents.py     # Document & RAG
│   ├── models/              # SQLAlchemy models
│   │   ├── agent.py         # Agent model
│   │   ├── workflow.py      # Workflow model
│   │   ├── task.py          # Task model
│   │   ├── document.py      # Document model with vectors
│   │   ├── execution.py     # Execution history
│   │   └── conversation.py  # Chat history
│   ├── schemas/             # Pydantic schemas
│   ├── services/            # Business logic
│   ├── core/                # Core functionality
│   │   ├── database.py      # Database connection
│   │   └── redis.py         # Redis client
│   ├── agents/              # Agent implementations
│   ├── workflows/           # Workflow engine
│   ├── rag/                 # RAG implementation
│   ├── utils/               # Utilities
│   ├── config.py            # Configuration
│   └── main.py              # FastAPI application
├── alembic/                 # Database migrations
├── tests/                   # Test suite
├── docs/                    # Documentation
├── scripts/                 # Utility scripts
├── docker/                  # Docker configuration
├── .env.example             # Environment template
├── pyproject.toml           # Poetry configuration
├── requirements.txt         # Pip requirements
└── README.md               # This file
```

## 🔧 Configuration

### Environment Variables

Key configuration options in `.env`:

```bash
# Application
APP_NAME=FastAPI Multi-Agent Backend
DEBUG=false
LOG_LEVEL=INFO

# Database
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/multiagent

# Redis
REDIS_URL=redis://localhost:6379/0

# AI APIs
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Embeddings
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSION=384

# RAG
RAG_TOP_K=5
RAG_SIMILARITY_THRESHOLD=0.7
RAG_CHUNK_SIZE=1000
```

## 📖 Usage Examples

### Creating an Agent

```python
import httpx

async with httpx.AsyncClient() as client:
    response = await client.post(
        "http://localhost:8000/api/v1/agents",
        json={
            "name": "Customer Support Agent",
            "type": "chat",
            "description": "Handles customer inquiries",
            "capabilities": ["chat", "faq", "escalation"],
            "configuration": {
                "model": "gpt-4-turbo-preview",
                "temperature": 0.7
            }
        }
    )
    agent = response.json()
    print(f"Created agent: {agent['id']}")
```

### Creating a Workflow

```python
response = await client.post(
    "http://localhost:8000/api/v1/workflows",
    json={
        "name": "Customer Inquiry Workflow",
        "execution_type": "sequential",
        "steps": [
            {
                "agent_id": "agent-1-uuid",
                "name": "Classify Inquiry",
                "config": {}
            },
            {
                "agent_id": "agent-2-uuid",
                "name": "Generate Response",
                "config": {}
            }
        ]
    }
)
```

### Uploading Documents for RAG

```python
# Upload a document
with open("document.pdf", "rb") as f:
    response = await client.post(
        "http://localhost:8000/api/v1/documents/upload",
        files={"file": f}
    )

# Query using RAG
response = await client.post(
    "http://localhost:8000/api/v1/rag/query",
    json={
        "query": "What is the refund policy?",
        "top_k": 5
    }
)
answer = response.json()
```

## 🧪 Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/test_api/test_agents.py

# Run with verbose output
pytest -v
```

## 📊 Database Models

### Core Models

1. **Agent**: AI agents with capabilities and configuration
2. **Workflow**: Orchestration definitions for multi-agent execution
3. **Task**: Individual agent execution tasks
4. **Document**: Documents with vector embeddings for RAG
5. **Execution**: Detailed execution history and logs
6. **Conversation**: Chat sessions and message history

### Vector Storage

Documents are stored with embeddings using pgvector:
- Efficient similarity search with cosine distance
- Automatic indexing with IVFFlat
- Support for multiple embedding models

## 🔄 Workflow Engine

The workflow engine supports multiple execution strategies:

### Sequential Execution
Agents execute one after another, passing results forward.

### Parallel Execution
Multiple agents execute simultaneously, results are aggregated.

### Conditional Execution
Agent selection based on previous results or conditions.

### Graph-based Execution
Complex workflows using LangGraph for state management.

## 🤖 Agent Types

- **Chat Agent**: Conversational AI for customer support
- **Task Agent**: Automated task execution
- **Analysis Agent**: Data analysis and insights
- **Orchestrator Agent**: Coordinates multiple agents
- **Custom Agent**: User-defined agent types

## 📈 Monitoring & Logging

- Structured logging with structlog
- Prometheus metrics endpoint
- Request/response timing
- Error tracking and reporting
- Database query monitoring

## 🔒 Security

- API key authentication
- JWT token support
- CORS configuration
- Rate limiting
- Input validation with Pydantic
- SQL injection prevention with SQLAlchemy

## 🚢 Deployment

### Docker Deployment

```bash
# Build image
docker build -t fastapi-multi-agent .

# Run container
docker run -p 8000:8000 --env-file .env fastapi-multi-agent
```

### Docker Compose

```bash
docker-compose up -d
```

### Production Checklist

- [ ] Set strong SECRET_KEY
- [ ] Configure production database
- [ ] Set up SSL/TLS certificates
- [ ] Enable rate limiting
- [ ] Configure monitoring
- [ ] Set up log aggregation
- [ ] Configure backup strategy
- [ ] Set DEBUG=false
- [ ] Use environment-specific configs

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details

## 📧 Support

For issues and questions:
- GitHub Issues: [repository-url]/issues
- Documentation: [docs-url]
- Email: support@example.com

## 🙏 Acknowledgments

- FastAPI framework
- LangChain/LangGraph for agent orchestration
- pgvector for vector storage
- SQLAlchemy for ORM
- All contributors and maintainers

---

Built with ❤️ using FastAPI, PostgreSQL, and modern AI technologies.