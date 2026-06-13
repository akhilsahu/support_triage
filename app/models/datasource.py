"""
SpaceDataSource — per-org external API connection with LLM-normalized field mapping.
"""

import uuid
import json
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, String, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base

CANONICAL_ORDER_FIELDS = [
    "order_id", "status", "placed_at", "customer_name",
    "item", "total", "tracking", "carrier",
    "delivery_date", "address", "last_location",
]


class SpaceDataSource(Base):
    __tablename__ = "space_data_sources"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id     = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"),
                        nullable=False, index=True)

    name       = Column(String(200), nullable=False)
    agent_type = Column(String(80),  nullable=False)
    api_url    = Column(String(1000), nullable=False)
    method     = Column(String(10),  default="GET")       # GET | POST | PUT | PATCH

    # Auth
    auth_type   = Column(String(20),  default="none")     # none | bearer | api_key | basic
    auth_value  = Column(Text,        default="")         # encrypted at rest
    auth_header = Column(String(100), default="Authorization")

    # Request config — stored as JSON strings
    request_headers_json = Column(Text, default="{}")     # extra headers beyond auth
    request_params_json  = Column(Text, default="{}")     # query parameters
    request_body_json    = Column(Text, default="{}")     # JSON body for POST/PUT

    # Field mapping
    field_mapping_json = Column(Text, default="{}")       # canonical → api field
    sample_response    = Column(Text, default="")

    active     = Column(Boolean,  default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    space = relationship("Space", back_populates="data_sources")

    __table_args__ = (
        Index("ix_space_data_source_space_agent", "space_id", "agent_type"),
    )

    # ── JSON properties ───────────────────────────────────────────────────────

    @property
    def request_headers(self) -> dict:
        try: return json.loads(self.request_headers_json)
        except Exception: return {}

    @request_headers.setter
    def request_headers(self, value: dict):
        self.request_headers_json = json.dumps(value)

    @property
    def request_params(self) -> dict:
        try: return json.loads(self.request_params_json)
        except Exception: return {}

    @request_params.setter
    def request_params(self, value: dict):
        self.request_params_json = json.dumps(value)

    @property
    def request_body(self) -> dict:
        try: return json.loads(self.request_body_json)
        except Exception: return {}

    @request_body.setter
    def request_body(self, value: dict):
        self.request_body_json = json.dumps(value or {})

    @property
    def field_mapping(self) -> dict:
        try: return json.loads(self.field_mapping_json)
        except Exception: return {}

    @field_mapping.setter
    def field_mapping(self, value: dict):
        self.field_mapping_json = json.dumps(value)

    # ── Normalization ─────────────────────────────────────────────────────────

    def normalize(self, raw: dict) -> dict:
        mapping = self.field_mapping
        result = {f: None for f in CANONICAL_ORDER_FIELDS}
        for canonical, api_field in mapping.items():
            if api_field and canonical in result:
                result[canonical] = raw.get(api_field)
        return result

    def to_dict(self) -> dict:
        return {
            "id":             str(self.id),
            "space_id":         str(self.space_id),
            "name":           self.name,
            "agent_type":     self.agent_type,
            "api_url":        self.api_url,
            "method":         self.method,
            "auth_type":      self.auth_type,
            "auth_header":    self.auth_header,
            "field_mapping":  self.field_mapping,
            "request_headers": self.request_headers,
            "request_params":  self.request_params,
            "request_body":    self.request_body,
            "active":          self.active,
            "created_at":     self.created_at.isoformat() if self.created_at else None,
        }
