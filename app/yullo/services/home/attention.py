import uuid
from typing import List
from app.yullo.services.home.repository import HomeSnapshot
from app.schemas.yullo_home import YulloHomeAttention, YulloHomeAttentionAction

def build_attention(snapshot: HomeSnapshot) -> List[YulloHomeAttention]:
    """
    Builds attention items directly from the factual snapshot.
    """
    items = []
    
    for space in snapshot.spaces:
        source_metrics = snapshot.source_metrics.get(space.id)
        if source_metrics and source_metrics.failed_items > 0:
            items.append(
                YulloHomeAttention(
                    id=f"attn-src-{space.id.hex}",
                    spaceId=space.id,
                    spaceName=space.name,
                    kind="source_failed",
                    title=f"{source_metrics.failed_items} sources failed ingestion",
                    detail="Aura cannot answer questions using these sources until they are fixed.",
                    action=YulloHomeAttentionAction(
                        kind="retry_source",
                        label="Review sources",
                        targetId=None
                    ),
                    occurredAt=snapshot.snapshot_time
                )
            )
            
        review_count = snapshot.fact_review_counts.get(space.id, 0)
        if review_count > 0:
            items.append(
                YulloHomeAttention(
                    id=f"attn-facts-{space.id.hex}",
                    spaceId=space.id,
                    spaceName=space.name,
                    kind="knowledge_conflict",
                    title=f"{review_count} extracted facts need review",
                    detail="Aura has extracted new facts but needs your approval before using them.",
                    action=YulloHomeAttentionAction(
                        kind="review_knowledge",
                        label="Review facts",
                        targetId=None
                    ),
                    occurredAt=snapshot.snapshot_time
                )
            )

    return items
