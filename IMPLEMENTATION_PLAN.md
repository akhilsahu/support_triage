# OrchestraSupport Implementation Plan

## Overview

This document outlines the detailed implementation plan for the OrchestraSupport FastAPI backend, following the architecture defined in [`ARCHITECTURE_PLAN.md`](ARCHITECTURE_PLAN.md) with specific technical requirements for production deployment.

## Critical Technical Requirements

### 1. PostgresSaver for LangGraph State Persistence

**Requirement**: Implement durable conversation state using PostgresSaver

**Implementation Location**: `app/core/langgraph_persistence.py`

**Key Features**:
- Async PostgreSQL connection for state storage
- Checkpoint management for conversation history
- State recovery on system restart
- Thread-safe state updates

**Database Schema**:
```sql
CREATE TABLE langgraph_checkpoints (
    thread_id VARCHAR(255) PRIMARY KEY,
    checkpoint_id VARCHAR(255) NOT NULL,
    parent_checkpoint_id VARCHAR(255),
    state JSONB NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_checkpoints_thread ON langgraph_checkpoints(thread_id);
CREATE INDEX idx_checkpoints_parent ON langgraph_checkpoints(parent_checkpoint_id);
```

### 2. CRMService with Mandatory Updates

**Requirement**: Every successful resolution must call `CRMService.update_record()`

**Implementation Location**: `app/services/crm_service.py`

**Key Features**:
- Mock database update functionality
- Audit trail logging
- Validation enforcement (no completion without CRM update)
- Async operation support

**Service Layer Validation**:
```python
class ActionEnforcementService:
    async def validate_completion(self, ticket_id: str) -> bool:
        """Ensure CRM was updated before allowing completion"""
        crm_updated = await self.crm_service.check_update(ticket_id)
        if not crm_updated:
            raise ActionRequiredException(
                f"Ticket {ticket_id} cannot be closed without CRM update"
            )
        return True
```

### 3. Empathy Engine in Triage Agent

**Requirement**: Sentiment score logic gate that bypasses FAQs for low scores

**Implementation Location**: `app/agents/triage_agent.py`

**Logic Gate**:
```python
if sentiment_score < 0.4:
    # Bypass standard FAQs
    # Route directly to Finance Agent
    # Offer proactive compensation
    return route_to_finance_with_compensation()
else:
    # Standard triage flow
    return standard_routing()
```

**Sentiment Scoring**:
- Range: 0.0 (very negative) to 1.0 (very positive)
- Threshold: 0.4 (below = empathy trigger)
- Factors: Tone, urgency, frustration indicators, profanity

### 4. watsonx-Ready OpenAPI Generator

**Requirement**: Generate OpenAPI 3.0 schema from Python docstrings

**Implementation Location**: `app/openapi/generator.py`

**Key Features**:
- Extract docstrings for `summary` and `description`
- Generate watsonx Orchestrate-compatible schema
- Include skill metadata for autonomous discovery
- Support for complex parameter types

**Docstring Format**:
```python
async def process_refund(order_id: str, amount: float) -> RefundResponse:
    """Process customer refund request.
    
    This skill processes refund requests by verifying eligibility,
    calculating the refund amount based on policy, and initiating
    the payment transaction.
    
    Args:
        order_id: The unique order identifier
        amount: The refund amount in USD
        
    Returns:
        RefundResponse with transaction details and status
    """
```

## Implementation Phases

### Phase 1: Core Infrastructure (Priority 1)

#### 1.1 PostgresSaver Implementation
**File**: `app/core/langgraph_persistence.py`

**Tasks**:
- [ ] Create PostgresSaver class with async support
- [ ] Implement checkpoint save/load methods
- [ ] Add state serialization/deserialization
- [ ] Create database migration for checkpoints table
- [ ] Add unit tests for state persistence

**Dependencies**:
- `langgraph-checkpoint-postgres`
- `asyncpg`
- `sqlalchemy[asyncio]`

**Acceptance Criteria**:
- Conversation state persists across restarts
- Checkpoint history maintained
- State recovery works correctly
- Performance: <50ms for state save/load

#### 1.2 CRMService Implementation
**File**: `app/services/crm_service.py`

**Tasks**:
- [ ] Create CRMService class with mock database
- [ ] Implement `update_record()` method
- [ ] Add validation in ActionEnforcementService
- [ ] Create audit logging for all updates
- [ ] Add unit tests for CRM operations

**Mock Database Structure**:
```python
crm_records = {
    "ticket_id": {
        "customer_id": "CUST-123",
        "status": "resolved",
        "last_action": "refund_processed",
        "last_agent": "finance",
        "updated_at": "2024-05-02T10:30:00Z",
        "actions": [...]
    }
}
```

**Acceptance Criteria**:
- All ticket completions require CRM update
- Validation prevents completion without update
- Audit trail captures all updates
- Mock database simulates real CRM behavior

### Phase 2: Agent Implementation (Priority 1)

#### 2.1 Triage Agent with Empathy Engine
**File**: `app/agents/triage_agent.py`

**Tasks**:
- [ ] Implement sentiment analysis with scoring
- [ ] Create empathy logic gate (threshold: 0.4)
- [ ] Add bypass logic for low sentiment scores
- [ ] Implement direct routing to Finance Agent
- [ ] Add proactive compensation offer logic
- [ ] Create unit tests for empathy engine

**Sentiment Analysis**:
```python
class SentimentAnalyzer:
    async def analyze(self, text: str) -> float:
        """
        Analyze sentiment and return score 0.0-1.0
        
        Factors:
        - Tone (angry, frustrated, neutral, happy)
        - Urgency indicators
        - Profanity detection
        - Frustration keywords
        - Exclamation marks, caps lock
        """
```

**Empathy Engine Logic**:
```python
class TriageAgent:
    async def route(self, message: str) -> RoutingDecision:
        sentiment_score = await self.sentiment_analyzer.analyze(message)
        
        if sentiment_score < 0.4:
            # Empathy trigger activated
            return RoutingDecision(
                agent="finance",
                bypass_faq=True,
                proactive_compensation=True,
                priority=1,
                reason="Low sentiment score - empathy protocol"
            )
        
        # Standard routing logic
        intent = await self.classify_intent(message)
        return self.standard_routing(intent)
```

**Acceptance Criteria**:
- Sentiment scoring accuracy >90%
- Empathy trigger activates at score <0.4
- FAQ bypass works correctly
- Direct Finance routing successful
- Proactive compensation offered

#### 2.2 Logistics Agent with Mock APIs
**File**: `app/agents/logistics_agent.py`

**Tasks**:
- [ ] Implement mock shipping API client
- [ ] Implement mock inventory API client
- [ ] Create order tracking logic
- [ ] Add address update functionality
- [ ] Implement replacement order creation
- [ ] Add API call logging
- [ ] Create unit tests with mock responses

**Mock API Clients**:
```python
class MockShippingAPI:
    async def track(self, tracking_number: str) -> TrackingResponse:
        """Mock tracking API response"""
        
    async def update_address(self, order_id: str, address: Address) -> UpdateResponse:
        """Mock address update API response"""
        
    async def create_replacement(self, order_id: str, reason: str) -> ReplacementResponse:
        """Mock replacement order API response"""

class MockInventoryAPI:
    async def check_stock(self, product_id: str) -> StockResponse:
        """Mock inventory check API response"""
        
    async def reserve(self, product_id: str, quantity: int) -> ReservationResponse:
        """Mock inventory reservation API response"""
```

**Acceptance Criteria**:
- All API calls logged to audit trail
- Mock APIs return realistic responses
- Order tracking works end-to-end
- Address updates validated
- Replacement orders created successfully

#### 2.3 Finance Agent with RAG
**File**: `app/agents/finance_agent.py`

**Tasks**:
- [ ] Implement RAG query logic
- [ ] Create policy document retrieval
- [ ] Add eligibility verification
- [ ] Implement compensation calculation
- [ ] Create approval workflow routing
- [ ] Add refund processing logic
- [ ] Create unit tests with mock policies

**RAG Integration**:
```python
class FinanceAgent:
    async def process_refund_request(
        self, 
        order_id: str, 
        reason: str
    ) -> RefundDecision:
        # Query RAG for relevant policies
        policies = await self.rag_service.query(
            f"refund policy for {reason}",
            documents=["refund_policy.pdf", "compensation_guidelines.pdf"]
        )
        
        # Verify eligibility
        eligible = await self.verify_eligibility(order_id, policies)
        
        # Calculate compensation
        amount = await self.calculate_compensation(order_id, policies)
        
        # Check approval requirements
        if amount > 100:
            return await self.request_approval(order_id, amount)
        
        # Process refund
        return await self.process_refund(order_id, amount)
```

**Acceptance Criteria**:
- RAG confidence score >0.85
- Policy references logged for all decisions
- Eligibility verification accurate
- Compensation calculation follows policy
- Approval workflow routes correctly

### Phase 3: LangGraph Orchestration (Priority 1)

#### 3.1 Multi-Agent Workflow
**File**: `app/orchestrator/workflow.py`

**Tasks**:
- [ ] Create LangGraph StateGraph
- [ ] Define OrchestraState schema
- [ ] Implement agent nodes (triage, logistics, finance)
- [ ] Add conditional routing logic
- [ ] Integrate PostgresSaver for persistence
- [ ] Add validation node for action enforcement
- [ ] Create unit tests for workflow

**State Schema**:
```python
class OrchestraState(TypedDict):
    thread_id: str
    ticket_id: str
    customer_message: str
    sentiment_score: Optional[float]
    intent: Optional[str]
    routed_to: Optional[str]
    actions_taken: List[SystemAction]
    crm_updated: bool
    final_response: Optional[str]
    system_updates: List[Dict]
```

**Workflow Graph**:
```python
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.postgres import PostgresSaver

# Create checkpointer
checkpointer = PostgresSaver.from_conn_string(DATABASE_URL)

# Define graph
workflow = StateGraph(OrchestraState)

# Add nodes
workflow.add_node("triage", triage_agent_node)
workflow.add_node("logistics", logistics_agent_node)
workflow.add_node("finance", finance_agent_node)
workflow.add_node("validate_actions", validate_actions_node)
workflow.add_node("update_crm", update_crm_node)

# Add conditional edges
workflow.add_conditional_edges(
    "triage",
    route_to_specialist,
    {
        "logistics": "logistics",
        "finance": "finance",
        "escalate": END
    }
)

workflow.add_edge("logistics", "validate_actions")
workflow.add_edge("finance", "validate_actions")
workflow.add_edge("validate_actions", "update_crm")
workflow.add_edge("update_crm", END)

# Set entry point
workflow.set_entry_point("triage")

# Compile with checkpointer
app = workflow.compile(checkpointer=checkpointer)
```

**Acceptance Criteria**:
- State persists across requests
- Routing logic works correctly
- All agents execute successfully
- Validation enforces action requirements
- CRM updates mandatory before completion

### Phase 4: OpenAPI Generator (Priority 2)

#### 4.1 watsonx-Ready Schema Generator
**File**: `app/openapi/generator.py`

**Tasks**:
- [ ] Create OpenAPI 3.0 schema generator
- [ ] Extract docstrings from FastAPI routes
- [ ] Parse docstring format (Google/NumPy style)
- [ ] Generate skill metadata for watsonx
- [ ] Add parameter type mapping
- [ ] Create schema validation
- [ ] Add unit tests for generator

**Generator Implementation**:
```python
class WatsonxOpenAPIGenerator:
    """Generate watsonx Orchestrate-compatible OpenAPI 3.0 schema"""
    
    def __init__(self, app: FastAPI):
        self.app = app
        
    def generate_schema(self) -> Dict[str, Any]:
        """
        Generate OpenAPI 3.0 schema with watsonx extensions
        
        Extracts:
        - summary from first line of docstring
        - description from docstring body
        - parameters from function signature
        - response models from return type hints
        """
        schema = {
            "openapi": "3.0.0",
            "info": {
                "title": "OrchestraSupport API",
                "version": "1.0.0",
                "description": "AI Support Multi-Agent System"
            },
            "paths": {},
            "components": {
                "schemas": {}
            },
            "x-watsonx-orchestrate": {
                "skills": []
            }
        }
        
        # Extract routes and docstrings
        for route in self.app.routes:
            if hasattr(route, "endpoint"):
                path_item = self._extract_path_item(route)
                schema["paths"][route.path] = path_item
                
                # Add watsonx skill metadata
                skill = self._extract_skill_metadata(route)
                schema["x-watsonx-orchestrate"]["skills"].append(skill)
        
        return schema
    
    def _extract_path_item(self, route) -> Dict[str, Any]:
        """Extract path item from route with docstring parsing"""
        endpoint = route.endpoint
        docstring = inspect.getdoc(endpoint)
        
        # Parse docstring
        summary, description = self._parse_docstring(docstring)
        
        return {
            route.methods[0].lower(): {
                "summary": summary,
                "description": description,
                "operationId": endpoint.__name__,
                "parameters": self._extract_parameters(endpoint),
                "responses": self._extract_responses(endpoint)
            }
        }
    
    def _parse_docstring(self, docstring: str) -> Tuple[str, str]:
        """Parse docstring into summary and description"""
        if not docstring:
            return "", ""
        
        lines = docstring.strip().split("\n")
        summary = lines[0].strip()
        
        # Find description (everything before Args/Returns)
        description_lines = []
        for line in lines[1:]:
            if line.strip().startswith(("Args:", "Returns:", "Raises:")):
                break
            description_lines.append(line)
        
        description = "\n".join(description_lines).strip()
        
        return summary, description
    
    def _extract_skill_metadata(self, route) -> Dict[str, Any]:
        """Extract watsonx skill metadata"""
        endpoint = route.endpoint
        
        return {
            "name": endpoint.__name__,
            "path": route.path,
            "method": route.methods[0],
            "category": self._infer_category(route.path),
            "tags": route.tags if hasattr(route, "tags") else [],
            "autonomous_discovery": True
        }
```

**Docstring Standards**:
```python
async def create_ticket(
    ticket_data: TicketCreate,
    db: AsyncSession = Depends(get_db)
) -> TicketResponse:
    """Create a new support ticket.
    
    This skill creates a new customer support ticket in the system,
    performs initial triage, and routes to the appropriate agent
    based on sentiment analysis and intent classification.
    
    The ticket will be automatically assigned a priority level and
    routed to either the Logistics or Finance agent based on the
    customer's message content and sentiment score.
    
    Args:
        ticket_data: Ticket creation data including customer message
        db: Database session dependency
        
    Returns:
        TicketResponse: Created ticket with ID, status, and routing info
        
    Raises:
        HTTPException: If ticket creation fails
    """
```

**Acceptance Criteria**:
- OpenAPI 3.0 schema generated correctly
- Docstrings extracted for all endpoints
- watsonx skill metadata included
- Schema validates against OpenAPI spec
- Autonomous discovery enabled

### Phase 5: API Endpoints (Priority 2)

#### 5.1 Ticket Management API
**File**: `app/api/v1/tickets.py`

**Endpoints**:
```python
POST   /api/v1/tickets              # Create ticket
GET    /api/v1/tickets/{ticket_id}  # Get ticket details
GET    /api/v1/tickets              # List tickets
PATCH  /api/v1/tickets/{ticket_id}  # Update ticket
DELETE /api/v1/tickets/{ticket_id}  # Delete ticket
```

#### 5.2 Agent Execution API
**File**: `app/api/v1/agents.py`

**Endpoints**:
```python
POST   /api/v1/agents/execute       # Execute agent workflow
GET    /api/v1/agents/status/{id}   # Get execution status
POST   /api/v1/agents/triage        # Triage agent endpoint
POST   /api/v1/agents/logistics     # Logistics agent endpoint
POST   /api/v1/agents/finance       # Finance agent endpoint
```

#### 5.3 CRM Integration API
**File**: `app/api/v1/crm.py`

**Endpoints**:
```python
POST   /api/v1/crm/update           # Update CRM record
GET    /api/v1/crm/records/{id}     # Get CRM record
GET    /api/v1/crm/audit/{ticket}   # Get audit trail
```

### Phase 6: Testing & Documentation (Priority 3)

#### 6.1 Unit Tests
**Locations**:
- `tests/unit/test_triage_agent.py`
- `tests/unit/test_logistics_agent.py`
- `tests/unit/test_finance_agent.py`
- `tests/unit/test_crm_service.py`
- `tests/unit/test_openapi_generator.py`

#### 6.2 Integration Tests
**Locations**:
- `tests/integration/test_workflow.py`
- `tests/integration/test_api_endpoints.py`
- `tests/integration/test_persistence.py`

#### 6.3 Documentation
**Files**:
- `docs/API_REFERENCE.md` - Complete API documentation
- `docs/AGENT_GUIDE.md` - Agent implementation guide
- `docs/WATSONX_INTEGRATION.md` - watsonx Orchestrate setup
- `docs/DEPLOYMENT.md` - Deployment instructions

## Technology Stack

### Core Dependencies
```toml
[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.109.0"
uvicorn = {extras = ["standard"], version = "^0.27.0"}
pydantic = "^2.5.0"
pydantic-settings = "^2.1.0"
sqlalchemy = {extras = ["asyncio"], version = "^2.0.25"}
asyncpg = "^0.29.0"
alembic = "^1.13.1"
redis = {extras = ["hiredis"], version = "^5.0.1"}
langgraph = "^0.0.20"
langgraph-checkpoint-postgres = "^0.0.5"
langchain = "^0.1.0"
langchain-openai = "^0.0.5"
langchain-anthropic = "^0.0.5"
pgvector = "^0.2.4"
python-multipart = "^0.0.6"
python-jose = {extras = ["cryptography"], version = "^3.3.0"}
passlib = {extras = ["bcrypt"], version = "^1.7.4"}
```

### Development Dependencies
```toml
[tool.poetry.group.dev.dependencies]
pytest = "^7.4.4"
pytest-asyncio = "^0.23.3"
pytest-cov = "^4.1.0"
httpx = "^0.26.0"
black = "^24.1.1"
ruff = "^0.1.14"
mypy = "^1.8.0"
```

## Validation Checklist

### PostgresSaver Implementation
- [ ] Async PostgreSQL connection working
- [ ] Checkpoint save/load functional
- [ ] State persists across restarts
- [ ] Performance meets <50ms target
- [ ] Unit tests passing

### CRMService Implementation
- [ ] Mock database operational
- [ ] `update_record()` method working
- [ ] Validation prevents completion without update
- [ ] Audit trail captures all updates
- [ ] Unit tests passing

### Empathy Engine
- [ ] Sentiment scoring accurate (>90%)
- [ ] Logic gate triggers at score <0.4
- [ ] FAQ bypass working
- [ ] Direct Finance routing successful
- [ ] Proactive compensation offered
- [ ] Unit tests passing

### OpenAPI Generator
- [ ] Schema generates correctly
- [ ] Docstrings extracted properly
- [ ] watsonx metadata included
- [ ] Schema validates
- [ ] Autonomous discovery enabled
- [ ] Unit tests passing

### End-to-End Workflow
- [ ] Ticket creation works
- [ ] Triage agent executes
- [ ] Routing logic correct
- [ ] Specialist agents execute
- [ ] Actions logged
- [ ] CRM updated
- [ ] State persisted
- [ ] Integration tests passing

## Performance Targets

| Metric | Target | Critical |
|--------|--------|----------|
| State save/load | <50ms | <100ms |
| Sentiment analysis | <200ms | <500ms |
| RAG query | <2s | <5s |
| API response | <500ms | <1s |
| CRM update | <100ms | <200ms |
| End-to-end workflow | <5s | <10s |

## Security Considerations

1. **API Authentication**: JWT tokens for all endpoints
2. **Rate Limiting**: 100 requests/minute per client
3. **Input Validation**: Pydantic v2 schemas for all inputs
4. **SQL Injection**: Parameterized queries only
5. **Secrets Management**: Environment variables, no hardcoded secrets
6. **CORS**: Restricted origins in production

## Deployment Strategy

### Development
```bash
docker-compose up -d
alembic upgrade head
uvicorn app.main:app --reload
```

### Production
```bash
docker build -t orchestrasupport:latest .
docker run -d -p 8000:8000 orchestrasupport:latest
```

### Environment Variables
```bash
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/orchestrasupport
REDIS_URL=redis://localhost:6379/0
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
SECRET_KEY=your-secret-key
```

## Next Steps

1. **Immediate**: Implement PostgresSaver and CRMService
2. **Week 1**: Complete all three agents (Triage, Logistics, Finance)
3. **Week 2**: Implement LangGraph orchestration
4. **Week 3**: Build OpenAPI generator and API endpoints
5. **Week 4**: Testing, documentation, and deployment

## Success Criteria

✅ All agents enforce "Action over Conversation" principle
✅ Every resolution updates CRM (no exceptions)
✅ Empathy Engine triggers correctly for low sentiment
✅ State persists across system restarts
✅ OpenAPI schema enables watsonx autonomous discovery
✅ All code is async and uses Pydantic v2
✅ Performance targets met
✅ Test coverage >80%

---

**Ready to implement**: Switch to Code mode to begin implementation.