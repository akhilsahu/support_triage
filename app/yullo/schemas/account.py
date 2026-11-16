from datetime import datetime
import unicodedata

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AccountProfileUpdate(BaseModel):
    full_name: str = Field(max_length=200, strict=True)
    expected_updated_at: datetime

    model_config = ConfigDict(extra="forbid")

    @field_validator("full_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if any(unicodedata.category(char) == "Cc" for char in value):
            raise ValueError("Name cannot contain control characters")
        return value
