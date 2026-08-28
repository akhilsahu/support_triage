import json
import logging
from typing import List
from openai import AsyncOpenAI
from app.orchestra.ai.facts.schemas import ExtractedFact

logger = logging.getLogger(__name__)

_AUDITOR_SYSTEM_PROMPT = """
You are a ruthless Data Auditor. Your job is to review a raw list of extracted facts and apply cleanups, deduplications, and user instructions.

To handle large tables efficiently, you MUST NOT return the full table. Instead, you will return a JSON patch containing:
1. `delete_indices`: A list of integer indices for facts that should be completely removed (e.g., duplicates, hypotheticals).
2. `update_facts`: A list of objects for facts that need to be modified. Each object must have an "index" and a "fact" object containing the new keys.
3. `explanation`: A brief summary explaining exactly which indices (S.No.) were deleted/modified and the reasoning behind it, formatted as a helpful chat message to the user.

Return JSON strictly in this format: 
{
  "delete_indices": [1, 5, 12],
  "update_facts": [
    {
      "index": 2,
      "fact": {"subject": "New Subject", "label": "New Label", "value": "New Value", "note": "New Note"}
    }
  ],
  "explanation": "I deleted duplicates found in rows 1, 5, and 12, and updated row 2 to standardize the label."
}

CRITICAL AUDITING RULES:
1. SAFE DEDUPLICATION ONLY (EXACT MATCHES REQUIRED): You must compare the ENTIRE row contents. ONLY delete a fact if EVERY single field (Subject, Category, Label, Value, Note) matches another row exactly. If there is even a single word difference in the Subject (e.g., 'SBI Card ELITE' vs 'SBI Card ELITE Advantage'), they are DIFFERENT facts and you must SKIP them and keep both. Annual Fees and Renewal Fees are DIFFERENT and must NOT be deduplicated.
2. DELETE HYPOTHETICALS: Put indices of any hypothetical examples or sample calculations in `delete_indices`.
3. NEVER NORMALIZE NAMES: Do not change or normalize the names of subjects (e.g., if a card is 'AURUM', do not change it).
4. Keep labels in Title Case.
5. No monetary values should be placed in 'note' fields; they belong in 'value'.
6. DO NOT hallucinate or add any new facts. 
7. If a fact is perfect as-is, do NOT include it in `update_facts`.
"""

class FactAuditor:
    def __init__(self, client: AsyncOpenAI, model: str = "gpt-4o"):
        self.client = client
        self.model = model

    async def verify(self, facts: List[ExtractedFact], feedback: str = None) -> tuple[List[ExtractedFact], str]:
        if not facts:
            return [], "No facts to verify."

        # Convert facts to a readable list for the prompt WITH INDICES
        indexed_facts = [
            {"index": i, **f.model_dump(exclude_none=True)} 
            for i, f in enumerate(facts)
        ]
        facts_text = json.dumps(indexed_facts, indent=2)
        
        system_prompt = _AUDITOR_SYSTEM_PROMPT
        if feedback:
            system_prompt += f"\n\nIMPORTANT USER INSTRUCTION:\n{feedback}\nPlease strictly apply this instruction when reviewing the facts."

        logger.info(f"Auditing {len(facts)} facts with model {self.model}, feedback: {bool(feedback)}")

        try:
            res = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Here are the raw extracted facts with their indices. Review and return the JSON patch:\n\n{facts_text}"},
                ],
                temperature=0.0,
                response_format={"type": "json_object"},
            )
            content = res.choices[0].message.content or ""
        except Exception as e:
            logger.exception("Auditing pass failed.")
            raise e

        # Parse output
        text = content.strip()
        if text.startswith("```"):
            text = text.split("```")[1].lstrip("json").strip()
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end == -1:
            logger.warning("Auditor returned invalid JSON.")
            return facts, "Verification failed due to malformed response from AI."

        try:
            data = json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            logger.warning("Auditor returned malformed JSON. Output token limit might have been reached.")
            return facts, "Verification failed because the table is too large for a single pass."

        delete_indices = data.get("delete_indices", [])
        update_facts = data.get("update_facts", [])
        explanation = data.get("explanation", "Verification complete. Table has been updated.")
        
        # Apply patch
        out = []
        for i, f in enumerate(facts):
            if i in delete_indices:
                continue
                
            updated = False
            for u in update_facts:
                if u.get("index") == i and "fact" in u and isinstance(u["fact"], dict):
                    new_f = u["fact"]
                    out.append(ExtractedFact(
                        subject=str(new_f.get("subject", f.subject)).strip(),
                        label=str(new_f.get("label", f.label)).strip(),
                        value=str(new_f.get("value", f.value)).strip(),
                        note=str(new_f.get("note", f.note) or "").strip() or None,
                        category=str(new_f.get("category", f.category)),
                        confidence=str(new_f.get("confidence", f.confidence)),
                    ))
                    updated = True
                    break
            
            if not updated:
                out.append(f)

        logger.info(f"Auditing complete. Deleted {len(delete_indices)} facts, updated {len(update_facts)} facts. New total: {len(out)} facts.")
        return out, explanation
