from typing import Optional
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.yullo.schemas.retrieval import YulloExecutionContext, EvidencePack
from app.yullo.services.knowledge.retrieval import get_authoritative_facts
from app.orchestra.ai.knowledge.base import BaseKnowledgeBackend

logger = structlog.get_logger()

class YulloRetriever:
    """
    Publication-aware retrieval service for Aura.
    Combines strict Space-isolated facts with ChromaDB passages.
    """
    def __init__(self, db: AsyncSession, knowledge_backend: BaseKnowledgeBackend):
        self.db = db
        self.knowledge_backend = knowledge_backend
        
    async def retrieve(self, context: YulloExecutionContext, query: str, limit: int = 5) -> EvidencePack:
        pack = EvidencePack()
        
        # 1. Fetch Authoritative Facts
        for kb_id in context.kb_ids:
            facts = await get_authoritative_facts(self.db, space_id=context.space_id, kb_id=kb_id)
            for fact in facts:
                # In the future, we could do semantic filtering on facts based on the query.
                # For now, we return the relevant facts.
                pack.structured_facts.append({
                    "id": str(fact.id),
                    "subject": fact.subject,
                    "label": fact.label,
                    "value": fact.value,
                    "source_item_id": str(fact.source_item_id) if fact.source_item_id else None,
                    "review_status": fact.review_status,
                })
        
        # 2. Fetch Unstructured Passages
        bundle = self.knowledge_backend.for_agent(
            space_id=str(context.space_id),
            kb_assignments=[{"kb_id": str(kb_id)} for kb_id in context.kb_ids]
        )
        
        if bundle.has_knowledge:
            try:
                # ChromaDB search is synchronous in Agno
                docs = await asyncio.to_thread(
                    bundle.knowledge.search,
                    query=query, 
                    filters=bundle.filters
                )
                
                # Slicing the results
                docs = docs[:limit]
                
                for doc in docs:
                    pack.passages.append({
                        "content": doc.content,
                        "meta": getattr(doc, "meta_data", {})
                    })
            except Exception as e:
                logger.error("yullo_retriever.search_failed", error=str(e), space_id=str(context.space_id))
        
        # 3. Determine Sufficiency
        if pack.structured_facts or pack.passages:
            pack.sufficiency = "supported"
        else:
            pack.sufficiency = "missing"
            
        return pack
