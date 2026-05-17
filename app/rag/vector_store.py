"""
Vector Store — ChromaDB backend for the RAG system.

─────────────────────────────────────────────────────────────
COLLECTION ARCHITECTURE
─────────────────────────────────────────────────────────────

Three persistent collections live in .chroma_db/:

  policy_documents   — global, shared across all clients.
                       Seeded once at startup (refund, credit,
                       compensation, ToS policies).
                       Filter key: doc_type, section

  product_catalog    — global, shared across all clients.
                       Seeded from MOCK_PRODUCTS.
                       Filter key: category, product_id

  client_documents   — ALL client uploads in ONE collection.
                       Isolated at query time by client_id + doc_id.
                       Filter keys: client_id, session_id, doc_id

Why one collection for all clients?
  - ChromaDB performs best with few large collections vs. many small ones.
  - HNSW index scales logarithmically; one index is faster than N indexes.
  - Metadata `where` filters are O(n_results), not O(total_docs).
  - Avoids the "collection explosion" problem when thousands of clients
    each upload multiple documents.

─────────────────────────────────────────────────────────────
METADATA SCHEMA
─────────────────────────────────────────────────────────────

policy_documents chunks:
  {
    "doc_type":    "refund_policy" | "credit_policy" | ...,
    "section":     "1.0",
    "title":       "General Refund Policy",
    "doc":         "refund_policy",   # legacy alias
  }

product_catalog chunks:
  {
    "product_id":  "PROD-001",
    "name":        "Sony WH-1000XM5",
    "category":    "Audio",
    "price":       "349.99",
    "stock":       "12",
    "rating":      "4.8",
  }

client_documents chunks:
  {
    "client_id":    "client_abc",          # tenant / customer ID
    "session_id":   "sess_xyz",            # browser/API session
    "doc_id":       "a1b2c3d4",            # upload identifier
    "filename":     "report.pdf",
    "extension":    ".pdf",
    "chunk_index":  0,                     # int stored as str for Chroma compat
    "page":         1,
    "section":      "Introduction",
    "strategy":     "by_structure",        # chunking strategy used
    "uploaded_at":  "2026-05-10T12:00:00", # ISO timestamp
    "expires_at":   "2026-05-17T12:00:00", # optional TTL (ISO)
  }

ChromaDB only supports str/int/float/bool metadata values.
IDs are globally unique strings.
─────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import structlog

logger = structlog.get_logger()

# ── Storage path ──────────────────────────────────────────────────────────────

_DEFAULT_PERSIST_DIR = str(Path(__file__).resolve().parents[2] / ".chroma_db")
CHROMA_PERSIST_DIR = os.environ.get("CHROMA_PERSIST_DIR", _DEFAULT_PERSIST_DIR)

# ── Collection names ──────────────────────────────────────────────────────────

COLLECTION_POLICY   = "policy_documents"   # global shared
COLLECTION_PRODUCTS = "product_catalog"    # global shared
COLLECTION_CLIENT   = "client_documents"   # all clients, filtered by client_id
COLLECTION_CUSTOM   = COLLECTION_CLIENT    # backwards-compat alias

# ── Default TTL for client uploads ───────────────────────────────────────────

DEFAULT_TTL_DAYS = int(os.environ.get("RAG_DOC_TTL_DAYS", "30"))


# ── Metadata helpers ──────────────────────────────────────────────────────────

VALID_DOC_TYPES = {
    "tech_support",   # troubleshooting guides, FAQs, manuals
    "policy",         # internal policies
    "faq",            # general FAQs
    "manual",         # product/user manuals
    "contract",       # agreements, T&Cs
    "catalog",        # product catalogs
    "general",        # catch-all
}


def build_client_metadata(
    client_id: str,
    session_id: str,
    doc_id: str,
    filename: str,
    extension: str,
    chunk_index: int,
    page: int,
    section: str = "",
    strategy: str = "recursive",
    doc_type: str = "general",
    ttl_days: Optional[int] = DEFAULT_TTL_DAYS,
    kb_name: str = "",
    org_id: str = "",
    org_name: str = "",
    description: str = "",
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Build a validated metadata dict for a client_documents chunk.

    All values are coerced to ChromaDB-safe types (str/int/float/bool).
    """
    if doc_type not in VALID_DOC_TYPES:
        doc_type = "general"

    now = datetime.utcnow()
    meta: Dict[str, Any] = {
        # Identity
        "client_id":   str(client_id),
        "session_id":  str(session_id),
        "doc_id":      str(doc_id),
        # File
        "filename":    str(filename),
        "extension":   str(extension).lower(),
        "doc_type":    str(doc_type),
        # Position
        "chunk_index": int(chunk_index),
        "page":        int(page),
        "section":     str(section),
        # Processing
        "strategy":    str(strategy),
        # Org / KB metadata
        "org_id":      str(org_id),
        "org_name":    str(org_name),
        "kb_name":     str(kb_name),
        "doc_name":    str(filename),   # explicit alias for lookups
        "description": str(description),
        # Timestamps
        "uploaded_at": now.isoformat(),
        "expires_at":  (now + timedelta(days=ttl_days)).isoformat() if ttl_days else "",
    }
    if extra:
        # Only allow safe types
        for k, v in extra.items():
            if isinstance(v, (str, int, float, bool)):
                meta[k] = v
    return meta


def client_where(
    client_id: str,
    doc_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build a ChromaDB `where` filter for client_documents queries.

    Examples:
        # All docs for a client:
        client_where("client_abc")

        # Specific doc:
        client_where("client_abc", doc_id="a1b2c3d4")

        # All docs in a session:
        client_where("client_abc", session_id="sess_xyz")
    """
    conditions: List[Dict[str, Any]] = [{"client_id": {"$eq": client_id}}]
    if doc_id:
        conditions.append({"doc_id": {"$eq": doc_id}})
    if session_id:
        conditions.append({"session_id": {"$eq": session_id}})

    if len(conditions) == 1:
        return conditions[0]
    return {"$and": conditions}


def client_doc_type_where(client_id: str, doc_type: str, doc_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Filter client_documents by client_id AND doc_type.
    Optionally narrow to a specific doc_id.
    """
    conditions: List[Dict[str, Any]] = [
        {"client_id": {"$eq": client_id}},
        {"doc_type":  {"$eq": doc_type}},
    ]
    if doc_id:
        conditions.append({"doc_id": {"$eq": doc_id}})
    return {"$and": conditions}


def policy_where(doc_type: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Filter policy_documents by doc_type (e.g. 'refund_policy')."""
    if doc_type:
        return {"doc_type": {"$eq": doc_type}}
    return None


def product_where(category: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Filter product_catalog by category."""
    if category:
        return {"category": {"$eq": category}}
    return None


# ── VectorStore ───────────────────────────────────────────────────────────────

class VectorStore:
    """
    ChromaDB-backed vector store with multi-client support.

    Features:
    - Persistent storage (survives restarts)
    - Three named collections (policy, products, client_documents)
    - Cosine similarity search with metadata filtering
    - Typed metadata builders for consistent schemas
    - Batch upsert with deduplication (ChromaDB upsert is idempotent)
    - Client isolation via where-filter, not separate collections
    """

    def __init__(self, persist_dir: str = CHROMA_PERSIST_DIR):
        self.persist_dir = persist_dir
        self._client = None
        self._collections: Dict[str, Any] = {}

    # ── Init ──────────────────────────────────────────────────────────────────

    def _get_client(self):
        if self._client is not None:
            return self._client
        try:
            import chromadb
            self._client = chromadb.PersistentClient(path=self.persist_dir)
            logger.info("ChromaDB client ready", path=self.persist_dir)
        except ImportError:
            raise RuntimeError("chromadb not installed. Run: pip install chromadb")
        return self._client

    def _get_chroma_ef(self):
        try:
            from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
            return SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")
        except Exception as e:
            logger.warning("SentenceTransformer EF unavailable, using default", error=str(e))
            return None

    def _collection(self, name: str):
        if name not in self._collections:
            client = self._get_client()
            ef = self._get_chroma_ef()
            kwargs: Dict[str, Any] = {"name": name, "metadata": {"hnsw:space": "cosine"}}
            if ef:
                kwargs["embedding_function"] = ef
            self._collections[name] = client.get_or_create_collection(**kwargs)
        return self._collections[name]

    # ── Upsert ────────────────────────────────────────────────────────────────

    def upsert(
        self,
        collection: str,
        ids: List[str],
        documents: List[str],
        metadatas: Optional[List[Dict[str, Any]]] = None,
    ) -> int:
        """
        Upsert documents into a collection. Idempotent — safe to call
        multiple times with the same IDs (updates in place).
        """
        if not documents:
            return 0
        col = self._collection(collection)
        col.upsert(
            ids=ids,
            documents=documents,
            metadatas=metadatas or [{} for _ in documents],
        )
        logger.info("Upserted", collection=collection, count=len(documents))
        return len(documents)

    def upsert_client_chunks(
        self,
        client_id: str,
        session_id: str,
        doc_id: str,
        filename: str,
        extension: str,
        strategy: str,
        chunks: List[Dict[str, Any]],  # [{text, page, chunk_index, section}]
        doc_type: str = "general",
        ttl_days: Optional[int] = DEFAULT_TTL_DAYS,
        kb_name: str = "",
        org_id: str = "",
        org_name: str = "",
        description: str = "",
    ) -> int:
        """
        High-level upsert for client document chunks.
        Builds IDs and metadata automatically.

        Args:
            chunks: list of dicts with keys: text, page, chunk_index, section
        """
        ids, texts, metas = [], [], []
        for c in chunks:
            ids.append(f"{client_id}:{doc_id}:{c['chunk_index']}")
            texts.append(c["text"])
            metas.append(build_client_metadata(
                client_id=client_id,
                session_id=session_id,
                doc_id=doc_id,
                filename=filename,
                extension=extension,
                chunk_index=c["chunk_index"],
                page=c.get("page", 1),
                section=c.get("section", ""),
                strategy=strategy,
                doc_type=doc_type,
                ttl_days=ttl_days,
                kb_name=kb_name,
                org_id=org_id,
                org_name=org_name,
                description=description,
            ))
        return self.upsert(COLLECTION_CLIENT, ids, texts, metas)

    # ── Query ─────────────────────────────────────────────────────────────────

    def query(
        self,
        collection: str,
        query_text: str,
        top_k: int = 5,
        where: Optional[Dict[str, Any]] = None,
        min_score: float = 0.0,
    ) -> List[Dict[str, Any]]:
        """
        Semantic search. Returns [{id, document, metadata, score}] sorted by score desc.
        score is cosine similarity 0–1 (higher = more similar).
        """
        col = self._collection(collection)
        n = col.count()
        if n == 0:
            return []

        kwargs: Dict[str, Any] = {
            "query_texts": [query_text],
            "n_results": min(top_k, n),
            "include": ["documents", "metadatas", "distances"],
        }
        if where:
            kwargs["where"] = where

        results = col.query(**kwargs)

        hits = []
        for doc_id, doc, meta, dist in zip(
            results["ids"][0],
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            score = max(0.0, 1.0 - dist / 2.0)  # cosine distance → similarity
            if score >= min_score:
                hits.append({"id": doc_id, "document": doc, "metadata": meta, "score": round(score, 4)})

        hits.sort(key=lambda x: x["score"], reverse=True)
        return hits

    def query_client(
        self,
        client_id: str,
        query_text: str,
        doc_id: Optional[str] = None,
        session_id: Optional[str] = None,
        top_k: int = 5,
        min_score: float = 0.1,
    ) -> List[Dict[str, Any]]:
        """
        Semantic search scoped to a specific client (and optionally a doc/session).
        Convenience wrapper around query() + client_where().
        """
        return self.query(
            COLLECTION_CLIENT,
            query_text,
            top_k=top_k,
            where=client_where(client_id, doc_id=doc_id, session_id=session_id),
            min_score=min_score,
        )

    # ── Metadata fetch ────────────────────────────────────────────────────────

    def get_client_docs(self, client_id: str) -> List[Dict[str, Any]]:
        """
        Return deduplicated doc-level metadata for all documents a client has uploaded.
        (Scans chunk metadata and deduplicates by doc_id.)
        """
        col = self._collection(COLLECTION_CLIENT)
        total = col.count()
        logger.info("get_client_docs", client_id=client_id, total_chunks=total)
        if total == 0:
            return []
        results = col.get(where={"client_id": {"$eq": client_id}}, include=["metadatas"])
        logger.info("get_client_docs filter result", client_id=client_id, matched=len(results.get("metadatas", [])))
        seen: Dict[str, Dict] = {}
        for meta in results.get("metadatas", []):
            did = meta.get("doc_id", "")
            if did and did not in seen:
                seen[did] = {
                    "doc_id":      did,
                    "client_id":   meta.get("client_id"),
                    "org_id":      meta.get("org_id", ""),
                    "org_name":    meta.get("org_name", ""),
                    "kb_name":     meta.get("kb_name", ""),
                    "description": meta.get("description", ""),
                    "filename":    meta.get("filename"),
                    "doc_name":    meta.get("doc_name", meta.get("filename", "")),
                    "extension":   meta.get("extension"),
                    "doc_type":    meta.get("doc_type", "general"),
                    "strategy":    meta.get("strategy"),
                    "uploaded_at": meta.get("uploaded_at"),
                    "expires_at":  meta.get("expires_at"),
                }
        return list(seen.values())

    def update_org_name(self, client_id: str, new_org_name: str) -> int:
        """
        Update org_name in all chunk metadata for a given org (client_id = org UUID).
        Called whenever the org's display_name changes so metadata stays in sync.
        """
        col = self._collection(COLLECTION_CLIENT)
        results = col.get(
            where={"client_id": {"$eq": client_id}},
            include=["metadatas"],
        )
        ids = results.get("ids", [])
        metas = results.get("metadatas", [])
        if not ids:
            return 0
        # Patch org_name in every metadata dict and update in bulk
        updated_metas = [{**m, "org_name": new_org_name} for m in metas]
        col.update(ids=ids, metadatas=updated_metas)
        logger.info("org_name updated in chunks", client_id=client_id, chunks=len(ids), new_org_name=new_org_name)
        return len(ids)

    def get_doc_chunks(self, client_id: str, doc_id: str) -> List[Dict[str, Any]]:
        """Return all chunks for a specific document, ordered by chunk_index."""
        col = self._collection(COLLECTION_CLIENT)
        where = client_where(client_id, doc_id=doc_id)
        results = col.get(where=where, include=["documents", "metadatas"])
        chunks = []
        for text, meta in zip(
            results.get("documents", []),
            results.get("metadatas", []),
        ):
            chunks.append({
                "chunk_index": meta.get("chunk_index", 0),
                "page":        meta.get("page", 1),
                "section":     meta.get("section", ""),
                "text":        text,
            })
        chunks.sort(key=lambda c: (c["page"], c["chunk_index"]))
        return chunks

    def get_org_doc_types(self, client_id: str) -> List[str]:
        """Return distinct doc_types used across all docs uploaded by this org."""
        col = self._collection(COLLECTION_CLIENT)
        if col.count() == 0:
            return []
        results = col.get(where={"client_id": {"$eq": client_id}}, include=["metadatas"])
        seen: set = set()
        for meta in results.get("metadatas", []):
            dt = meta.get("doc_type", "general")
            if dt:
                seen.add(dt)
        return sorted(seen)

    def delete_client_doc(self, client_id: str, doc_id: str) -> int:
        """Delete all chunks for a specific client document."""
        col = self._collection(COLLECTION_CLIENT)
        where = client_where(client_id, doc_id=doc_id)
        # Get IDs first (ChromaDB delete requires explicit IDs)
        results = col.get(where=where, include=[])
        ids = results.get("ids", [])
        if ids:
            col.delete(ids=ids)
        logger.info("Client doc deleted", client_id=client_id, doc_id=doc_id, chunks=len(ids))
        return len(ids)

    def purge_expired(self) -> int:
        """Delete all chunks whose expires_at is in the past."""
        col = self._collection(COLLECTION_CLIENT)
        now_iso = datetime.utcnow().isoformat()
        try:
            results = col.get(
                where={"expires_at": {"$lt": now_iso}},
                include=[],
            )
            ids = results.get("ids", [])
            if ids:
                col.delete(ids=ids)
                logger.info("Purged expired chunks", count=len(ids))
            return len(ids)
        except Exception as e:
            logger.warning("Purge failed", error=str(e))
            return 0

    # ── Generic helpers ───────────────────────────────────────────────────────

    def count(self, collection: str) -> int:
        return self._collection(collection).count()

    def delete(self, collection: str, ids: List[str]):
        self._collection(collection).delete(ids=ids)

    def list_collections(self) -> List[str]:
        return [c.name for c in self._get_client().list_collections()]

    def reset_collection(self, collection: str):
        client = self._get_client()
        try:
            client.delete_collection(collection)
        except Exception:
            pass
        self._collections.pop(collection, None)
        logger.info("Collection reset", collection=collection)

    def stats(self) -> Dict[str, Any]:
        """Summary counts across all collections."""
        return {
            "policy_documents": self.count(COLLECTION_POLICY),
            "product_catalog":  self.count(COLLECTION_PRODUCTS),
            "client_documents": self.count(COLLECTION_CLIENT),
            "persist_dir":      self.persist_dir,
        }


# ── Seeders ───────────────────────────────────────────────────────────────────

POLICY_DOCS: List[Dict[str, Any]] = [
    {"id": "refund-1",  "text": "All products can be returned within 30 days of purchase for a full refund. Products must be in original condition with all packaging and accessories.", "meta": {"doc_type": "refund_policy", "doc": "refund_policy", "section": "1.0", "title": "General Refund Policy"}},
    {"id": "refund-2",  "text": "Electronics can be returned within 30 days of purchase. Items must be unopened and in original packaging for full refund. Opened electronics may be subject to a 15% restocking fee.", "meta": {"doc_type": "refund_policy", "doc": "refund_policy", "section": "2.0", "title": "Electronics Refund Policy"}},
    {"id": "refund-3",  "text": "Items damaged during shipping are eligible for full refund or replacement within 30 days of delivery. Customer must provide photos of damage. No restocking fee applies.", "meta": {"doc_type": "refund_policy", "doc": "refund_policy", "section": "3.0", "title": "Damaged Items"}},
    {"id": "refund-4",  "text": "Defective products are eligible for full refund or replacement regardless of purchase date, up to manufacturer warranty period.", "meta": {"doc_type": "refund_policy", "doc": "refund_policy", "section": "4.0", "title": "Defective Products"}},
    {"id": "refund-5",  "text": "Refunds are processed within 3-5 business days after receiving returned item. Refund will be issued to original payment method. Allow 5-10 business days for refund to appear.", "meta": {"doc_type": "refund_policy", "doc": "refund_policy", "section": "5.0", "title": "Refund Processing Time"}},
    {"id": "credit-1",  "text": "Store credit can be issued in lieu of refund at customer's request. Store credit never expires and can be used for any purchase.", "meta": {"doc_type": "credit_policy", "doc": "credit_policy", "section": "1.0", "title": "Store Credit Basics"}},
    {"id": "credit-2",  "text": "Store credit is issued for full purchase price including taxes. Shipping costs not included unless shipping was defective.", "meta": {"doc_type": "credit_policy", "doc": "credit_policy", "section": "2.0", "title": "Credit Amount"}},
    {"id": "credit-3",  "text": "Customers may receive store credit for late deliveries: 5% credit for 1-3 days late, 10% for 4-7 days late, 15% for 8+ days late.", "meta": {"doc_type": "credit_policy", "doc": "credit_policy", "section": "3.0", "title": "Credit for Late Deliveries"}},
    {"id": "credit-4",  "text": "Promotional store credit may be issued for service issues or as goodwill gestures. Amount determined by customer service manager.", "meta": {"doc_type": "credit_policy", "doc": "credit_policy", "section": "4.0", "title": "Promotional Credit"}},
    {"id": "comp-1",    "text": "Compensation should be fair, prompt, and appropriate to the issue experienced.", "meta": {"doc_type": "compensation_guidelines", "doc": "compensation_guidelines", "section": "1.0", "title": "Compensation Philosophy"}},
    {"id": "comp-2",    "text": "Delivery delays: 1-3 days late = 5% credit, 4-7 days late = 10% credit, 8-14 days late = 15% credit, 15+ days late = 20% credit or full refund.", "meta": {"doc_type": "compensation_guidelines", "doc": "compensation_guidelines", "section": "2.0", "title": "Delivery Delays"}},
    {"id": "comp-3",    "text": "Damaged items: Full refund or replacement plus 10% store credit for inconvenience. Expedited shipping on replacement at no charge.", "meta": {"doc_type": "compensation_guidelines", "doc": "compensation_guidelines", "section": "3.0", "title": "Damaged Items Compensation"}},
    {"id": "comp-4",    "text": "Wrong item shipped: Full refund or correct item shipped with expedited shipping. 15% store credit for inconvenience. Return shipping prepaid.", "meta": {"doc_type": "compensation_guidelines", "doc": "compensation_guidelines", "section": "4.0", "title": "Wrong Item Shipped"}},
    {"id": "comp-5",    "text": "Poor service experience: $10-$50 store credit depending on severity. Multiple issues: escalate to manager for additional compensation.", "meta": {"doc_type": "compensation_guidelines", "doc": "compensation_guidelines", "section": "5.0", "title": "Service Issues"}},
    {"id": "comp-6",    "text": "Goodwill gestures for frustrated customers: $25-$100 store credit at agent discretion. Requires manager approval for amounts over $50.", "meta": {"doc_type": "compensation_guidelines", "doc": "compensation_guidelines", "section": "6.0", "title": "Goodwill Gestures"}},
    {"id": "tos-1",     "text": "By making a purchase, customer agrees to all terms and conditions. All sales are final unless covered by refund policy.", "meta": {"doc_type": "terms_of_service", "doc": "terms_of_service", "section": "1.0", "title": "Purchase Agreement"}},
    {"id": "tos-2",     "text": "Estimated delivery dates are not guaranteed. We are not liable for carrier delays beyond our control. Customer may request refund for significant delays.", "meta": {"doc_type": "terms_of_service", "doc": "terms_of_service", "section": "2.0", "title": "Shipping Terms"}},
    {"id": "tos-3",     "text": "Our liability is limited to purchase price of product. We are not liable for consequential damages, lost profits, or indirect damages.", "meta": {"doc_type": "terms_of_service", "doc": "terms_of_service", "section": "3.0", "title": "Limitation of Liability"}},
]


def seed_policy_docs(store: VectorStore, force: bool = False) -> int:
    if not force and store.count(COLLECTION_POLICY) >= len(POLICY_DOCS):
        return 0
    ids   = [d["id"] for d in POLICY_DOCS]
    texts = [d["text"] for d in POLICY_DOCS]
    metas = [d["meta"] for d in POLICY_DOCS]
    count = store.upsert(COLLECTION_POLICY, ids, texts, metas)
    logger.info("Policy docs seeded", count=count)
    return count


def seed_product_catalog(store: VectorStore, force: bool = False) -> int:
    try:
        from app.mock.products import MOCK_PRODUCTS
    except ImportError:
        return 0
    if not force and store.count(COLLECTION_PRODUCTS) >= len(MOCK_PRODUCTS):
        return 0
    ids, texts, metas = [], [], []
    for pid, p in MOCK_PRODUCTS.items():
        ids.append(pid)
        texts.append(f"{p['name']}. {p['description']}. Category: {p['category']}. Tags: {', '.join(p['tags'])}.")
        metas.append({
            "product_id": pid,
            "name":       p["name"],
            "category":   p["category"],
            "price":      str(p["price"]),
            "stock":      str(p["stock"]),
            "rating":     str(p["rating"]),
        })
    count = store.upsert(COLLECTION_PRODUCTS, ids, texts, metas)
    logger.info("Product catalog seeded", count=count)
    return count


# ── Singleton ─────────────────────────────────────────────────────────────────

_store: Optional[VectorStore] = None


def get_vector_store() -> VectorStore:
    global _store
    if _store is None:
        _store = VectorStore()
    return _store
