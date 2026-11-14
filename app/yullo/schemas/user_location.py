from datetime import datetime

from pydantic import Field, model_validator

from app.yullo.schemas.nearby import NearbyArea


class LocationObservation(NearbyArea):
    accuracy_m: float | None = Field(None, ge=0, le=40075000, allow_inf_nan=False)
    captured_at: datetime | None = None

    @model_validator(mode="after")
    def validate_observation(self):
        if self.latitude is not None:
            if self.accuracy_m is None or self.captured_at is None or self.captured_at.tzinfo is None:
                raise ValueError("Coordinates require accuracy and a timezone-aware capture time")
        elif self.accuracy_m is not None or self.captured_at is not None:
            raise ValueError("Accuracy and capture time require coordinates")
        return self
