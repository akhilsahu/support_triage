"""Semantic retrieval with bounded full-query term support, without SDK patches."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import re
from threading import local

from agno.vectordb.chroma import ChromaDb
import structlog

from app.orchestra.ai.config import get_retrieval_config

logger = structlog.get_logger()
_WORDS = re.compile(r"\w+(?:[-./]\w+)*", re.UNICODE)
_STOP_WORDS = frozenset(
    "a an the is are was were be been do does did can could would should "
    "i me my we our you your it its this that these those what which who "
    "where when why how please tell about of for to in on at and or with".split()
)
_QUERY_CONTEXT = local()


class HybridChromaDb(ChromaDb):
    """Keep Agno's search/reranking API; replace its first-word hybrid branch."""

    def last_query_embedding(self, query):
        # Read by the caller on the same search worker; never share query state across requests.
        if getattr(_QUERY_CONTEXT, 'owner', None) == id(self) and getattr(_QUERY_CONTEXT, 'query', None) == query:
            return getattr(_QUERY_CONTEXT, 'embedding', None)
        return None

    def search(self, query, limit=5, filters=None):
        _QUERY_CONTEXT.query = None
        _QUERY_CONTEXT.embedding = None
        # Agno silently drops unsupported list filters. Never broaden scope.
        if filters is not None and not isinstance(filters, dict):
            raise ValueError("Chroma retrieval requires dictionary scope filters")
        if isinstance(limit, bool) or not isinstance(limit, int) or limit < 1:
            raise ValueError("Retrieval limit must be a positive integer")
        if not isinstance(query, str) or not query.strip():
            return []
        return super().search(query, limit, filters)

    def _hybrid_search(self, query, limit=5, filters=None):
        cfg = get_retrieval_config()
        fetch_k = min(limit * 3, cfg['max_candidates'])
        # Semantic search always embeds the entire question, including words
        # omitted from the supplementary lexical branch. One provider call.
        embedding = self.embedder.get_embedding(query)
        if embedding is None or len(embedding) == 0:
            raise RuntimeError("Configured query embedding is unavailable")
        _QUERY_CONTEXT.owner = id(self)
        _QUERY_CONTEXT.query = query
        _QUERY_CONTEXT.embedding = embedding
        if self._collection is None:
            self._collection = self.client.get_collection(name=self.collection_name)
        where = self._convert_filters(filters) if filters else None

        terms = {}
        for word in _WORDS.findall(query):
            key = word.casefold()
            if key not in _STOP_WORDS:
                terms.setdefault(key, word)
            if len(terms) >= cfg['max_terms']:
                break

        def retrieve(document_filter=None):
            args = dict(
                query_embeddings=[embedding], n_results=fetch_k, where=where,
                include=['documents', 'metadatas', 'distances'],
            )
            if document_filter is not None:
                args['where_document'] = document_filter
            return self._build_search_results(self._collection.query(**args))

        # Chroma contains is case-sensitive. Common variants improve exact-name
        # recall; semantic retrieval remains independent of every term filter.
        variants = list(dict.fromkeys(
            variant for word in terms.values()
            for variant in (word, word.lower(), word.upper(), word.title())
        ))
        clauses = [{'$contains': word} for word in variants]
        if not clauses:
            return retrieve()[:limit]
        document_filter = clauses[0] if len(clauses) == 1 else {'$or': clauses}
        with ThreadPoolExecutor(max_workers=2) as executor:
            dense_future = executor.submit(retrieve)
            lexical_future = executor.submit(retrieve, document_filter)
            # Dense failures propagate; a failed lexical supplement can still
            # return genuine semantic evidence without widening authorization.
            dense = dense_future.result()
            try:
                lexical = lexical_future.result()
            except Exception as error:
                logger.warning('knowledge.hybrid.lexical_failed', error_type=type(error).__name__)
                lexical = []

        def overlap(doc):
            words = {word.casefold() for word in _WORDS.findall(doc.content or '')}
            return len(terms.keys() & words)

        # Candidates in both branches were selected by vector similarity.
        # Stable sort keeps semantic order when lexical coverage is tied.
        lexical = sorted((doc for doc in lexical if overlap(doc)), key=overlap, reverse=True)
        documents, scores = {}, {}
        for ranking in (dense, lexical):
            seen = set()
            for rank, doc in enumerate(ranking, 1):
                if not doc.id or doc.id in seen:
                    continue
                seen.add(doc.id)
                documents.setdefault(doc.id, doc)
                scores[doc.id] = scores.get(doc.id, 0.0) + 1.0 / (self.hybrid_rrf_k + rank)
        ordered = sorted(scores, key=scores.get, reverse=True)[:limit]
        for doc_id in ordered:
            doc = documents[doc_id]
            doc.meta_data = {**(doc.meta_data or {}), 'rrf_score': scores[doc_id]}
        return [documents[doc_id] for doc_id in ordered]

    def _keyword_search(self, query, limit=5, filters=None):
        # Do not reintroduce the SDK first-word implementation for callers that
        # switch search_type; semantic matching remains available in that mode.
        return self._hybrid_search(query, limit, filters)
