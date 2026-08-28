import json
import logging
from typing import List, Literal, Tuple, Dict, Any, Optional
from openai import AsyncOpenAI
from pydantic import BaseModel
from .schemas import RawChunk, ExtractedFact

logger = logging.getLogger(__name__)

# Configurable constants
_BATCH_CHUNKS = 5
_MAX_CHARS = 15_000

from .prompt import _CORE_SYSTEM_PROMPT, _NICHE_PROMPTS
# Vague answers we want to skip
_NON_ANSWERS = (
    "not specified", "not mentioned", "not stated", "not applicable", "n/a",
    "as applicable", "as determined", "prevailing rate", "at prevailing",
    "varies", "refer to", "see terms", "as per terms", "unknown",
)

def _is_answer(value: str) -> bool:
    v = value.strip().lower()
    if len(v) < 2:
        return False
    return not any(bad in v for bad in _NON_ANSWERS)


class FactEngine:
    def __init__(self, client: AsyncOpenAI, model: str = "gpt-4o-mini"):
        self.client = client
        self.model = model

    def _filter_chunks(self, chunks: List[RawChunk], strategy: str) -> Tuple[List[RawChunk], str]:
        if strategy == "full_document":
            return chunks, "full_document"
            
        # "smart_chunking" strategy: prefer tables
        rows = [c for c in chunks if c.is_table_row]
        if rows:
            return rows, "table_rows"
        return chunks, "prose"

    def _batch_chunks(self, chunks: List[RawChunk]) -> List[List[RawChunk]]:
        out, cur, size = [], [], 0
        for c in chunks:
            if cur and (len(cur) >= _BATCH_CHUNKS or size + len(c.text) > _MAX_CHARS):
                out.append(cur)
                cur, size = [], 0
            cur.append(c)
            size += len(c.text)
        if cur:
            out.append(cur)
        return out

    def _parse_response(self, raw: str) -> List[dict]:
        if not raw:
            return []
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("```")[1].lstrip("json").strip()
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end == -1:
            return []
        try:
            data = json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            return []
        facts = data.get("facts")
        return [f for f in (facts or []) if isinstance(f, dict)]

    async def extract(
        self, 
        chunks: List[RawChunk], 
        strategy: Literal["smart_chunking", "full_document"] = "smart_chunking", 
        feedback: Optional[str] = None, 
        niche: str = "finance",
        progress_callback: Optional[Any] = None
    ) -> List[ExtractedFact]:
        """
        Extract facts using the chosen strategy.
        - smart_chunking: Filters for tables and batches them. Cheaper for long PDFs.
        - full_document: Sends all chunks in large batches (or one giant prompt if context allows).
        """
        if not chunks:
            return []

        selected_chunks, mode = self._filter_chunks(chunks, strategy)
        logger.info(f"Extracting using mode={mode}, chunks={len(selected_chunks)}, feedback={bool(feedback)}")

        out: List[ExtractedFact] = []
        seen: set = set()

        batches = self._batch_chunks(selected_chunks)
        total_batches = len(batches)
        
        for i, batch in enumerate(batches):
            if progress_callback:
                try:
                    import asyncio
                    if asyncio.iscoroutinefunction(progress_callback):
                        await progress_callback(i, total_batches)
                    else:
                        progress_callback(i, total_batches)
                except Exception as e:
                    logger.exception("Progress callback failed")
                    
            body = "\n\n".join(
                f"[{i}] {c.text.strip()}"
                for i, c in enumerate(batch)
            )

            system_prompt = _CORE_SYSTEM_PROMPT
            if niche and niche in _NICHE_PROMPTS:
                system_prompt += f"\n\nNICHE-SPECIFIC RULES ({niche}):\n{_NICHE_PROMPTS[niche]}"
                
            if feedback:
                system_prompt += f"\n\nIMPORTANT USER FEEDBACK/INSTRUCTIONS FOR THIS EXTRACTION:\n{feedback}\n\nPlease strictly follow these instructions while extracting facts."

            try:
                res = await self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"{body}\n\nExtract the facts as JSON."},
                    ],
                    temperature=0.0,
                    response_format={"type": "json_object"},
                )
                content = res.choices[0].message.content or ""
            except Exception as e:
                logger.exception("Batch extraction failed. Raising exception to trigger provider failover.")
                raise e

            # Parse and deduplicate
            parsed = self._parse_response(content)
            for f in parsed:
                # Discard items flagged by the LLM's negative constraints classification
                if f.get("is_illustrative_example") is True:
                    continue
                if f.get("is_orphaned_number") is True:
                    continue
                    
                subject = str(f.get("subject") or "").strip()
                label = str(f.get("label") or "").strip()
                value = str(f.get("value") or "").strip()
                
                if not (subject and label and value) or not _is_answer(value):
                    continue
                    
                fact_obj = ExtractedFact(
                    subject=subject,
                    label=label,
                    value=value,
                    note=str(f.get("note") or "").strip() or None,
                    category=f.get("category", "Other"),
                    confidence=f.get("confidence", "Low"),
                )
                
                key = fact_obj.unique_key()
                if key in seen:
                    continue
                seen.add(key)
                
                # Assign provenance
                # Find which chunk the value belongs to (naive text search)
                src = next((c for c in batch if value in c.text), batch[0])
                fact_obj.source_filename = src.source_filename
                fact_obj.source_page = src.source_page
                
                out.append(fact_obj)

        logger.info(f"Extraction complete. Found {len(out)} facts.")
        return out
