# Yullo Document Storage Audit

## Tracing Provenance
In Support247/Aura, document ingestion currently traces data through these layers:
1. **Database:** `knowledge_base_items` holds the authoritative metadata for an ingested document, including the `kb_id`, `topic`, `doc_label`, and the `doc_id` generated at ingestion time.
2. **Vector Store:** ChromaDB stores the actual text chunks in the `client_documents` collection. Each chunk's metadata includes a `doc_id` which maps exactly to `knowledge_base_items.doc_id`.
3. **Ingestion Job:** The `tasks.py` script parses uploaded files, chunks them, pushes them to ChromaDB, and finally creates the `KnowledgeBaseItem` row mapping `kb_id -> doc_id`.

## The `documents` Table
- The `documents` PostgreSQL table was created in `alembic/versions/0001_initial.py`.
- **Status:** Legacy/Dead. There is no ORM model in `app/models/` mapping to this table, and the ingestion pipeline directly uses `KnowledgeBaseItem` and ChromaDB.

## YulloSources Design
- **Objective:** We need a way for Yullo (during onboarding) to track uploaded sources (`yullo_sources`) and link them to the vector store WITHOUT exposing them directly via a generic `Space` object (to maintain strict product isolation).
- **Implementation:** `YulloSource` will link directly to `KnowledgeBaseItem.id`. We will bypass the legacy `documents` table completely.
- `YulloSource` schema will include: `id`, `space_id` (FK to spaces), `kb_item_id` (FK to knowledge_base_items), `type`, `status`, `created_at`.
