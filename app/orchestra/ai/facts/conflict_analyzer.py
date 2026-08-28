from typing import List, Tuple
from .schemas import ExtractedFact, FactConflict

class ConflictAnalyzer:
    @staticmethod
    def analyze(new_facts: List[ExtractedFact], existing_verified: List[ExtractedFact]) -> Tuple[List[ExtractedFact], List[FactConflict]]:
        """
        Compare new facts against existing verified facts.
        Returns:
            - A list of entirely new facts (no conflict).
            - A list of FactConflict objects.
        """
        # Create a lookup for existing verified facts
        # We assume each existing fact has an 'id' attribute or similar in the real DB, 
        # but for the engine we'll just track them by index or a mock ID.
        existing_lookup = {f.unique_key(): f for f in existing_verified}
        
        safe_new_facts = []
        conflicts = []
        
        for new_fact in new_facts:
            key = new_fact.unique_key()
            if key in existing_lookup:
                existing_fact = existing_lookup[key]
                # Compare value
                if new_fact.value.strip().lower() != existing_fact.value.strip().lower():
                    conflicts.append(
                        FactConflict(
                            existing_fact_id="mock_id", # In real integration, map to DB ID
                            proposed_fact=new_fact,
                            existing_value=existing_fact.value,
                            conflict_type="value_mismatch"
                        )
                    )
                # Compare note (optional conflict)
                elif (new_fact.note or "").strip().lower() != (existing_fact.note or "").strip().lower():
                     conflicts.append(
                        FactConflict(
                            existing_fact_id="mock_id",
                            proposed_fact=new_fact,
                            existing_value=existing_fact.value,
                            conflict_type="note_mismatch"
                        )
                    )
                else:
                    # They are identical, safely ignore or drop the new fact
                    continue
            else:
                # No existing fact with this subject+label, it's safe
                safe_new_facts.append(new_fact)
                
        return safe_new_facts, conflicts
