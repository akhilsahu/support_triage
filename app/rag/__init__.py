"""RAG (Retrieval-Augmented Generation) — ChromaDB-backed vector search."""

from app.rag.vector_store import VectorStore, get_vector_store
from app.rag.embedder import Embedder, get_embedder
from app.rag.chunking import ChunkConfig, ChunkStrategy, EXTENSION_CONFIG, get_config, chunk
from app.rag.document_parser import parse, is_supported, ParsedDocument, Chunk

__all__ = [
    "VectorStore", "get_vector_store",
    "Embedder", "get_embedder",
    "ChunkConfig", "ChunkStrategy", "EXTENSION_CONFIG", "get_config", "chunk",
    "parse", "is_supported", "ParsedDocument", "Chunk",
]
