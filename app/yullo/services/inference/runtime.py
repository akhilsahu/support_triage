import json
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
import structlog
import asyncio

from app.yullo.schemas.inference import AuraInferenceRequest, AuraStreamEvent
from app.yullo.schemas.retrieval import YulloExecutionContext
from dataclasses import dataclass
from app.yullo.services.knowledge.retriever import YulloRetriever
from app.yullo.adapters.conversations import YulloConversationRepository
from app.core.llm_provider import get_async_openai_clients

logger = structlog.get_logger()

SYSTEM_PROMPT = """You are Aura, an intelligent AI assistant.
Answer the user's question accurately using the provided context.
Do not invent information. If the context does not contain the answer, say so.
"""

@dataclass
class AuraResponse:
    text: str
    ui_nodes: list[dict]
    citations: list[dict]
    route: str
    sufficiency: str
    rag_hit: bool

class YulloAuraRuntime:
    def __init__(self, db: AsyncSession, retriever: YulloRetriever, conversations: YulloConversationRepository):
        self.db = db
        self.retriever = retriever
        self.conversations = conversations

    async def _generate_stream(
        self,
        context_req: YulloExecutionContext,
        message: str,
        history: list,
        request_model: str | None = None
    ) -> AsyncGenerator[str, None]:
        # 3. Retrieve Context
        evidence = await self.retriever.retrieve(context_req, message)
        
        # 4. Synthesize Prompt
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        
        context_str = "Context:\n"
        for fact in evidence.structured_facts:
            context_str += f"- {fact['subject']} {fact['label']}: {fact['value']}\n"
        for p in evidence.passages:
            context_str += f"- {p['content']}\n"
            
        messages.append({"role": "system", "content": context_str})
        
        # Add History
        for log in history:
            messages.append({"role": log.role, "content": log.message})
            
        # Add Current Message
        messages.append({"role": "user", "content": message})
        
        import uuid
        message_id = str(uuid.uuid4())
        yield json.dumps({"type": "message.start", "messageId": message_id}) + "\n"

        # Yield Citations Event
        if evidence.structured_facts or evidence.passages:
            for idx, fact in enumerate(evidence.structured_facts):
                yield json.dumps({
                    "type": "citation.add", 
                    "citation": {"id": f"fact_{idx}", "label": fact["subject"], "snippet": fact["value"]}
                }) + "\n"
            for idx, p in enumerate(evidence.passages):
                yield json.dumps({
                    "type": "citation.add", 
                    "citation": {"id": f"pass_{idx}", "label": "Document", "snippet": p["content"][:100]}
                }) + "\n"

        # 5. Call LLM
        clients = get_async_openai_clients(override_model=request_model)
        if not clients:
            yield json.dumps({"type": "error", "message": "No LLM providers configured"}) + "\n"
            return

        provider_name, client, model = clients[0] # Use first available priority
        
        # Tools for generative UI
        tools = [
            {
                "type": "function",
                "function": {
                    "name": "show_ui_card",
                    "description": "Show a visual UI card to the user for a service, location, or portfolio item.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "card_type": {
                                "type": "string",
                                "enum": ["service", "location", "portfolio"],
                                "description": "The type of UI card to show."
                            },
                            "entity_id": {
                                "type": "string",
                                "description": "The UUID of the entity to display."
                            }
                        },
                        "required": ["card_type", "entity_id"]
                    }
                }
            }
        ]
        
        # Get available entities to pass to the LLM
        from app.models.yullo_space_entity import YulloSpaceEntity
        from sqlalchemy import select
        entities_stmt = select(YulloSpaceEntity).where(
            YulloSpaceEntity.space_id == context_req.space_id,
            YulloSpaceEntity.is_public == True,
            YulloSpaceEntity.is_active == True
        )
        entities_res = await self.db.execute(entities_stmt)
        available_entities = entities_res.scalars().all()
        
        entity_prompt = "You can show visual UI cards for the following entities by calling the `show_ui_card` tool:\n"
        for e in available_entities:
            title = e.payload_json.get("title", "Untitled")
            entity_prompt += f"- ID: {str(e.id)} | Type: {e.entity_type} | Title: {title}\n"
        
        messages.append({"role": "system", "content": entity_prompt})

        import time
        from app.services.ai_usage import build_usage_event, estimate_tokens, record_usage_event
        
        start_time = time.time()
        # Estimate prompt tokens for usage tracking
        prompt_text = "".join(m.get("content", "") for m in messages)
        prompt_tokens = estimate_tokens(prompt_text)
        generated_text = ""
        
        try:
            stream = await client.chat.completions.create(
                model=model,
                messages=messages,
                stream=True,
                temperature=0.3,
                tools=tools
            )
            
            tool_calls_buffer = {}
            
            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if not delta:
                    continue
                    
                if delta.content:
                    generated_text += delta.content
                    yield json.dumps({"type": "text.delta", "delta": delta.content}) + "\n"
                    
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        if tc.index not in tool_calls_buffer:
                            tool_calls_buffer[tc.index] = {"name": tc.function.name, "arguments": ""}
                        if tc.function.arguments:
                            tool_calls_buffer[tc.index]["arguments"] += tc.function.arguments

            # Process buffered tool calls
            for idx, tc in tool_calls_buffer.items():
                if tc["name"] == "show_ui_card":
                    try:
                        args = json.loads(tc["arguments"])
                        card_type = args.get("card_type")
                        entity_id = args.get("entity_id")
                        if card_type and entity_id:
                            node = {"type": card_type}
                            if card_type == "service":
                                node["serviceId"] = entity_id
                            elif card_type == "location":
                                node["locationId"] = entity_id
                            elif card_type == "portfolio":
                                node["portfolioId"] = entity_id
                            
                            generated_text += f"\n[UI Node: {card_type} {entity_id}]"
                            yield json.dumps({"type": "ui.add", "node": node}) + "\n"
                    except json.JSONDecodeError:
                        pass
                        
            # Record success usage
            latency_ms = int((time.time() - start_time) * 1000)
            usage_dict = {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": estimate_tokens(generated_text)
            }
            ev = build_usage_event(
                kind="chat", provider=provider_name, model=model, latency_ms=latency_ms,
                usage=usage_dict, estimated=True, ok=True, error_type=None
            )
            asyncio.get_running_loop().create_task(record_usage_event(ev))
            
        except Exception as e:
            logger.error("aura_llm_stream_error", error=str(e))
            # Record failure usage
            latency_ms = int((time.time() - start_time) * 1000)
            ev = build_usage_event(
                kind="chat", provider=provider_name, model=model, latency_ms=latency_ms,
                usage={"prompt_tokens": prompt_tokens, "completion_tokens": estimate_tokens(generated_text)}, 
                estimated=True, ok=False, error_type=type(e).__name__
            )
            asyncio.get_running_loop().create_task(record_usage_event(ev))
            yield json.dumps({"type": "error", "message": "LLM generation failed"}) + "\n"
            return
            
        yield json.dumps({"type": "message.done"}) + "\n"

    async def generate_validated_answer(
        self,
        context_req: YulloExecutionContext,
        message: str,
        history: list,
        request_model: str | None = None
    ) -> AuraResponse:
        text = ""
        ui_nodes = []
        citations = []
        rag_hit = False

        async for chunk in self._generate_stream(context_req, message, history, request_model):
            if not chunk.strip():
                continue
            try:
                data = json.loads(chunk)
                evt_type = data.get("type")
                if evt_type == "text.delta":
                    text += data.get("delta", "")
                elif evt_type == "ui.add":
                    ui_nodes.append(data.get("node"))
                elif evt_type == "citation.add":
                    citations.append(data.get("citation"))
                    rag_hit = True
            except json.JSONDecodeError:
                pass

        return AuraResponse(
            text=text,
            ui_nodes=ui_nodes,
            citations=citations,
            route="retrieval" if rag_hit else "deterministic",
            sufficiency="supported",
            rag_hit=rag_hit
        )

    async def stream_response(self, request: AuraInferenceRequest) -> AsyncGenerator[str, None]:
        try:
            # 1. Load Session
            history = await self.conversations.history(request.session_id)
            if not history:
                raise ValueError(f"Session {request.session_id} not found or not Aura")
                
            # Get the actual ChatSession object
            from app.models.chat import ChatSession
            from sqlalchemy import select
            
            stmt = select(ChatSession).where(ChatSession.id == request.session_id, ChatSession.runtime_type == "aura")
            result = await self.db.execute(stmt)
            session = result.scalars().first()
            if not session:
                raise ValueError("Session not found")

            # 2. Append User Message
            await self.conversations.append_user(session, request.message)
            
            # 3. Retrieve Context & 4. Call Headless Stream
            context_req = YulloExecutionContext(
                space_id=request.space_id,
                kb_ids=request.kb_ids,
                published_version=request.published_version
            )
            
            # Setup Usage Context
            import uuid
            from app.yullo.adapters.usage import set_aura_inference_context
            from app.services.ai_usage_context import reset_ai_usage_context
            
            aura_run_id = uuid.uuid4()
            ctx_token = set_aura_inference_context(
                space_id=request.space_id,
                session_id=request.session_id,
                message_id=None, # Will be created
                aura_id=uuid.UUID(int=0), # Dummy until proper Aura ID is passed
                aura_version_id=uuid.UUID(int=0)
            )
            
            full_response = ""
            citation_refs = []
            
            try:
                async for chunk in self._generate_stream(context_req, request.message, history, request.model):
                    try:
                        data = json.loads(chunk.strip())
                        if data.get("type") == "text.delta":
                            full_response += data.get("delta", "")
                        elif data.get("type") == "citation.add":
                            citation_refs.append({"source": "retrieval", "count": 1})
                    except Exception:
                        pass
                    yield chunk
    
                # 6. Commit assistant response
                if citation_refs:
                    citation_refs = [{"source": "retrieval", "count": len(citation_refs)}]
                    
                await self.conversations.append_aura(
                    session, 
                    message=full_response, 
                    citations=citation_refs, 
                    blocks=[]
                )
            finally:
                reset_ai_usage_context(ctx_token)
            
        except Exception as e:
            logger.exception("aura_runtime_error", error=str(e))
            yield json.dumps({"type": "error", "message": str(e)}) + "\n"
