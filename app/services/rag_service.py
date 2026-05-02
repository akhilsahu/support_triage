"""
Mock RAG (Retrieval-Augmented Generation) Service

This module provides a mock RAG service for policy document retrieval.
Simulates semantic search over policy documents for the Finance Agent.

Key Features:
- Policy document storage
- Semantic search simulation
- Confidence scoring
- Policy reference tracking
- Multiple document support
"""

from typing import Dict, Any, Optional, List
from datetime import datetime
from enum import Enum
import asyncio
from uuid import uuid4
from random import random

from pydantic import BaseModel, Field


class PolicyDocument(str, Enum):
    """Policy document enumeration"""
    REFUND_POLICY = "refund_policy.pdf"
    CREDIT_POLICY = "credit_policy.pdf"
    COMPENSATION_GUIDELINES = "compensation_guidelines.pdf"
    TERMS_OF_SERVICE = "terms_of_service.pdf"


class PolicySection(BaseModel):
    """Policy section model"""
    document: PolicyDocument
    section: str
    title: str
    content: str
    relevance_score: float = Field(ge=0.0, le=1.0)


class RAGResponse(BaseModel):
    """RAG query response"""
    query: str
    documents: List[PolicySection] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    total_results: int
    query_time_ms: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class MockRAGService:
    """
    Mock RAG service for policy document retrieval.
    
    Simulates semantic search over policy documents with
    realistic confidence scores and response times.
    """
    
    def __init__(self):
        """Initialize the mock RAG service"""
        # Mock policy database
        self._policies: Dict[PolicyDocument, List[Dict[str, Any]]] = {}
        self._initialize_mock_policies()
        
        # Query statistics
        self.query_count = 0
        self.total_query_time_ms = 0
    
    def _initialize_mock_policies(self):
        """Initialize mock policy documents"""
        
        # Refund Policy
        self._policies[PolicyDocument.REFUND_POLICY] = [
            {
                "section": "1.0",
                "title": "General Refund Policy",
                "content": "All products can be returned within 30 days of purchase for a full refund. Products must be in original condition with all packaging and accessories."
            },
            {
                "section": "2.0",
                "title": "Electronics Refund Policy",
                "content": "Electronics can be returned within 30 days of purchase. Items must be unopened and in original packaging for full refund. Opened electronics may be subject to a 15% restocking fee."
            },
            {
                "section": "3.0",
                "title": "Damaged Items",
                "content": "Items damaged during shipping are eligible for full refund or replacement within 30 days of delivery. Customer must provide photos of damage. No restocking fee applies."
            },
            {
                "section": "4.0",
                "title": "Defective Products",
                "content": "Defective products are eligible for full refund or replacement regardless of purchase date, up to manufacturer warranty period. Customer must describe defect and provide proof of purchase."
            },
            {
                "section": "5.0",
                "title": "Refund Processing Time",
                "content": "Refunds are processed within 3-5 business days after receiving returned item. Refund will be issued to original payment method. Allow 5-10 business days for refund to appear."
            }
        ]
        
        # Credit Policy
        self._policies[PolicyDocument.CREDIT_POLICY] = [
            {
                "section": "1.0",
                "title": "Store Credit Basics",
                "content": "Store credit can be issued in lieu of refund at customer's request. Store credit never expires and can be used for any purchase."
            },
            {
                "section": "2.0",
                "title": "Credit Amount",
                "content": "Store credit is issued for full purchase price including taxes. Shipping costs are not included in store credit unless shipping was defective."
            },
            {
                "section": "3.0",
                "title": "Credit for Late Deliveries",
                "content": "Customers may receive store credit for late deliveries: 5% credit for 1-3 days late, 10% credit for 4-7 days late, 15% credit for 8+ days late."
            },
            {
                "section": "4.0",
                "title": "Promotional Credit",
                "content": "Promotional store credit may be issued for service issues, inconveniences, or as goodwill gestures. Amount determined by customer service manager."
            }
        ]
        
        # Compensation Guidelines
        self._policies[PolicyDocument.COMPENSATION_GUIDELINES] = [
            {
                "section": "1.0",
                "title": "Compensation Philosophy",
                "content": "We believe in making things right for our customers. Compensation should be fair, prompt, and appropriate to the issue experienced."
            },
            {
                "section": "2.0",
                "title": "Delivery Delays",
                "content": "Delivery delays: 1-3 days late = 5% credit, 4-7 days late = 10% credit, 8-14 days late = 15% credit, 15+ days late = 20% credit or full refund."
            },
            {
                "section": "3.0",
                "title": "Damaged Items",
                "content": "Damaged items: Full refund or replacement plus 10% store credit for inconvenience. Expedited shipping on replacement at no charge."
            },
            {
                "section": "4.0",
                "title": "Wrong Item Shipped",
                "content": "Wrong item shipped: Full refund or correct item shipped with expedited shipping. 15% store credit for inconvenience. Return shipping prepaid."
            },
            {
                "section": "5.0",
                "title": "Service Issues",
                "content": "Poor service experience: $10-$50 store credit depending on severity. Multiple issues: escalate to manager for additional compensation."
            },
            {
                "section": "6.0",
                "title": "Goodwill Gestures",
                "content": "Goodwill gestures for frustrated customers: $25-$100 store credit at agent discretion. Requires manager approval for amounts over $50."
            }
        ]
        
        # Terms of Service
        self._policies[PolicyDocument.TERMS_OF_SERVICE] = [
            {
                "section": "1.0",
                "title": "Purchase Agreement",
                "content": "By making a purchase, customer agrees to all terms and conditions. All sales are final unless covered by refund policy."
            },
            {
                "section": "2.0",
                "title": "Shipping Terms",
                "content": "Estimated delivery dates are not guaranteed. We are not liable for carrier delays beyond our control. Customer may request refund for significant delays."
            },
            {
                "section": "3.0",
                "title": "Limitation of Liability",
                "content": "Our liability is limited to purchase price of product. We are not liable for consequential damages, lost profits, or indirect damages."
            }
        ]
    
    async def query(
        self,
        query: str,
        documents: Optional[List[PolicyDocument]] = None,
        max_results: int = 3
    ) -> RAGResponse:
        """
        Query policy documents using semantic search.
        
        Args:
            query: The search query
            documents: Optional list of specific documents to search
            max_results: Maximum number of results to return
            
        Returns:
            RAGResponse with relevant policy sections
        """
        self.query_count += 1
        start_time = datetime.utcnow()
        
        # Simulate query processing time
        await asyncio.sleep(random() * 0.5 + 0.5)  # 500-1000ms
        
        # If no specific documents, search all
        if not documents:
            documents = list(PolicyDocument)
        
        # Search for relevant sections
        results = []
        query_lower = query.lower()
        
        for doc in documents:
            if doc not in self._policies:
                continue
            
            for section_data in self._policies[doc]:
                # Calculate relevance score (mock semantic similarity)
                relevance = self._calculate_relevance(query_lower, section_data)
                
                if relevance > 0.3:  # Threshold for inclusion
                    results.append(PolicySection(
                        document=doc,
                        section=section_data["section"],
                        title=section_data["title"],
                        content=section_data["content"],
                        relevance_score=relevance
                    ))
        
        # Sort by relevance and limit results
        results.sort(key=lambda x: x.relevance_score, reverse=True)
        results = results[:max_results]
        
        # Calculate overall confidence
        confidence = self._calculate_confidence(results)
        
        # Calculate query time
        query_time_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        self.total_query_time_ms += query_time_ms
        
        return RAGResponse(
            query=query,
            documents=results,
            confidence=confidence,
            total_results=len(results),
            query_time_ms=query_time_ms
        )
    
    def _calculate_relevance(
        self,
        query: str,
        section_data: Dict[str, Any]
    ) -> float:
        """
        Calculate relevance score (mock semantic similarity).
        
        Args:
            query: Search query (lowercase)
            section_data: Policy section data
            
        Returns:
            Relevance score (0.0 - 1.0)
        """
        content = section_data["content"].lower()
        title = section_data["title"].lower()
        
        # Simple keyword matching (in real system, would use embeddings)
        query_words = set(query.split())
        content_words = set(content.split())
        title_words = set(title.split())
        
        # Calculate overlap
        content_overlap = len(query_words & content_words) / max(len(query_words), 1)
        title_overlap = len(query_words & title_words) / max(len(query_words), 1)
        
        # Weight title matches higher
        relevance = (content_overlap * 0.7) + (title_overlap * 0.3)
        
        # Add some randomness to simulate semantic understanding
        relevance += random() * 0.1
        
        return min(1.0, relevance)
    
    def _calculate_confidence(
        self,
        results: List[PolicySection]
    ) -> float:
        """
        Calculate overall confidence in results.
        
        Args:
            results: List of policy sections
            
        Returns:
            Confidence score (0.0 - 1.0)
        """
        if not results:
            return 0.0
        
        # Average of top results' relevance scores
        top_scores = [r.relevance_score for r in results[:3]]
        avg_score = sum(top_scores) / len(top_scores)
        
        # Penalize if few results
        result_penalty = min(1.0, len(results) / 3)
        
        confidence = avg_score * result_penalty
        
        return round(confidence, 3)
    
    async def get_document(
        self,
        document: PolicyDocument
    ) -> List[Dict[str, Any]]:
        """
        Get all sections from a specific document.
        
        Args:
            document: The policy document
            
        Returns:
            List of sections
        """
        # Simulate retrieval time
        await asyncio.sleep(random() * 0.2)
        
        return self._policies.get(document, [])
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get RAG service statistics.
        
        Returns:
            Dictionary with statistics
        """
        avg_query_time = 0
        if self.query_count > 0:
            avg_query_time = self.total_query_time_ms / self.query_count
        
        return {
            "total_queries": self.query_count,
            "avg_query_time_ms": round(avg_query_time, 2),
            "total_documents": len(self._policies),
            "total_sections": sum(len(sections) for sections in self._policies.values())
        }


# Global RAG service instance
_rag_service: Optional[MockRAGService] = None


def get_rag_service() -> MockRAGService:
    """
    Get the global RAG service instance.
    
    Returns:
        The RAG service
    """
    global _rag_service
    if _rag_service is None:
        _rag_service = MockRAGService()
    return _rag_service

# Made with Bob
