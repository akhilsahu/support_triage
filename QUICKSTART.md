# FastAPI Multi-Agent Backend - Quick Start Guide

Get your FastAPI multi-agent backend up and running in minutes!

## 🚀 Quick Setup (5 minutes)

### Option 1: Using Docker (Recommended)

```bash
# 1. Clone and navigate to the project
cd bob-watson-hackathon

# 2. Copy environment file
cp .env.example .env

# 3. Start all services with Docker Compose
docker-compose up -d

# 4. Check if services are running
docker-compose ps

# 5. View logs
docker-compose logs -f api

# 6. Access the API
open http://localhost:8000/docs
```

That's it! Your API is now running at http://localhost:8000

### Option 2: Local Development

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Set up PostgreSQL with pgvector
# macOS
brew install postgresql@15 pgvector
brew services start postgresql@15

# Ubuntu/Debian
sudo apt-get install postgresql-15 postgresql-15-pgvector
sudo systemctl start postgresql

# 3. Set up Redis
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis

# 4. Create database
createdb multiagent
psql multiagent -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 5. Copy and configure environment
cp .env.example .env
# Edit .env with your settings

# 6. Run migrations
alembic upgrade head

# 7. Start the application
uvicorn app.main:app --reload
```

## 📝 First API Calls

### 1. Check Health

```bash
curl http://localhost:8000/health
```

### 2. Create Your First Agent

```bash
curl -X POST http://localhost:8000/api/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Support Agent",
    "type": "chat",
    "description": "Handles customer inquiries",
    "capabilities": ["chat", "faq"],
    "configuration": {
      "model": "gpt-4-turbo-preview",
      "temperature": 0.7
    }
  }'
```

### 3. List All Agents

```bash
curl http://localhost:8000/api/v1/agents
```

### 4. Create a Workflow

```bash
curl -X POST http://localhost:8000/api/v1/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Support Workflow",
    "execution_type": "sequential",
    "description": "Handle customer inquiries",
    "steps": [
      {
        "agent_id": "YOUR_AGENT_ID_HERE",
        "name": "Process Inquiry",
        "config": {}
      }
    ]
  }'
```

### 5. Upload a Document for RAG

```bash
curl -X POST http://localhost:8000/api/v1/documents/upload \
  -F "file=@/path/to/your/document.pdf"
```

### 6. Query with RAG

```bash
curl -X POST http://localhost:8000/api/v1/rag/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is your refund policy?",
    "top_k": 5
  }'
```

## 🔧 Configuration

### Essential Environment Variables

Edit your `.env` file:

```bash
# Required: Add your API keys
OPENAI_API_KEY=sk-your-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Optional: Customize settings
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
RAG_TOP_K=5
RAG_CHUNK_SIZE=1000
```

## 📚 Interactive Documentation

Once running, access:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## 🧪 Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app

# Run specific test
pytest tests/test_api/test_agents.py -v
```

## 🐛 Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
pg_isready

# Check if pgvector extension is installed
psql multiagent -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

### Redis Connection Issues

```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG
```

### Port Already in Use

```bash
# Find process using port 8000
lsof -i :8000

# Kill the process
kill -9 <PID>
```

### Docker Issues

```bash
# Stop all containers
docker-compose down

# Remove volumes and restart
docker-compose down -v
docker-compose up -d

# View logs
docker-compose logs -f
```

## 📖 Next Steps

1. **Read the Full Documentation**: Check `README.md` for detailed information
2. **Explore Architecture**: Review `ARCHITECTURE_PLAN.md` for system design
3. **Implementation Details**: See `IMPLEMENTATION_GUIDE.md` for code examples
4. **Customize Agents**: Create your own agent types in `app/agents/`
5. **Build Workflows**: Design complex workflows in `app/workflows/`
6. **Implement RAG**: Enhance document retrieval in `app/rag/`

## 🎯 Common Use Cases

### Use Case 1: Simple Chat Agent

```python
import httpx

async def create_chat_agent():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8000/api/v1/agents",
            json={
                "name": "Chat Assistant",
                "type": "chat",
                "capabilities": ["conversation", "context_aware"],
                "configuration": {
                    "model": "gpt-4-turbo-preview",
                    "temperature": 0.7,
                    "max_tokens": 2000
                }
            }
        )
        return response.json()
```

### Use Case 2: Multi-Step Workflow

```python
async def create_support_workflow(agent_ids):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8000/api/v1/workflows",
            json={
                "name": "Support Ticket Workflow",
                "execution_type": "sequential",
                "steps": [
                    {
                        "agent_id": agent_ids[0],
                        "name": "Classify Ticket",
                        "config": {"priority": "high"}
                    },
                    {
                        "agent_id": agent_ids[1],
                        "name": "Generate Response",
                        "config": {"tone": "professional"}
                    },
                    {
                        "agent_id": agent_ids[2],
                        "name": "Quality Check",
                        "config": {"threshold": 0.8}
                    }
                ]
            }
        )
        return response.json()
```

### Use Case 3: RAG-Enhanced Search

```python
async def search_documents(query: str):
    async with httpx.AsyncClient() as client:
        # Search documents
        search_response = await client.post(
            "http://localhost:8000/api/v1/documents/search",
            json={
                "query": query,
                "top_k": 5,
                "similarity_threshold": 0.7
            }
        )
        
        # Get RAG-enhanced answer
        rag_response = await client.post(
            "http://localhost:8000/api/v1/rag/query",
            json={"query": query}
        )
        
        return {
            "documents": search_response.json(),
            "answer": rag_response.json()
        }
```

## 💡 Tips

1. **Start Simple**: Begin with a single agent before building complex workflows
2. **Use Docker**: Docker Compose handles all dependencies automatically
3. **Check Logs**: Always check logs when debugging issues
4. **Test Incrementally**: Test each component before integrating
5. **Monitor Performance**: Use the `/health` endpoint to check system status

## 🆘 Getting Help

- **Documentation**: Check `README.md` and `ARCHITECTURE_PLAN.md`
- **API Docs**: Use Swagger UI at `/docs` for interactive testing
- **Logs**: Check `logs/app.log` for detailed error messages
- **Health Check**: Visit `/health` to verify all services are running

## 🎉 Success!

You now have a fully functional FastAPI multi-agent backend with:
- ✅ Multi-agent orchestration
- ✅ RAG capabilities with vector search
- ✅ Workflow engine
- ✅ Real-time processing
- ✅ Production-ready infrastructure

Happy building! 🚀