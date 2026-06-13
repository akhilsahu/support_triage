"""
Re-ingestion Utility — Rebuild ChromaDB from Postgres documents table.

Usage examples:

  # Re-ingest ALL documents for all orgs
  python scripts/reingest_docs.py

  # Re-ingest a specific document by its Postgres UUID
  python scripts/reingest_docs.py --doc-id <uuid>

  # Re-ingest all docs for a specific org
  python scripts/reingest_docs.py --org-id <uuid>

  # Re-ingest raw text directly (no DB lookup)
  python scripts/reingest_docs.py --raw-text "Some content here" --client-id <org_id> --filename manual.txt

  # Re-ingest from a local file
  python scripts/reingest_docs.py --file /path/to/doc.pdf --client-id <org_id>

  # Reset a collection before re-ingesting
  python scripts/reingest_docs.py --reset-collection client_documents

  # Dry run (show what would be ingested, no writes)
  python scripts/reingest_docs.py --dry-run

  # Filter by doc_type
  python scripts/reingest_docs.py --doc-type policy

  # Limit batch size
  python scripts/reingest_docs.py --batch-size 50
"""

import argparse
import asyncio
import os
import sys
import uuid
from pathlib import Path

# ── Make sure project root is on the path ─────────────────────────────────────
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import structlog
from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

logger = structlog.get_logger()


# ── Helpers ───────────────────────────────────────────────────────────────────

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50):
    """Simple sliding-window chunker."""
    words = text.split()
    chunks = []
    i = 0
    idx = 0
    while i < len(words):
        chunk_words = words[i : i + chunk_size]
        chunks.append({
            "text": " ".join(chunk_words),
            "chunk_index": idx,
            "page": 1,
            "section": "",
        })
        i += chunk_size - overlap
        idx += 1
    return chunks


def extract_file_text(file_path: str) -> str:
    """Extract raw text from a local file (pdf, txt, docx)."""
    path = Path(file_path)
    ext = path.suffix.lower()

    if ext == ".txt" or ext == ".md":
        return path.read_text(encoding="utf-8", errors="ignore")

    if ext == ".pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(path))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except ImportError:
            raise RuntimeError("pypdf not installed. Run: pip install pypdf")

    if ext in (".docx",):
        try:
            import docx
            doc = docx.Document(str(path))
            return "\n".join(p.text for p in doc.paragraphs)
        except ImportError:
            raise RuntimeError("python-docx not installed. Run: pip install python-docx")

    raise ValueError(f"Unsupported file type: {ext}")


# ── Core re-ingestion logic ───────────────────────────────────────────────────

async def reingest_from_db(
    doc_id: str = None,
    org_id: str = None,
    doc_type: str = None,
    batch_size: int = 100,
    dry_run: bool = False,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
):
    """Re-ingest documents from Postgres → ChromaDB."""
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import select
    from app.models.document import Document
    from app.rag.vector_store import get_vector_store, COLLECTION_CLIENT

    DATABASE_URL = os.environ["DATABASE_URL"]
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    store = get_vector_store()

    async with async_session() as session:
        query = select(Document)
        if doc_id:
            query = query.where(Document.id == uuid.UUID(doc_id))
        if org_id:
            query = query.where(Document.org_id == uuid.UUID(org_id))

        result = await session.execute(query)
        docs = result.scalars().all()

    if doc_type:
        docs = [d for d in docs if d.doc_metadata.get("doc_type") == doc_type]

    logger.info("Documents found", count=len(docs))

    if dry_run:
        for d in docs:
            print(f"[DRY RUN] Would re-ingest doc_id={d.id} org={d.org_id} source={d.source} len={len(d.content)}")
        return

    # Re-ingest in batches
    total_chunks = 0
    for i in range(0, len(docs), batch_size):
        batch = docs[i : i + batch_size]
        ids, texts, metas = [], [], []
        for d in batch:
            chunks = chunk_text(d.content, chunk_size=chunk_size, overlap=chunk_overlap)
            for c in chunks:
                chunk_id = f"{d.org_id}:{d.id}:{c['chunk_index']}"
                ids.append(chunk_id)
                texts.append(c["text"])
                metas.append({
                    "client_id":   str(d.org_id) if d.org_id else "",
                    "doc_id":      str(d.id),
                    "filename":    d.source,
                    "extension":   Path(d.source).suffix.lower() if d.source else "",
                    "doc_type":    d.doc_metadata.get("doc_type", "general") if d.doc_metadata else "general",
                    "chunk_index": c["chunk_index"],
                    "page":        c["page"],
                    "section":     c["section"],
                    "strategy":    "reingest",
                    "org_id":      str(d.org_id) if d.org_id else "",
                    "session_id":  "",
                    "uploaded_at": d.created_at.isoformat() if d.created_at else "",
                    "expires_at":  "",
                })

        store.upsert(COLLECTION_CLIENT, ids, texts, metas)
        total_chunks += len(ids)
        logger.info("Batch upserted", batch=i // batch_size + 1, chunks=len(ids))

    logger.info("Re-ingestion complete", total_docs=len(docs), total_chunks=total_chunks)
    await engine.dispose()


def reingest_raw(
    text: str,
    client_id: str,
    filename: str = "raw_input.txt",
    doc_type: str = "general",
    doc_id: str = None,
    session_id: str = "",
    org_id: str = "",
    description: str = "",
    chunk_size: int = 500,
    chunk_overlap: int = 50,
    dry_run: bool = False,
):
    """Re-ingest raw text or a local file directly into ChromaDB."""
    from app.rag.vector_store import get_vector_store, COLLECTION_CLIENT

    store = get_vector_store()
    doc_id = doc_id or str(uuid.uuid4())
    ext = Path(filename).suffix.lower()
    chunks = chunk_text(text, chunk_size=chunk_size, overlap=chunk_overlap)

    if dry_run:
        print(f"[DRY RUN] Would ingest {len(chunks)} chunks from '{filename}' for client={client_id}")
        return

    ids, texts, metas = [], [], []
    for c in chunks:
        ids.append(f"{client_id}:{doc_id}:{c['chunk_index']}")
        texts.append(c["text"])
        metas.append({
            "client_id":   client_id,
            "doc_id":      doc_id,
            "filename":    filename,
            "extension":   ext,
            "doc_type":    doc_type,
            "chunk_index": c["chunk_index"],
            "page":        c["page"],
            "section":     c["section"],
            "strategy":    "reingest_raw",
            "org_id":      org_id,
            "session_id":  session_id,
            "description": description,
            "uploaded_at": "",
            "expires_at":  "",
        })

    store.upsert(COLLECTION_CLIENT, ids, texts, metas)
    logger.info("Raw text ingested", doc_id=doc_id, chunks=len(chunks), filename=filename)
    print(f"✓ Ingested {len(chunks)} chunks. doc_id={doc_id}")


# ── CLI ───────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Re-ingest documents into ChromaDB from Postgres or raw input.")

    # Source selection
    src = p.add_mutually_exclusive_group()
    src.add_argument("--doc-id",    help="Re-ingest a specific document by Postgres UUID")
    src.add_argument("--org-id",    help="Re-ingest all documents for a specific org UUID")
    src.add_argument("--raw-text",  help="Ingest raw text directly (no DB)")
    src.add_argument("--file",      help="Ingest from a local file (pdf/txt/docx)")

    # Filters (for DB mode)
    p.add_argument("--doc-type",    help="Filter by doc_type (e.g. policy, faq, general)")

    # Required for raw/file mode
    p.add_argument("--client-id",   help="Client/org ID (required for --raw-text and --file)")
    p.add_argument("--filename",    default="raw_input.txt", help="Filename label for raw text")
    p.add_argument("--session-id",  default="", help="Session ID")
    p.add_argument("--description", default="", help="Description metadata")

    # Collection management
    p.add_argument("--reset-collection", help="Delete and recreate a collection before ingesting (e.g. client_documents)")

    # Chunking
    p.add_argument("--chunk-size",    type=int, default=500,  help="Words per chunk (default: 500)")
    p.add_argument("--chunk-overlap", type=int, default=50,   help="Overlap words between chunks (default: 50)")
    p.add_argument("--batch-size",    type=int, default=100,  help="DB batch size (default: 100)")

    # Misc
    p.add_argument("--dry-run", action="store_true", help="Show what would be ingested without writing")

    return p.parse_args()


async def main():
    args = parse_args()

    # Optional: reset collection first
    if args.reset_collection:
        from app.rag.vector_store import get_vector_store
        store = get_vector_store()
        store.reset_collection(args.reset_collection)
        print(f"✓ Collection '{args.reset_collection}' reset.")

    if args.raw_text or args.file:
        if not args.client_id:
            print("ERROR: --client-id is required for --raw-text and --file modes.")
            sys.exit(1)

        text = args.raw_text
        filename = args.filename

        if args.file:
            print(f"Extracting text from {args.file}...")
            text = extract_file_text(args.file)
            filename = Path(args.file).name

        reingest_raw(
            text=text,
            client_id=args.client_id,
            filename=filename,
            doc_type=args.doc_type or "general",
            session_id=args.session_id,
            description=args.description,
            chunk_size=args.chunk_size,
            chunk_overlap=args.chunk_overlap,
            dry_run=args.dry_run,
        )

    else:
        # DB mode
        await reingest_from_db(
            doc_id=args.doc_id,
            org_id=args.org_id,
            doc_type=args.doc_type,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
            chunk_size=args.chunk_size,
            chunk_overlap=args.chunk_overlap,
        )


if __name__ == "__main__":
    asyncio.run(main())
