┌─────────────────────────────────────────────────────────────────┐
│  INGEST (write path)                                            │
└─────────────────────────────────────────────────────────────────┘

PDF / DOCX / TXT / HTML
  POST /api/v1/documents/rag/upload
    └── app/api/v1/documents.py :: rag_upload()
          ├── app/rag/document_parser.py :: parse()       — extract text + pages
          ├── app/rag/chunking.py        :: chunk()       — split into chunks
          └── app/rag/vector_store.py    :: upsert_client_chunks() → ChromaDB

Raw text / markdown
  POST /api/v1/documents/rag/ingest-text
    └── app/api/v1/documents.py :: rag_ingest_text()
          ├── app/rag/chunking.py        :: chunk()
          └── app/rag/vector_store.py    :: upsert_client_chunks() → ChromaDB

URL scrape
  POST /api/v1/documents/rag/ingest-url
    └── app/api/v1/documents.py :: rag_ingest_url()
          ├── httpx  → fetch page → BeautifulSoup strip HTML
          ├── app/rag/chunking.py        :: chunk()
          └── app/rag/vector_store.py    :: upsert_client_chunks() → ChromaDB

KB text/qna item
  POST /api/v1/space/knowledge-bases/{kb_id}/items
    └── app/api/v1/knowledge_base.py :: add_item()
          ├── Postgres → KnowledgeBaseItem row
          └── _index_kb_item()
                └── app/rag/vector_store.py :: upsert_client_chunks() → ChromaDB
                      └── writes indexed_doc_id back to Postgres


┌─────────────────────────────────────────────────────────────────┐
│  RETRIEVAL (read path)                                          │
└─────────────────────────────────────────────────────────────────┘

Customer chat
  └── DynamicAgentExecutor._fetch_rag_context()
        ├── by doc_type  → vector_store.query(where={doc_type})
        └── by kb_ids    → _resolve_kb_doc_ids() → Postgres
                              → vector_store.query(where={doc_id})

Agno orchestrator
  └── VectorStoreRAG.fetch()  or  AgnoRAG.fetch()
        ├── by doc_type  → same ChromaDB query
        └── by kb_ids    → _resolve_kb_doc_ids() → same ChromaDB query

Doc-level chat
  POST /api/v1/documents/rag/chat
    └── vector_store.query_client(doc_id=X)
