import uuid
from typing import Optional
from app.schemas.yullo_home import YulloHomeSuggestion

def evaluate_suggestion(
    space_id: uuid.UUID,
    space_name: str,
    onboarding_completed: bool,
    source_count: int
) -> Optional[YulloHomeSuggestion]:
    """
    Evaluates business rules to surface exactly one top suggestion.
    """
    if not onboarding_completed:
        return YulloHomeSuggestion(
            id=f"sug-setup-{space_id}",
            spaceId=space_id,
            spaceName=space_name,
            kind="continue_setup",
            reason="Your space needs a few more details before it can go live.",
            actionLabel="Continue Setup"
        )
        
    if source_count == 0:
        return YulloHomeSuggestion(
            id=f"sug-source-{space_id}",
            spaceId=space_id,
            spaceName=space_name,
            kind="add_sources",
            reason="Aura doesn't have any knowledge yet. Add some sources so she can answer questions.",
            actionLabel="Add Sources"
        )
        
    # Default to no suggestion
    return None
