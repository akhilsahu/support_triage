from typing import Optional, Tuple
from datetime import datetime
from app.yullo.services.home.repository import HomeSnapshot
from app.schemas.yullo_home import YulloHomeSuggestion, YulloHomePattern

# We will import the evaluation functions
from . import setup, recurring_need, pattern

def select_home_signals(snapshot: HomeSnapshot, config: dict, now: datetime) -> Tuple[Optional[YulloHomeSuggestion], Optional[YulloHomePattern]]:
    """
    Ingests candidates from signal evaluators and separates them into
    a setup suggestion and a behavioral pattern.
    """
    suggestion_candidates = []
    suggestion_candidates.extend(setup.evaluate(snapshot, config, now))
    suggestion_candidates.extend(recurring_need.evaluate(snapshot, config, now))
    
    pattern_candidates = []
    pattern_candidates.extend(pattern.evaluate(snapshot, config, now))
    
    suggestion = None
    if suggestion_candidates:
        # Sort and pick top
        top_sug = sorted(suggestion_candidates, key=lambda c: c.priority, reverse=True)[0]
        
        action_label = "Review"
        if top_sug.action:
            if top_sug.action.kind == "add_sources":
                action_label = "Add sources"
            elif top_sug.action.kind == "continue_setup":
                action_label = "Review knowledge"
            elif top_sug.action.kind == "add_booking_action":
                action_label = "Add booking"
            elif top_sug.action.kind == "add_service":
                action_label = "Add capability"
                
        suggestion = YulloHomeSuggestion(
            id=top_sug.id,
            spaceId=top_sug.spaceId,
            spaceName=top_sug.spaceName,
            kind=top_sug.kind if top_sug.kind in ["continue_setup", "add_sources", "review_knowledge", "add_service", "add_booking_action", "add_location", "customize_appearance"] else "continue_setup",
            reason=top_sug.title,
            actionLabel=action_label
        )
        
    patt = None
    if pattern_candidates:
        top_pat = sorted(pattern_candidates, key=lambda c: c.priority, reverse=True)[0]
        patt = YulloHomePattern(
            id=top_pat.id,
            spaceId=top_pat.spaceId,
            spaceName=top_pat.spaceName,
            kind="pattern",
            title=top_pat.title,
            actionLabel="View conversations"
        )
        
    return suggestion, patt
