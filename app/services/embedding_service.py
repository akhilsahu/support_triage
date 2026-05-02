"""Embedding service for generating vector embeddings"""

from typing import List, Optional
import numpy as np
from sentence_transformers import SentenceTransformer
import structlog

from app.config import settings
from app.core.redis import redis_client
import hashlib
import json

logger = structlog.get_logger()


class EmbeddingService:
    """
    Service for generating embeddings using sentence-transformers.
    
    Supports caching embeddings in Redis for performance.
    """
    
    def __init__(self):
        self.model: Optional[SentenceTransformer] = None
        self.model_name = settings.EMBEDDING_MODEL
        self.dimension = settings.EMBEDDING_DIMENSION
        self.device = settings.EMBEDDING_DEVICE
        self._initialize_model()
    
    def _initialize_model(self):
        """Initialize the embedding model"""
        try:
            self.model = SentenceTransformer(
                self.model_name,
                device=self.device
            )
            logger.info(
                "Embedding model initialized",
                model=self.model_name,
                dimension=self.dimension,
                device=self.device
            )
        except Exception as e:
            logger.error(f"Failed to initialize embedding model: {e}")
            raise
    
    def _get_cache_key(self, text: str) -> str:
        """Generate cache key for text"""
        text_hash = hashlib.md5(text.encode()).hexdigest()
        return f"embedding:{self.model_name}:{text_hash}"
    
    async def generate_embedding(
        self,
        text: str,
        use_cache: bool = True
    ) -> List[float]:
        """
        Generate embedding for a single text.
        
        Args:
            text: Input text
            use_cache: Whether to use Redis cache
        
        Returns:
            List of floats representing the embedding
        """
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")
        
        # Check cache
        if use_cache:
            cache_key = self._get_cache_key(text)
            cached = await redis_client.get(cache_key)
            if cached:
                logger.debug("Embedding cache hit", text_length=len(text))
                return cached
        
        # Generate embedding
        try:
            embedding = self.model.encode(
                text,
                convert_to_numpy=True,
                show_progress_bar=False
            )
            embedding_list = embedding.tolist()
            
            # Cache the result
            if use_cache:
                cache_key = self._get_cache_key(text)
                await redis_client.set(
                    cache_key,
                    embedding_list,
                    expire=86400  # 24 hours
                )
            
            logger.debug(
                "Embedding generated",
                text_length=len(text),
                dimension=len(embedding_list)
            )
            
            return embedding_list
        
        except Exception as e:
            logger.error(f"Failed to generate embedding: {e}")
            raise
    
    async def generate_embeddings_batch(
        self,
        texts: List[str],
        use_cache: bool = True,
        batch_size: Optional[int] = None
    ) -> List[List[float]]:
        """
        Generate embeddings for multiple texts.
        
        Args:
            texts: List of input texts
            use_cache: Whether to use Redis cache
            batch_size: Batch size for processing
        
        Returns:
            List of embeddings
        """
        if not texts:
            return []
        
        batch_size = batch_size or settings.EMBEDDING_BATCH_SIZE
        
        # Check cache for all texts
        embeddings = []
        texts_to_generate = []
        text_indices = []
        
        if use_cache:
            for i, text in enumerate(texts):
                cache_key = self._get_cache_key(text)
                cached = await redis_client.get(cache_key)
                if cached:
                    embeddings.append((i, cached))
                else:
                    texts_to_generate.append(text)
                    text_indices.append(i)
        else:
            texts_to_generate = texts
            text_indices = list(range(len(texts)))
        
        # Generate embeddings for uncached texts
        if texts_to_generate:
            try:
                generated = self.model.encode(
                    texts_to_generate,
                    batch_size=batch_size,
                    convert_to_numpy=True,
                    show_progress_bar=False
                )
                
                # Cache and collect results
                for i, (text, embedding) in enumerate(zip(texts_to_generate, generated)):
                    embedding_list = embedding.tolist()
                    embeddings.append((text_indices[i], embedding_list))
                    
                    if use_cache:
                        cache_key = self._get_cache_key(text)
                        await redis_client.set(
                            cache_key,
                            embedding_list,
                            expire=86400
                        )
                
                logger.info(
                    "Batch embeddings generated",
                    total=len(texts),
                    cached=len(texts) - len(texts_to_generate),
                    generated=len(texts_to_generate)
                )
            
            except Exception as e:
                logger.error(f"Failed to generate batch embeddings: {e}")
                raise
        
        # Sort by original index and return
        embeddings.sort(key=lambda x: x[0])
        return [emb for _, emb in embeddings]
    
    def cosine_similarity(
        self,
        vec1: List[float],
        vec2: List[float]
    ) -> float:
        """
        Calculate cosine similarity between two vectors.
        
        Args:
            vec1: First vector
            vec2: Second vector
        
        Returns:
            Cosine similarity score (0-1)
        """
        vec1_np = np.array(vec1)
        vec2_np = np.array(vec2)
        
        dot_product = np.dot(vec1_np, vec2_np)
        norm1 = np.linalg.norm(vec1_np)
        norm2 = np.linalg.norm(vec2_np)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return float(dot_product / (norm1 * norm2))
    
    def get_model_info(self) -> dict:
        """Get information about the embedding model"""
        return {
            "model_name": self.model_name,
            "dimension": self.dimension,
            "device": self.device,
            "max_seq_length": self.model.max_seq_length if self.model else None,
        }


# Global embedding service instance
embedding_service = EmbeddingService()

# Made with Bob
