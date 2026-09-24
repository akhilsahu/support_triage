# Status Precedence Rules (from Section 4.3 of implementation plan)
# Lower index = higher precedence
STATUS_PRECEDENCE = [
    "unavailable",
    "needs_review",
    "updating",
    "learning",
    "draft",
    "live",
]

def derive_status(facts: dict) -> str:
    """
    Evaluates Yullo Space/Aura facts to determine the highest precedence status.
    facts: dictionary of boolean conditions.
    """
    if facts.get("is_unavailable"):
        return "unavailable"
    if facts.get("has_conflicts") or facts.get("sources_failed"):
        return "needs_review"
    if facts.get("is_learning") or facts.get("is_updating"):
        # The design document specifically says 'updating' and 'learning' are statuses.
        # Often these are mutually exclusive or 'updating' indicates background jobs.
        if facts.get("is_learning"):
            return "learning"
        return "updating"
    if facts.get("is_draft") or not facts.get("is_published"):
        return "draft"
        
    return "live"

# Suggestion Precedence Rules
SUGGESTION_PRECEDENCE = [
    "continue_setup",
    "add_sources",
    "review_knowledge",
    "add_service",
    "add_booking_action",
    "add_location",
    "customize_appearance"
]
