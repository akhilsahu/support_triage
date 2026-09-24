from typing import List
from app.yullo.services.home.repository import HomeSnapshot
from app.schemas.yullo_home import YulloHomeActivity

def build_recent(snapshot: HomeSnapshot) -> List[YulloHomeActivity]:
    """
    Builds the cross-space activity stream from snapshot events.
    """
    activities = []
    
    space_name_map = {s.id: s.name for s in snapshot.spaces}
    
    for event in snapshot.recent_events:
        space_name = space_name_map.get(event.space_id, "Unknown Space")
        
        # Determine kind and label from event_type
        # e.g. aura.published -> aura_published
        #      source.updated -> source_updated
        #      intent.classified -> conversation_started (approx)
        
        kind = "space_explored"
        label = "Activity occurred"
        
        if event.event_type == "intent.classified":
            kind = "conversation_started"
            intent_name = event.metadata.get("intent", "Unknown intent")
            label = f"Conversation about {intent_name}"
        elif event.event_type == "space.published":
            kind = "aura_published"
            label = "Aura was published"
        elif event.event_type in ["knowledge.added", "knowledge.updated"]:
            kind = "source_updated"
            label = "Knowledge base updated"
            
        activities.append(
            YulloHomeActivity(
                id=event.id,
                spaceId=event.space_id,
                spaceName=space_name,
                kind=kind,
                label=label,
                occurredAt=event.occurred_at,
                isNew=(snapshot.snapshot_time - event.occurred_at).total_seconds() < 86400 # New if within 24h
            )
        )
        
    return activities
