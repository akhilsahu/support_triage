from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.training_feedback import TrainingFeedback
import structlog

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/training", tags=["Training"])

class TrainingFeedbackRequest(BaseModel):
    original_subjects: list[str] = Field(..., description="The exact list of subjects given to the model")
    corrected_hierarchy: dict[str, Any] = Field(..., description="The human-corrected JSON output")

@router.post("/feedback", status_code=status.HTTP_201_CREATED)
async def submit_training_feedback(
    request: TrainingFeedbackRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Submit human corrections for model extraction.
    This saves the original inputs and the human-corrected output to the database
    so it can be used for continuous learning (retraining).
    """
    try:
        feedback = TrainingFeedback(
            original_subjects=request.original_subjects,
            corrected_hierarchy=request.corrected_hierarchy,
            status="pending"
        )
        db.add(feedback)
        await db.commit()
        await db.refresh(feedback)
        
        logger.info("training_feedback.submitted", feedback_id=str(feedback.id))
        return {"status": "success", "id": str(feedback.id)}
    except Exception as e:
        await db.rollback()
        logger.error("training_feedback.error", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to save training feedback")
