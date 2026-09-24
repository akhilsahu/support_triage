import uuid
from app.services.ai_usage_context import AiUsageContext, set_ai_usage_context, reset_ai_usage_context

def set_aura_inference_context(
    space_id: uuid.UUID,
    session_id: uuid.UUID,
    message_id: uuid.UUID | None,
    aura_id: uuid.UUID,
    aura_version_id: uuid.UUID
) -> object:
    """Set the AI usage context for Aura inference."""
    ctx = AiUsageContext(
        space_id=space_id,
        session_id=session_id,
        message_id=message_id,
        product="yullo",
        runtime_kind="yullo_aura",
        aura_id=aura_id,
        aura_version_id=aura_version_id
    )
    return set_ai_usage_context(ctx)
