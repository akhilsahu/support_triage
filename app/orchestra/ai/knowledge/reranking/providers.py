import structlog
from typing import Any, List

from app.orchestra.ai.knowledge.reranking.base import RerankerConfig
from app.orchestra.ai.knowledge.reranking.registry import register

logger = structlog.get_logger()


@register("cohere")
def _build_cohere(cfg: RerankerConfig) -> Any:
    """Cohere hosted reranker. Needs `cohere` + COHERE_API_KEY."""
    if not (cfg.api_key and cfg.api_key.strip()):
        raise ValueError("COHERE_API_KEY not set — reranking disabled until a key is provided")

    from agno.knowledge.reranker.cohere import CohereReranker

    class SafeCohereReranker(CohereReranker):
        def rerank(self, query: str, documents: List[Any]) -> List[Any]:
            try:
                return self._rerank(query=query, documents=documents)
            except Exception as e:
                logger.warning(f"Cohere reranking failed ({e}). Skipping Cohere reranking and using vector search documents directly.")
                top_n = getattr(self, "top_n", None)
                return documents[:top_n] if top_n else documents

    kwargs = {"api_key": cfg.api_key.strip(), "top_n": cfg.top_n}
    if cfg.model:
        kwargs["model"] = cfg.model
    return SafeCohereReranker(**kwargs)


@register("sentence_transformer")
def _build_sentence_transformer(cfg: RerankerConfig) -> Any:
    """Local CrossEncoder reranker — no API key. Needs `sentence-transformers`."""
    from agno.knowledge.reranker.sentence_transformer import SentenceTransformerReranker
    kwargs = {"top_n": cfg.top_n}
    if cfg.model:
        kwargs["model"] = cfg.model
    return SentenceTransformerReranker(**kwargs)


