# OrchestraSupport - Hybrid Agentic AI Architecture

## Executive Summary

**OrchestraSupport** is a Level-2 Hybrid Agentic AI system that combines:
- **Anthropic Claude 3.5** (via LangGraph) for high-nuance Triage and Sentiment Analysis
- **IBM Granite-20b** (via watsonx.ai) as the Primary Orchestrator for all final 'Action' decisions
- **Model Context Protocol (MCP)** bridge using `aicoe-agent-utils` for tool discovery
- **Empathy Engine** with sentiment-driven routing and proactive compensation

## Core Architecture Principle

**Every interaction must result in a concrete action and system update.** No agent is allowed to finalize a conversation without triggering a 'System of Record' update.

---

## Hybrid Model Strategy

### 1. Anthropic Claude 3.5 (Triage & Sentiment)
**Purpose**: High-nuance understanding of customer emotions and intent

**Responsibilities**:
- Deep sentiment analysis with emotional intelligence
- Intent classification with context awareness
- Empathy scoring (0.0 - 1.0)
- Frustration detection and urgency assessment
- Natural language understanding of complex customer issues

**Why Claude?**
- Superior emotional intelligence and nuance detection
- Better at understanding implicit frustration
- Excellent at multi-turn conversation context
- Strong performance on empathy-related tasks

**Integration**: Via LangGraph for stateful conversation management

### 2. IBM Granite-20b (Primary Orchestrator)
**Purpose**: Final decision-making for all actions (refunds, credits, logistics)

**Responsibilities**:
- **Action Decision Authority**: All final decisions go through Granite
- Refund/credit approval logic
- Compensation calculation
- Policy compliance verification
- Risk assessment for high-value actions
- Audit trail generation

**Why Granite?**
- Enterprise-grade reliability and consistency
- Strong reasoning for business logic
- Excellent at structured decision-making
- Optimized for action-oriented tasks
- Better at following strict business rules

**Integration**: Via watsonx.ai API with structured prompts

### 3. Model Coordination Flow

```
Customer Message
       ↓
[Claude - Triage Agent]
   - Sentiment Analysis
   - Intent Classification
   - Empathy Score
       ↓
[Granite - Orchestrator]
   - Route to Specialist
   - Decision Authority
       ↓
[Specialist Agents]
   - Logistics (Claude)
   - Finance (Granite)
       ↓
[Granite - Final Action]
   - Approve/Execute
   - System Update
   - CRM Write-back
```

---

## The MCP Bridge Architecture

### Overview
The **Model Context Protocol (MCP)** bridge transforms our backend services into discoverable tools that agents can use dynamically.

### Implementation: aicoe-agent-utils

**Library**: `aicoe-agent-utils` (IBM Bob's architecture)
**Base Class**: `BaseMCP`

### MCP Server Design

```python
from aicoe_agent_utils import BaseMCP, MCPTool

class OrchestraSupportMCP(BaseMCP):
    """
    MCP Server for OrchestraSupport
    Exposes backend services as discoverable tools
    """
    
    def __init__(self):
        super().__init__(name="orchestrasupport")
        self.register_tools()
    
    def register_tools(self):
        """Register all available tools"""
        self.add_tool(CRMWriteBackTool())
        self.add_tool(LogisticsInquiryTool())
        self.add_tool(ShippingTrackingTool())
        self.add_tool(RefundProcessingTool())
        self.add_tool(PolicyRetrievalTool())
        self.add_tool(SentimentAnalysisTool())
```

### MCP Tools

#### 1. CRM_Write_Back Tool
```python
class CRMWriteBackTool(MCPTool):
    name = "crm_write_back"
    description = "Write customer interaction data to CRM system"
    
    parameters = {
        "ticket_id": "string",
        "action_type": "string",
        "details": "object",
        "sentiment_score": "float"
    }
    
    async def execute(self, **kwargs):
        """Execute CRM write-back"""
        return await crm_service.update_ticket(**kwargs)
```

#### 2. Logistics_Inquiry Tool
```python
class LogisticsInquiryTool(MCPTool):
    name = "logistics_inquiry"
    description = "Query shipping and delivery status"
    
    parameters = {
        "tracking_number": "string",
        "order_id": "string"
    }
    
    async def execute(self, **kwargs):
        """Query logistics systems"""
        return await shipping_api.track(**kwargs)
```

#### 3. Refund_Processing Tool
```python
class RefundProcessingTool(MCPTool):
    name = "refund_processing"
    description = "Process refund with policy compliance"
    
    parameters = {
        "order_id": "string",
        "amount": "float",
        "reason": "string",
        "sentiment_score": "float"
    }
    
    async def execute(self, **kwargs):
        """Process refund through Granite orchestrator"""
        return await finance_service.process_refund(**kwargs)
```

### Tool Discovery Flow

```
Agent Request
     ↓
[MCP Server]
     ↓
List Available Tools
     ↓
[Agent Selects Tool]
     ↓
[MCP Server Executes]
     ↓
Return Result + Log Action
```

---

## The Empathy Engine

### Architecture

```python
class EmpathyEngine:
    """
    Sentiment analysis and empathy scoring
    Powered by Claude 3.5 for nuanced understanding
    """
    
    def __init__(self):
        self.claude_client = anthropic.Anthropic()
        self.sentiment_threshold = 0.3  # Low = angry
    
    async def analyze_sentiment(self, message: str) -> EmpathyScore:
        """
        Extract sentiment_score using Claude
        Returns: EmpathyScore with score (0.0-1.0)
        """
        response = await self.claude_client.messages.create(
            model="claude-3-5-sonnet-20241022",
            messages=[{
                "role": "user",
                "content": f"Analyze sentiment: {message}"
            }]
        )
        
        return EmpathyScore(
            score=self._extract_score(response),
            emotion=self._extract_emotion(response),
            urgency=self._calculate_urgency(response)
        )
```

### Sentiment-Driven Routing

```python
async def route_with_empathy(message: str, sentiment_score: float):
    """
    Route based on sentiment score
    Low score (< 0.3) = Proactive Compensation Path
    """
    
    if sentiment_score < 0.3:
        # Customer is angry - activate proactive compensation
        return await granite_orchestrator.proactive_compensation(
            message=message,
            sentiment_score=sentiment_score,
            priority="HIGH"
        )
    elif sentiment_score < 0.6:
        # Customer is frustrated - expedite handling
        return await granite_orchestrator.expedited_handling(
            message=message,
            sentiment_score=sentiment_score,
            priority="MEDIUM"
        )
    else:
        # Customer is neutral/positive - standard flow
        return await granite_orchestrator.standard_flow(
            message=message,
            sentiment_score=sentiment_score,
            priority="NORMAL"
        )
```

### Proactive Compensation Logic

```python
async def proactive_compensation(
    message: str,
    sentiment_score: float,
    order_id: str
):
    """
    Granite-powered proactive compensation
    Triggered when sentiment_score < 0.3
    """
    
    # Step 1: Granite analyzes situation
    analysis = await granite_client.analyze(
        prompt=f"""
        Customer is very frustrated (sentiment: {sentiment_score}).
        Message: {message}
        Order: {order_id}
        
        Recommend proactive compensation:
        - Refund amount
        - Store credit
        - Expedited shipping
        - Other gestures
        """
    )
    
    # Step 2: Granite makes decision
    decision = await granite_client.decide(
        analysis=analysis,
        business_rules=COMPENSATION_POLICY,
        risk_threshold=0.8
    )
    
    # Step 3: Execute via MCP
    result = await mcp_server.execute_tool(
        tool="refund_processing",
        params={
            "order_id": order_id,
            "amount": decision.refund_amount,
            "reason": "proactive_compensation",
            "sentiment_score": sentiment_score
        }
    )
    
    # Step 4: CRM write-back
    await mcp_server.execute_tool(
        tool="crm_write_back",
        params={
            "ticket_id": result.ticket_id,
            "action_type": "proactive_compensation",
            "details": decision.to_dict(),
            "sentiment_score": sentiment_score
        }
    )
    
    return result
```

---

## LangGraph Cyclic States

### State Machine Design

```python
from langgraph.graph import StateGraph, END

class OrchestraState(TypedDict):
    """Shared state across all agents"""
    message: str
    sentiment_score: float
    intent: str
    routed_to: str
    actions_taken: List[Dict]
    granite_decision: Optional[Dict]
    final_response: str

# Define the graph
workflow = StateGraph(OrchestraState)

# Add nodes
workflow.add_node("triage_claude", triage_with_claude)
workflow.add_node("empathy_analysis", empathy_engine_node)
workflow.add_node("granite_orchestrator", granite_decision_node)
workflow.add_node("logistics_specialist", logistics_agent_node)
workflow.add_node("finance_specialist", finance_agent_node)
workflow.add_node("granite_final_action", granite_action_node)
workflow.add_node("crm_writeback", crm_writeback_node)

# Define edges with conditional routing
workflow.add_edge("triage_claude", "empathy_analysis")

workflow.add_conditional_edges(
    "empathy_analysis",
    route_by_sentiment,
    {
        "proactive_compensation": "granite_orchestrator",
        "expedited": "granite_orchestrator",
        "standard": "granite_orchestrator"
    }
)

workflow.add_conditional_edges(
    "granite_orchestrator",
    route_to_specialist,
    {
        "logistics": "logistics_specialist",
        "finance": "finance_specialist",
        "direct_action": "granite_final_action"
    }
)

workflow.add_edge("logistics_specialist", "granite_final_action")
workflow.add_edge("finance_specialist", "granite_final_action")
workflow.add_edge("granite_final_action", "crm_writeback")
workflow.add_edge("crm_writeback", END)

# Set entry point
workflow.set_entry_point("triage_claude")
```

### Cyclic State Flow

```
┌─────────────────────────────────────────────────────┐
│                  Customer Message                    │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │ Triage (Claude)│
         │  - Sentiment   │
         │  - Intent      │
         └────────┬───────┘
                  │
                  ▼
         ┌────────────────┐
         │ Empathy Engine │
         │ sentiment_score│
         └────────┬───────┘
                  │
        ┌─────────┴─────────┐
        │                   │
    < 0.3 (Angry)      > 0.3 (Calm)
        │                   │
        ▼                   ▼
┌───────────────┐   ┌───────────────┐
│   Proactive   │   │   Standard    │
│ Compensation  │   │     Flow      │
└───────┬───────┘   └───────┬───────┘
        │                   │
        └─────────┬─────────┘
                  │
                  ▼
         ┌────────────────┐
         │    Granite     │
         │  Orchestrator  │
         │   (Decision)   │
         └────────┬───────┘
                  │
        ┌─────────┴─────────┐
        │                   │
    Logistics          Finance
        │                   │
        ▼                   ▼
┌───────────────┐   ┌───────────────┐
│   Logistics   │   │    Finance    │
│  Specialist   │   │  Specialist   │
│   (Claude)    │   │   (Granite)   │
└───────┬───────┘   └───────┬───────┘
        │                   │
        └─────────┬─────────┘
                  │
                  ▼
         ┌────────────────┐
         │    Granite     │
         │  Final Action  │
         │   (Execute)    │
         └────────┬───────┘
                  │
                  ▼
         ┌────────────────┐
         │  CRM Writeback │
         │   (via MCP)    │
         └────────┬───────┘
                  │
                  ▼
              ┌───────┐
              │  END  │
              └───────┘
```

---

## Agent Implementations

### 1. Triage Agent (Claude 3.5)

```python
class TriageAgent:
    """
    Powered by Claude 3.5 for nuanced sentiment analysis
    """
    
    def __init__(self):
        self.claude = anthropic.Anthropic()
        self.empathy_engine = EmpathyEngine()
    
    async def process(self, message: str) -> TriageResult:
        """
        Step 1: Analyze with Claude
        Step 2: Extract sentiment_score
        Step 3: Classify intent
        """
        
        # Claude analysis
        response = await self.claude.messages.create(
            model="claude-3-5-sonnet-20241022",
            messages=[{
                "role": "user",
                "content": f"""
                Analyze this customer message:
                "{message}"
                
                Provide:
                1. Sentiment (angry/frustrated/neutral/happy)
                2. Intent (refund/shipping/complaint/inquiry)
                3. Urgency (low/medium/high/critical)
                4. Key issues mentioned
                """
            }]
        )
        
        # Extract sentiment score
        sentiment_score = await self.empathy_engine.analyze_sentiment(message)
        
        return TriageResult(
            sentiment_score=sentiment_score.score,
            intent=self._extract_intent(response),
            urgency=self._extract_urgency(response),
            route_to=self._determine_routing(sentiment_score, response)
        )
```

### 2. Granite Orchestrator (IBM Granite-20b)

```python
class GraniteOrchestrator:
    """
    Primary decision-maker for all actions
    Powered by IBM Granite-20b via watsonx.ai
    """
    
    def __init__(self):
        self.watsonx_client = WatsonxClient()
        self.mcp_server = OrchestraSupportMCP()
    
    async def make_decision(
        self,
        triage_result: TriageResult,
        context: Dict
    ) -> GraniteDecision:
        """
        Granite makes the final decision
        """
        
        prompt = f"""
        Customer Situation:
        - Sentiment Score: {triage_result.sentiment_score}
        - Intent: {triage_result.intent}
        - Urgency: {triage_result.urgency}
        - Context: {context}
        
        Business Rules:
        - Refunds < $100: Auto-approve
        - Refunds $100-$500: Require sentiment check
        - Refunds > $500: Require manager approval
        - Angry customers (score < 0.3): Proactive compensation
        
        Decision Required:
        1. Action to take (refund/credit/expedite/escalate)
        2. Amount (if applicable)
        3. Justification
        4. Risk assessment
        """
        
        response = await self.watsonx_client.generate(
            model="ibm/granite-20b-multilingual",
            prompt=prompt,
            parameters={
                "max_new_tokens": 500,
                "temperature": 0.1,  # Low for consistency
                "top_p": 0.95
            }
        )
        
        decision = self._parse_decision(response)
        
        # Validate against business rules
        if not self._validate_decision(decision):
            decision = await self._escalate_to_human(decision)
        
        return decision
    
    async def execute_action(
        self,
        decision: GraniteDecision
    ) -> ActionResult:
        """
        Execute the decision via MCP tools
        """
        
        # Execute via MCP
        result = await self.mcp_server.execute_tool(
            tool=decision.tool_name,
            params=decision.parameters
        )
        
        # CRM write-back
        await self.mcp_server.execute_tool(
            tool="crm_write_back",
            params={
                "ticket_id": result.ticket_id,
                "action_type": decision.action_type,
                "details": decision.to_dict(),
                "sentiment_score": decision.sentiment_score
            }
        )
        
        return result
```

### 3. Finance Agent (Granite-20b)

```python
class FinanceAgent:
    """
    Handles refunds and credits
    Powered by Granite for consistent business logic
    """
    
    def __init__(self):
        self.granite = GraniteOrchestrator()
        self.mcp_server = OrchestraSupportMCP()
    
    async def process_refund(
        self,
        order_id: str,
        amount: float,
        sentiment_score: float
    ) -> RefundResult:
        """
        Process refund with Granite decision-making
        """
        
        # Retrieve policy via MCP
        policy = await self.mcp_server.execute_tool(
            tool="policy_retrieval",
            params={"policy_type": "refund"}
        )
        
        # Granite makes decision
        decision = await self.granite.make_decision(
            triage_result=TriageResult(
                sentiment_score=sentiment_score,
                intent="refund",
                urgency="high" if sentiment_score < 0.3 else "medium"
            ),
            context={
                "order_id": order_id,
                "amount": amount,
                "policy": policy
            }
        )
        
        # Execute
        result = await self.granite.execute_action(decision)
        
        return result
```

---

## Evidence & Documentation

### SUBMISSION_LOG.md Structure

The SUBMISSION_LOG.md will document:

1. **MCP Architecture Design**
   - How Bob designed the BaseMCP class
   - Tool registration logic
   - Discovery mechanism

2. **LangGraph Cyclic States**
   - State machine design
   - Conditional routing logic
   - Sentiment-driven paths

3. **Hybrid Model Strategy**
   - Why Claude for Triage
   - Why Granite for Orchestration
   - Performance comparisons

4. **Empathy Engine Implementation**
   - Sentiment scoring algorithm
   - Proactive compensation triggers
   - Business impact

5. **Meaningful Use of Bob**
   - Architectural decisions
   - Code examples
   - Innovation highlights

---

## System of Record Updates

Every action MUST update the system of record:

```python
{
    "action_id": "ACT-12345",
    "ticket_id": "TKT-12345",
    "model_used": "ibm/granite-20b-multilingual",
    "triage_model": "claude-3-5-sonnet-20241022",
    "sentiment_score": 0.25,
    "action_type": "proactive_compensation",
    "decision_rationale": "Customer angry, proactive refund",
    "amount": 49.99,
    "mcp_tools_used": ["refund_processing", "crm_write_back"],
    "timestamp": "2024-05-02T10:30:00Z",
    "success": true
}
```

---

## Success Metrics

1. **Sentiment Accuracy**: Claude's sentiment detection accuracy
2. **Decision Consistency**: Granite's decision consistency rate
3. **Proactive Compensation Rate**: % of angry customers receiving proactive compensation
4. **Action Compliance**: 100% of conversations result in system updates
5. **MCP Tool Usage**: Tool discovery and execution success rate

---

**Built by IBM Bob** - Architect of the MCP Bridge and Hybrid Agentic System