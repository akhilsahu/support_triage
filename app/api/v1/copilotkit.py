from fastapi import APIRouter
from copilotkit import CopilotKitRemoteEndpoint, LangGraphAGUIAgent
from copilotkit.integrations.fastapi import add_fastapi_endpoint
from ag_ui_langgraph import add_langgraph_fastapi_endpoint
from app.config import settings

from langgraph.graph import StateGraph, START, END
from typing import Annotated, TypedDict
import json
from langchain_core.messages import AIMessage, BaseMessage
from app.api.customer import customer_chat, CustomerChatRequest

# CopilotKit state includes 'copilotkit' holding the frontend readables
class State(TypedDict):
    messages: list[BaseMessage]
    copilotkit: dict

async def bridge_node(state: State):
    ck_state = state.get("copilotkit", {}).get("state", {})
    slug = ck_state.get("slug", "default")
    session_id = ck_state.get("session_id", None)

    messages = state.get("messages", [])
    if not messages:
        return {"messages": []}
    
    last_msg = messages[-1]
    if last_msg.type != "human":
        return {"messages": []}

    req = CustomerChatRequest(message=last_msg.content, session_id=session_id)
    try:
        response = await customer_chat(slug=slug, req=req)
        body = json.loads(response.body.decode('utf-8'))
        reply = body.get("reply", "No reply received.")
        return {"messages": [AIMessage(content=reply)]}
    except Exception as e:
        return {"messages": [AIMessage(content=f"Error routing to chatbot: {str(e)}")]}

builder = StateGraph(State)
builder.add_node("agent", bridge_node)
builder.add_edge(START, "agent")
builder.add_edge("agent", END)
bridge_graph = builder.compile()

bridge_agent = LangGraphAGUIAgent(
    name="default",
    description="Bridge agent forwarding to AgnoOrchestrator",
    graph=bridge_graph
)

router = APIRouter()
sdk = CopilotKitRemoteEndpoint(
    agents=[bridge_agent]
)

@router.get("/info")
def get_info():
    data = sdk.info(context={})
    # CopilotKit React SDK v1.69 expects 'agents' to be a dictionary keyed by name,
    # but the Python SDK v0.1.95 returns a list. This causes 'Known agents: [0]'.
    if isinstance(data.get("agents"), list):
        data["agents"] = {agent["name"]: agent for agent in data["agents"]}
    return data

def setup_copilotkit(app):
    app.include_router(router, prefix="/api/v1/copilotkit")
    
    # In Python CopilotKit v0.1.95, `LangGraphAGUIAgent` lacks an `execute` method, causing 500s.
    # The frontend SDK correctly recognizes the agent as AGUI but requests `/agent/default` 
    # instead of `/run` (because it expects a generic v1 payload when the backend sets agent type).
    # We monkey-patch `execute` here to properly yield standard CopilotKit events.
    import json
    
    async def bridge_execute(
        self, thread_id: str, node_name: str, state: dict, config: dict, messages: list, actions: list, meta_events: list, **kwargs
    ):
        slug = state.get("slug", "default")
        session_id = state.get("session_id")
        
        user_message = ""
        for msg in reversed(messages):
            if isinstance(msg, dict) and msg.get('role') == 'user':
                user_message = msg.get('content', '')
                break
            elif hasattr(msg, 'role') and msg.role == 'user':
                user_message = getattr(msg, 'content', '')
                break
                
        msg_id = "msg_" + thread_id[:8]
        yield f'{{"type": "TextMessageStart", "messageId": "{msg_id}"}}\n'
        
        try:
            req = CustomerChatRequest(message=user_message, session_id=session_id)
            response = await customer_chat(slug=slug, req=req, chatbot_slug=None, authorization=None)
            
            body = json.loads(response.body.decode('utf-8'))
            reply = body.get("reply", body.get("detail", "No reply received."))
        except Exception as e:
            reply = f"Error: {str(e)}"
            
        yield json.dumps({
            "type": "TextMessageContent", 
            "messageId": msg_id, 
            "content": reply
        }) + "\n"
        
        yield f'{{"type": "TextMessageEnd", "messageId": "{msg_id}"}}\n'
        
    # Bind the method to the instance
    bridge_agent.execute = bridge_execute.__get__(bridge_agent)
    
    add_fastapi_endpoint(app, sdk, "/api/v1/copilotkit")
