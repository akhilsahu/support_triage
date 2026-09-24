from app.models.space import Space
from app.yullo.config.home_rules import derive_status

def calculate_space_status(space: Space, has_active_jobs: bool, has_failed_sources: bool, has_conflicts: bool) -> str:
    """
    Calculates the 'auraStatus' for a Yullo Space based on underlying system state.
    
    Space.status is "draft" | "live".
    Space.current_step tracks onboarding progress: "choose" | "claim" | "teach" | "preview".
    A space is considered onboarding-complete when current_step == "preview" or status == "live".
    """
    is_published = (space.status == "live")
    onboarding_done = is_published or (space.current_step == "preview")
    
    facts = {
        "is_unavailable": False,  # True if system suspended or deleted
        "has_conflicts": has_conflicts,
        "sources_failed": has_failed_sources,
        "is_learning": has_active_jobs and not onboarding_done,
        "is_updating": has_active_jobs and onboarding_done,
        "is_draft": not is_published,
        "is_published": is_published,
    }
    
    return derive_status(facts)
