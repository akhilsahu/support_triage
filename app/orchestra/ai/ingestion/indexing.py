"""The ingestion write stage: configured embedding plus vector persistence."""
import functools

import anyio

from app.orchestra.ai.ingestion.preparation import PreparedDocument
from app.orchestra.ai.ingestion.cancellation import settle_write


async def embed_and_store_chunks(prepared: PreparedDocument, *, client_id: str, session_id: str,
                          doc_id: str, filename: str | None = None, store=None, **metadata) -> int:
    """Embed/store typed chunks once; caller retains authorization/transaction ownership."""
    if not client_id or not doc_id or not prepared.chunks:
        raise ValueError("Indexing requires a client, document and nonempty chunks")
    if metadata.get("space_id") and str(metadata["space_id"]) != str(client_id):
        raise ValueError("Indexing Space must match the client scope")
    if store is None:
        from app.orchestra.ai.knowledge.vector_store import get_vector_store
        store = get_vector_store()
    # VectorStore owns the single configured embedding call and passes explicit
    # vectors to Chroma. Do not pre-embed the same prepared chunks here.
    return await settle_write(anyio.to_thread.run_sync(functools.partial(
        store.upsert_client_chunks,
        client_id=client_id, session_id=session_id, doc_id=doc_id,
        filename=filename or prepared.document.filename, extension=prepared.document.extension,
        strategy=prepared.strategy, chunks=prepared.chunks, **metadata,
    )))


async def attach_indexed_source(kb_id: str, doc_id: str, title: str, **metadata) -> None:
    """Public entry to the existing KB-link service; retain its retry/DB contract."""
    from app.orchestra.ai.ingestion.jobs.tasks import _attach_kb_item
    await _attach_kb_item(kb_id, doc_id, title, **metadata)
