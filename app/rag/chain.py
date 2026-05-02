"""RAG chain using LangChain with switchable LLM models"""

from typing import Dict, Any, Optional, List
import structlog

from app.rag.retriever import RAGRetriever
from app.services.llm_service import llm_service
from app.config import settings

logger = structlog.get_logger()


class RAGChain:
    """
    RAG (Retrieval-Augmented Generation) chain.
    
    Combines document retrieval with LLM generation using switchable models
    (OpenAI GPT-3.5, GPT-4, Claude, etc.)
    """
    
    def __init__(self, retriever: RAGRetriever):
        self.retriever = retriever
        self.default_system_prompt = """You are a helpful AI assistant. Use the following context to answer the question.
If you cannot answer based on the context provided, say so clearly.
Be concise and accurate in your responses."""
    
    async def query(
        self,
        question: str,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        top_k: Optional[int] = None,
        filters: Optional[Dict[str, Any]] = None,
        system_prompt: Optional[str] = None,
        include_sources: bool = True
    ) -> Dict[str, Any]:
        """
        Execute RAG query with switchable LLM model.
        
        Args:
            question: User question
            model: LLM model to use (e.g., 'gpt-4', 'claude-3-opus-20240229')
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            top_k: Number of documents to retrieve
            filters: Document filters
            system_prompt: Custom system prompt
            include_sources: Whether to include source documents
        
        Returns:
            Dict with 'answer', 'model', 'sources', and 'usage'
        """
        # Retrieve relevant documents
        documents = await self.retriever.retrieve(
            question,
            top_k=top_k,
            filters=filters
        )
        
        if not documents:
            return {
                "answer": "I don't have enough information to answer this question.",
                "model": model or settings.OPENAI_MODEL,
                "sources": [],
                "usage": None
            }
        
        # Format context from documents
        context = self._format_context(documents)
        
        # Build messages
        messages = [
            {
                "role": "user",
                "content": f"""Context:
{context}

Question: {question}

Answer:"""
            }
        ]
        
        # Generate answer using LLM
        try:
            response = await llm_service.generate(
                messages=messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                system_prompt=system_prompt or self.default_system_prompt
            )
            
            result = {
                "answer": response["content"],
                "model": response["model"],
                "provider": response["provider"],
                "usage": response["usage"]
            }
            
            if include_sources:
                result["sources"] = [
                    {
                        "id": str(doc.id),
                        "content": doc.content[:200] + "..." if len(doc.content) > 200 else doc.content,
                        "source": doc.source,
                        "metadata": doc.metadata,
                        "chunk_index": doc.chunk_index
                    }
                    for doc in documents
                ]
            
            logger.info(
                "RAG query completed",
                question_length=len(question),
                documents_used=len(documents),
                model=response["model"],
                provider=response["provider"]
            )
            
            return result
        
        except Exception as e:
            logger.error(f"RAG query failed: {e}")
            raise
    
    async def query_with_reranking(
        self,
        question: str,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        top_k: Optional[int] = None,
        filters: Optional[Dict[str, Any]] = None,
        rerank_top_k: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Execute RAG query with document reranking.
        
        Retrieves more documents initially, then reranks them based on
        relevance before generating the answer.
        """
        top_k = top_k or settings.RAG_TOP_K
        rerank_top_k = rerank_top_k or top_k
        
        # Retrieve more documents for reranking
        docs_with_scores = await self.retriever.retrieve_with_scores(
            question,
            top_k=top_k * 2,
            filters=filters
        )
        
        if not docs_with_scores:
            return {
                "answer": "I don't have enough information to answer this question.",
                "model": model or settings.OPENAI_MODEL,
                "sources": [],
                "usage": None
            }
        
        # Simple reranking by score (can be enhanced with cross-encoder)
        reranked = sorted(docs_with_scores, key=lambda x: x[1], reverse=True)
        top_docs = [doc for doc, _ in reranked[:rerank_top_k]]
        
        # Format context
        context = self._format_context(top_docs)
        
        # Build messages
        messages = [
            {
                "role": "user",
                "content": f"""Context:
{context}

Question: {question}

Answer:"""
            }
        ]
        
        # Generate answer
        response = await llm_service.generate(
            messages=messages,
            model=model,
            temperature=temperature,
            system_prompt=self.default_system_prompt
        )
        
        return {
            "answer": response["content"],
            "model": response["model"],
            "provider": response["provider"],
            "usage": response["usage"],
            "sources": [
                {
                    "id": str(doc.id),
                    "content": doc.content[:200] + "...",
                    "source": doc.source,
                    "metadata": doc.metadata,
                    "score": score
                }
                for doc, score in reranked[:rerank_top_k]
            ]
        }
    
    async def query_stream(
        self,
        question: str,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        top_k: Optional[int] = None,
        filters: Optional[Dict[str, Any]] = None,
        system_prompt: Optional[str] = None
    ):
        """
        Execute RAG query with streaming response.
        
        Yields chunks of the generated answer as they are produced.
        """
        # Retrieve documents
        documents = await self.retriever.retrieve(
            question,
            top_k=top_k,
            filters=filters
        )
        
        if not documents:
            yield {
                "content": "I don't have enough information to answer this question.",
                "done": True
            }
            return
        
        # Format context
        context = self._format_context(documents)
        
        # Build messages
        messages = [
            {
                "role": "user",
                "content": f"""Context:
{context}

Question: {question}

Answer:"""
            }
        ]
        
        # Stream response
        async for chunk in llm_service.generate_stream(
            messages=messages,
            model=model,
            temperature=temperature,
            system_prompt=system_prompt or self.default_system_prompt
        ):
            yield chunk
    
    def _format_context(self, documents: List) -> str:
        """Format documents into context string"""
        context_parts = []
        for i, doc in enumerate(documents, 1):
            context_parts.append(f"[Document {i}]")
            context_parts.append(f"Source: {doc.source}")
            context_parts.append(f"Content: {doc.content}")
            context_parts.append("")
        
        return "\n".join(context_parts)
    
    async def multi_query(
        self,
        questions: List[str],
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        top_k: Optional[int] = None,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Execute multiple RAG queries efficiently.
        
        Args:
            questions: List of questions
            model: LLM model to use
            temperature: Sampling temperature
            top_k: Documents per query
            filters: Document filters
        
        Returns:
            List of query results
        """
        results = []
        for question in questions:
            result = await self.query(
                question=question,
                model=model,
                temperature=temperature,
                top_k=top_k,
                filters=filters
            )
            results.append(result)
        
        logger.info(f"Multi-query completed: {len(questions)} questions")
        return results

# Made with Bob
