"""Tenant-scoped persistence for chatbot evaluation suites and results."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.core.database import Base


class EvaluationSuite(Base):
    __tablename__ = "evaluation_suites"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    space_id = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False)
    chatbot_id = Column(UUID(as_uuid=True), ForeignKey("chatbots.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    critical = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_evaluation_suites_space_created", "space_id", "created_at"),
        Index("ix_evaluation_suites_chatbot", "chatbot_id"),
    )


class EvaluationCase(Base):
    __tablename__ = "evaluation_cases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    suite_id = Column(
        UUID(as_uuid=True),
        ForeignKey("evaluation_suites.id", ondelete="CASCADE"),
        nullable=False,
    )
    space_id = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(160), nullable=False)
    question = Column(Text, nullable=False)
    history = Column(JSONB, nullable=False, default=list)
    customer_context = Column(JSONB, nullable=False, default=dict)
    expectations = Column(JSONB, nullable=False, default=dict)
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_evaluation_cases_suite_created", "suite_id", "created_at"),
        Index("ix_evaluation_cases_space", "space_id"),
    )


class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    suite_id = Column(
        UUID(as_uuid=True),
        ForeignKey("evaluation_suites.id", ondelete="CASCADE"),
        nullable=False,
    )
    space_id = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False)
    target = Column(String(20), nullable=False, default="published")
    status = Column(String(20), nullable=False, default="running")
    total_cases = Column(Integer, nullable=False, default=0)
    passed_cases = Column(Integer, nullable=False, default=0)
    failed_cases = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_evaluation_runs_space_started", "space_id", "started_at"),
        Index("ix_evaluation_runs_suite_started", "suite_id", "started_at"),
    )


class EvaluationResult(Base):
    __tablename__ = "evaluation_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("evaluation_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    case_id = Column(
        UUID(as_uuid=True),
        ForeignKey("evaluation_cases.id", ondelete="CASCADE"),
        nullable=False,
    )
    space_id = Column(UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False)
    passed = Column(Boolean, nullable=False)
    checks = Column(JSONB, nullable=False, default=list)
    failures = Column(JSONB, nullable=False, default=list)
    actual_response = Column(Text, nullable=False)
    actual_agent = Column(String(120), nullable=True)
    actual_source_ids = Column(JSONB, nullable=False, default=list)
    actual_rag_hit = Column(Boolean, nullable=False, default=False)
    actual_escalated = Column(Boolean, nullable=False, default=False)
    response_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_evaluation_results_run", "run_id"),
        Index("ix_evaluation_results_case_created", "case_id", "created_at"),
        Index("ix_evaluation_results_space", "space_id"),
    )
