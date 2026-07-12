# Ingestion & Chunking Implementation Plan

> **Status:** Planning — do not implement until items are picked from here.
> Each section is an independent implementable unit.

---

## 1. Parser ↔ Chunking Strategy Matrix

| Format | Parser | Chunking Strategy | Rationale |
|---|---|---|---|
| `.pdf` (text) | `PdfParser` (PyMuPDF) | `BY_STRUCTURE` | PyMuPDF already splits by heading into `ParsedPage`. Structure is known. |
| `.pdf` (scanned) | `PdfParser` → vision per page | `PER_PAGE_ATOMIC` | Vision output is one blob per page. No structure to detect. Each page = one chunk. |
| `.pdf` (mixed) | `PdfParser` | `BY_STRUCTURE` + `PER_PAGE_ATOMIC` per scanned page | Text pages → BY_STRUCTURE. Vision pages → atomic. Unified in chunker. |
| `.pdf` (image fallback) | `ImageParser` | `PER_PAGE_ATOMIC` | Every page rendered → vision. Each page = one atomic chunk. No splitting. |
| `.docx` | `DocxParser` | `BY_STRUCTURE` | Headings and tables already separated into `ParsedPage`. |
| `.doc` | `DocxParser` → LibreOffice | `BY_STRUCTURE` | Same as DOCX after conversion. |
| `.xlsx` | `XlsxParser` | `SPREADSHEET` | Each sheet = section. Rows must never be split mid-row. Header in every chunk. |
| `.xls` | `XlsxParser` → xlrd | `SPREADSHEET` | Same as XLSX after conversion. |
| `.pptx` | `PptxParser` | `BY_STRUCTURE` | Each slide = `ParsedPage` with title as section. |
| `.ppt` | `PptxParser` → LibreOffice | `BY_STRUCTURE` | Same as PPTX after conversion. |
| `.html` | `HtmlParser` | `BY_STRUCTURE` | h1/h2/h3 already splits into sections. Tables extracted separately. |
| `.htm` | `HtmlParser` | `BY_STRUCTURE` | Same as HTML. |
| `.md` | `TextParser` | `BY_STRUCTURE` | Markdown headings (`#`, `##`) detected as section splits. |
| `.rst` | `TextParser` | `BY_STRUCTURE` | RST headings detected as section splits. |
| `.txt` | `TextParser` | `RECURSIVE` | No structure. Character-based splitting with overlap. |
| `.png/.jpg/.jpeg/.webp` | `ImageParser` | `PER_PAGE_ATOMIC` | One image = one vision call = one atomic chunk. |
| `.json` | `JsonCsvParser` | `RECURSIVE` | Unstructured blob. Character splitting with JSON-aware separators. |
| `.jsonl` | `JsonCsvParser` | `LINE_ATOMIC` | Each line is one JSON object. Each line = one chunk. Never split mid-line. |
| `.csv` | `JsonCsvParser` | `SPREADSHEET` | Header row must appear in every chunk. Row-boundary aware. |

---

## 2. Chunking Strategies (what each means)

### `BY_STRUCTURE` (exists — needs PDF fix)
- Groups `ParsedPage`s by `section`
- If group fits in `chunk_size` → one chunk with section label prepended
- If group overflows → recursive split, but **never split a table page**
- Section label prepended to every chunk for retrieval context

### `PER_PAGE_ATOMIC` (new)
- Each `ParsedPage` becomes exactly one chunk regardless of size
- Used for: scanned PDF pages (vision output), image files
- No splitting, no merging, no overlap
- Rationale: vision output per page is already the smallest meaningful unit

### `SPREADSHEET` (new)
- Split only on **row boundaries** (`\n`)
- First row (header) is **repeated at the top of every chunk**
- No mid-row splits ever
- Overlap = 0 (rows are self-contained)
- Used for: `.xlsx`, `.xls`, `.csv`

### `LINE_ATOMIC` (new)
- Each line = one chunk
- Used for: `.jsonl` where each line is a complete JSON object
- No splitting, no merging

### `RECURSIVE` (exists)
- Current character-based splitting
- Used for: `.txt`, `.json`
- Keep as-is

---

## 3. Cross-Page Table Problem

**Problem:** A table starts at the bottom of page 4 and ends at the top of page 5.
PyMuPDF produces two separate `ParsedPage` objects — one for each half.
The chunker sees two small sections and may put them in separate chunks, breaking the table.

### Proposed Solution: Table Continuation Detection in `PdfParser`

Add a post-processing pass in `PdfParser._parse_pymupdf()` after all pages are built:

```
After page loop:
  Walk pages in order.
  If page[i] is a table page AND page[i+1] is also a table page
  AND they share the same section label:
    → Merge page[i+1] rows into page[i]
    → Remove page[i+1]
```

**Detection heuristic for "is this a continuation table page":**
- Page text starts with a pipe-delimited row (no header prefix)
- Previous page ended with a pipe-delimited row
- Same section label (or section label is empty, inheriting from previous)

**Implementation location:** `PdfParser._merge_continuation_tables(pages)` called before returning `ParsedDocument`.

---

## 4. Atomic Table Chunk Protection

**Problem:** A table `ParsedPage` is large (e.g. 50 rows). `BY_STRUCTURE` chunker splits it at 1000 chars, breaking mid-row. Downstream agent sees half a table.

### Proposed Solution A: `ParsedPage.is_table` flag (preferred)

Add `is_table: bool = False` to `ParsedPage` dataclass.

`PdfParser` sets `is_table=True` when emitting a table block.
`DocxParser`, `XlsxParser`, `HtmlParser` do the same for their table pages.

Chunker checks: if `page.is_table → emit as single chunk, skip size check`.

If table is too large for the vector store limit (rare):
- Split only on `\n` (row boundaries)
- Repeat the header row at top of each split chunk

### Proposed Solution B: Pattern detection in chunker (no schema change)

Detect table pages by text pattern in chunker:
```python
def _is_table_text(text: str) -> bool:
    lines = text.strip().splitlines()
    pipe_lines = sum(1 for l in lines if " | " in l)
    return pipe_lines >= max(2, len(lines) * 0.5)
```

No schema change needed. Fragile if vision output uses different formatting.

**Recommendation: Solution A** — explicit flag is reliable, self-documenting, works across all parsers.

---

## 5. Required Schema Change

Add `is_table` to `ParsedPage` in `app/rag/document_parser.py`:

```python
@dataclass
class ParsedPage:
    page:     int
    text:     str
    section:  str  = ""
    is_table: bool = False   # NEW — prevents chunker from splitting this page
```

Backward compatible — defaults to `False`.

---

## 6. Chunking Config Changes

Change `.pdf` entry in `EXTENSION_CONFIG` from `RECURSIVE` to `BY_STRUCTURE`:

```python
# Current (wrong for structured PDFs)
".pdf": ChunkConfig(strategy=ChunkStrategy.RECURSIVE, chunk_size=1000, overlap=150)

# Proposed
".pdf": ChunkConfig(strategy=ChunkStrategy.BY_STRUCTURE, chunk_size=1200, overlap=100, min_chunk_size=80)
```

Add new strategies to `ChunkStrategy` enum:
```python
class ChunkStrategy(str, Enum):
    RECURSIVE       = "recursive"
    BY_STRUCTURE    = "by_structure"
    PER_PAGE_ATOMIC = "per_page_atomic"   # new
    SPREADSHEET     = "spreadsheet"        # new
    LINE_ATOMIC     = "line_atomic"        # new
```

Add new extension configs:
```python
".xlsx": ChunkConfig(strategy=ChunkStrategy.SPREADSHEET,     chunk_size=800,  overlap=0)
".xls":  ChunkConfig(strategy=ChunkStrategy.SPREADSHEET,     chunk_size=800,  overlap=0)
".csv":  ChunkConfig(strategy=ChunkStrategy.SPREADSHEET,     chunk_size=600,  overlap=0)
".jsonl":ChunkConfig(strategy=ChunkStrategy.LINE_ATOMIC,     chunk_size=0,    overlap=0)
".png":  ChunkConfig(strategy=ChunkStrategy.PER_PAGE_ATOMIC, chunk_size=0,    overlap=0)
".jpg":  ChunkConfig(strategy=ChunkStrategy.PER_PAGE_ATOMIC, chunk_size=0,    overlap=0)
".jpeg": ChunkConfig(strategy=ChunkStrategy.PER_PAGE_ATOMIC, chunk_size=0,    overlap=0)
".webp": ChunkConfig(strategy=ChunkStrategy.PER_PAGE_ATOMIC, chunk_size=0,    overlap=0)
```

---

## 7. Implementation Order (pick from here)

| # | Item | Files touched | Risk | Depends on |
|---|---|---|---|---|
| 1 | Add `is_table` flag to `ParsedPage` | `document_parser.py` | Low | — |
| 2 | Set `is_table=True` in `PdfParser` table blocks | `pdf_parser.py` | Low | #1 |
| 3 | Set `is_table=True` in `DocxParser`, `XlsxParser`, `HtmlParser` | parser files | Low | #1 |
| 4 | Switch PDF chunking to `BY_STRUCTURE` | `chunking.py` | Medium | — |
| 5 | Add `PER_PAGE_ATOMIC` strategy to chunker | `chunking.py` | Low | — |
| 6 | Add `SPREADSHEET` strategy to chunker (header repeat) | `chunking.py` | Medium | — |
| 7 | Add `LINE_ATOMIC` strategy to chunker | `chunking.py` | Low | — |
| 8 | Protect `is_table` pages in `BY_STRUCTURE` chunker | `chunking.py` | Low | #1, #4 |
| 9 | Cross-page table merge in `PdfParser` | `pdf_parser.py` | Medium | #1 |
| 10 | Update extension configs for new strategies | `chunking.py` | Low | #5, #6, #7 |
| 11 | Run demo script against real HDFC PDF to validate | `demo.py` | — | all above |

---

## 8. Full Strategy Landscape (evaluated — not all used)

| Strategy | Viable? | Reason |
|---|---|---|
| RECURSIVE | Yes — keep | Plain text, JSON fallback |
| BY_STRUCTURE | Yes — expand | PDF, DOCX, HTML, MD, PPTX |
| PER_PAGE_ATOMIC | Yes — add | Vision pages, images |
| SPREADSHEET | Yes — add | XLSX, CSV — header repeat + row-safe |
| LINE_ATOMIC | Yes — add | JSONL |
| Sliding Window | No | No benefit over RECURSIVE, breaks tables |
| Sentence Splitting | Nice-to-have | Replace RECURSIVE for .txt, needs spaCy |
| Semantic Chunking | No | Embedding call per sentence at ingestion, adds cost/latency |
| Parent-Child | Yes — add (Phase 2) | High value for table retrieval accuracy |
| Proposition Chunking | No | LLM per chunk, 10–50× cost |
| Late Chunking (ColBERT) | No | Incompatible with Chroma/pgvector hybrid setup |
| Token-Based | No | Marginal benefit over char-based |
| Context-Enriched | Yes — add everywhere | Prepend filename+section before embedding, zero cost |

---

## 9. Two Additional Strategies to Add

### Strategy: `CONTEXT_ENRICHED` (apply on top of any strategy, zero cost)
Prepend `[filename] > [section]:` to every chunk text before it is embedded.

```
Before: "The SA factor for Option B is 1.23..."
After:  "hdfc-life-supreme.pdf > Option B SA Factor Table:\nThe SA factor..."
```

Benefit: when multiple similar PDFs are in the same knowledge base, retrieval can
disambiguate which product the chunk belongs to. Already partially done via section
label — this adds the document name too.

Implementation: single line in chunker before `Chunk()` construction. No schema change.

---

### Strategy: `PARENT_CHILD` (Phase 2 — high value for tables)

Store two representations of the same content:

- **Child chunk** (small, ~200–400 chars) → stored in vector DB for precise retrieval
- **Parent chunk** (full section or full table) → stored separately, linked via `parent_id`

At query time:
1. Vector search returns the matching child chunk (precise hit)
2. Retriever fetches the parent chunk by `parent_id`
3. LLM receives the full parent (complete table, complete section)

This directly solves the Option B/C problem — even if a row is retrieved, the LLM
gets the full table as context.

Needs:
- `parent_id: Optional[str]` on `Chunk` dataclass
- Second pass in chunker that creates parent chunks from full sections
- Vector store stores both; retrieval fetches parent after matching child
- Medium complexity — plan as Phase 2 after core strategies land

---

## 10. Open Questions (resolved)

1. **num_documents**: Default is 5. Raise to 8–10 for knowledge bases containing
   tables. Tables may span 2–3 chunks even after merging — need enough slots.
   → Set `num_documents=8` in Agno knowledge base config.

2. **Chunk size for vision pages**: Cap at 2000 chars, no splitting.
   Vision output per page is one atomic unit. If GPT returns more than 2000 chars,
   truncate at sentence boundary. Store as `PER_PAGE_ATOMIC`.

3. **Header repeat in SPREADSHEET**: Default `header_rows=1`. XlsxParser should
   detect merged-cell headers and set `header_rows=2` when present.
   Store in `ParsedPage.metadata["header_rows"]`.

4. **Cross-page table merge scope**: Merge only adjacent pages with same section
   label. Do not merge across heading changes — different headings = different tables.

---

## 11. Chunking Module Location — Finalized Decisions

### Decision: Move to `app/orchestra/ai/chunking/` (new directory)

Rationale: chunking is part of the ingestion pipeline, not part of the vector store
layer (`app/rag/`). Co-locating it with parsers makes the pipeline self-contained.

### What happens to `app/rag/chunking.py`
**Delete it.** Do not leave a shim. Shims are backwards-compatibility hacks and
CLAUDE.md says to avoid them. The 4 callers are all internal — update their imports.

### What happens to `app/rag/__init__.py`
**Remove chunking exports.** Currently re-exports `ChunkConfig`, `ChunkStrategy`,
`EXTENSION_CONFIG`, `get_config`, `chunk` from `app.rag`. No caller in the codebase
uses `from app.rag import chunk` — all callers import directly from `app.rag.chunking`.
So removing it from `__init__.py` has zero blast radius.

### Callers to update (4 files, import path only)

| File | Old import | New import |
|---|---|---|
| `app/api/v1/documents.py:27` | `from app.rag.chunking import chunk, get_config` | `from app.orchestra.ai.chunking import chunk, get_config` |
| `app/api/v1/admin.py:31-32` | `from app.rag.chunking import get_config, chunk` | `from app.orchestra.ai.chunking import chunk, get_config` |
| `app/rag/document_parser.py:550` | `from app.rag.chunking import chunk as _chunk` | `from app.orchestra.ai.chunking import chunk as _chunk` |
| `app/rag/__init__.py:5` | `from app.rag.chunking import ...` | remove line entirely |

### New directory structure (split — per user decision)

```
app/orchestra/ai/chunking/
    __init__.py                 # exports: chunk, get_config, ChunkStrategy, ChunkConfig
    config.py                   # ChunkStrategy enum, ChunkConfig dataclass, EXTENSION_CONFIG, get_config()
    strategies/
        __init__.py             # empty
        recursive.py            # _chunk_recursive() — flat text, JSON
        by_structure.py         # _chunk_by_structure() — section-aware, honors is_table
        per_page_atomic.py      # _chunk_per_page_atomic() — 1 page = 1 chunk
        spreadsheet.py          # _chunk_spreadsheet() — header repeat, row-boundary splits
        line_atomic.py          # _chunk_line_atomic() — 1 line = 1 chunk (JSONL)
        context_enriched.py     # _apply_context_enriched() — prepend filename+section
    chunker.py                  # chunk() public entry point, routes to strategy files
```

### Import contract (what `__init__.py` exposes)

```python
# app/orchestra/ai/chunking/__init__.py
from app.orchestra.ai.chunking.chunker import chunk
from app.orchestra.ai.chunking.config import ChunkStrategy, ChunkConfig, get_config, EXTENSION_CONFIG
__all__ = ["chunk", "get_config", "ChunkStrategy", "ChunkConfig", "EXTENSION_CONFIG"]
```

---

## 12. Agno Chunking Analysis — Use or Build Custom?

### What Agno provides (in `agno.knowledge.chunking`)

Agno ships 8 chunking strategies:

| Agno Strategy | What it does | Our equivalent |
|---|---|---|
| `FixedSizeChunking` | Fixed char splits with overlap | — (not needed) |
| `RecursiveChunking` | Splits on `\n` then `.` | `RECURSIVE` (partial match) |
| `DocumentChunking` | Splits on `\n\n` paragraphs, then sentences | `RECURSIVE` (partial match) |
| `MarkdownChunking` | Heading-aware MD splits via `unstructured` lib | `BY_STRUCTURE` (partial match) |
| `RowChunking` | 1 row = 1 chunk, `skip_header` option | `LINE_ATOMIC` (partial match) |
| `SemanticChunking` | Embedding-based semantic splits | eliminated (too expensive) |
| `AgenticChunking` | LLM rewrites into atomic facts | eliminated (too expensive) |
| `CodeChunking` | Code-aware splits | not needed |

### Why Agno chunkers cannot be used directly

**Architecture mismatch.** Agno chunkers take `agno.knowledge.document.base.Document`
objects (flat `content: str` + `meta_data: dict`). Our pipeline operates on
`ParsedDocument` (list of `ParsedPage` with `section`, `is_table` fields).

To use Agno, we would need to:
1. Flatten `ParsedDocument` → single Agno `Document` (losing page numbers + sections)
2. Run Agno chunker
3. Convert back to our `Chunk` objects — page numbers and sections are now gone

The structural information (`ParsedPage.section`, `ParsedPage.is_table`) is the
entire basis of `BY_STRUCTURE` chunking. Agno has no equivalent concept.

### Strategy-by-strategy verdict

| Our Strategy | Agno equivalent | Verdict |
|---|---|---|
| `RECURSIVE` | `RecursiveChunking` | **Write own** — Agno only splits on `\n`+`.`, ours uses full separator ladder (`\n\n`, `\n`, `. `, `;`, etc.) |
| `BY_STRUCTURE` | `MarkdownChunking` (partial) | **Write own** — our strategy groups `ParsedPage.section` labels across pages; Agno has no ParsedPage concept. Also requires heavy `unstructured` dep |
| `PER_PAGE_ATOMIC` | None | **Write own** — not in Agno |
| `SPREADSHEET` | `RowChunking` (partial) | **Write own** — Agno's `RowChunking.skip_header=True` drops the header entirely; we need header repeated at top of every chunk |
| `LINE_ATOMIC` | `RowChunking` (close) | **Write own** — Agno's RowChunking works but requires bridging `ParsedDocument` → `Document` → `Chunk` for 3 lines of actual logic |
| `CONTEXT_ENRICHED` | None | **Write own** — not in Agno |

### External library verdict

| Library | Purpose | Use? | Reason |
|---|---|---|---|
| `unstructured` | Markdown/HTML chunking | No | 300MB+ dep, requires system libs; overkill for what is ~20 lines custom |
| `langchain-text-splitters` | RecursiveCharacterTextSplitter | No | Adds LangChain dep for something we already have custom |
| `semantic-text-splitter` | Rust-based semantic split | No | We eliminated semantic strategy |
| `spaCy` | Sentence splitting for .txt | Maybe (Phase 2) | Only if adding SENTENCE strategy — not in Phase 1 |
| stdlib only | All Phase 1 strategies | **Yes** | BY_STRUCTURE/RECURSIVE/SPREADSHEET/LINE_ATOMIC/PER_PAGE_ATOMIC all require zero external deps |

### Final decision: write all Phase 1 chunking from scratch

Zero new dependencies. All 5 strategies + CONTEXT_ENRICHED fit in ~250 lines total
across 6 small files. Full control over the section/table-aware logic that drives
RAG accuracy. No bridging between Agno's `Document` and our `Chunk`.
