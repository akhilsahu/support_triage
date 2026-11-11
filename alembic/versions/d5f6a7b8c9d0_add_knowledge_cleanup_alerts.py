"""Add retained-knowledge cleanup alerts.

Revision ID: d5f6a7b8c9d0
Revises: c7b2e591a03d
Create Date: 2026-10-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "d5f6a7b8c9d0"
down_revision: Union[str, None] = "c7b2e591a03d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("kb_facts", sa.Column("maintenance_mode", sa.String(length=20), nullable=True))
    op.add_column("kb_facts", sa.Column("deleted_source_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("kb_facts", sa.Column("deleted_source_locator", sa.String(length=1000), nullable=True))

    op.create_table(
        "yullo_knowledge_cleanup_alerts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("space_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("deleted_source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_title", sa.String(length=500), nullable=False),
        sa.Column("source_locator", sa.String(length=1000), nullable=True),
        sa.Column("fact_ids", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("entity_ids", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("revision > 0", name="ck_yullo_cleanup_alert_revision"),
        sa.CheckConstraint("status IN ('pending', 'resolved')", name="ck_yullo_cleanup_alert_status"),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_yullo_cleanup_alert_space_status",
        "yullo_knowledge_cleanup_alerts",
        ["space_id", "status"],
    )

    # Facts left by older source deletions already have no source_item_id but
    # retain source_doc_id. Keep them paused and surface them through the same
    # owner review instead of leaving historical orphans invisible.
    op.execute(
        """
        UPDATE kb_facts
        SET maintenance_mode = 'review_required',
            deleted_source_id = (
                substr(md5(space_id::text || ':' || source_doc_id), 1, 8) || '-' ||
                substr(md5(space_id::text || ':' || source_doc_id), 9, 4) || '-' ||
                substr(md5(space_id::text || ':' || source_doc_id), 13, 4) || '-' ||
                substr(md5(space_id::text || ':' || source_doc_id), 17, 4) || '-' ||
                substr(md5(space_id::text || ':' || source_doc_id), 21, 12)
            )::uuid,
            review_status = 'extracted',
            verified = false
        WHERE source_item_id IS NULL
          AND source_doc_id IS NOT NULL
          AND deleted_source_id IS NULL
          AND review_status IN ('extracted', 'owner_confirmed', 'source_authoritative')
        """
    )
    op.execute(
        """
        INSERT INTO yullo_knowledge_cleanup_alerts (
            id, space_id, deleted_source_id, source_title, source_locator,
            fact_ids, entity_ids, status, revision, created_at
        )
        SELECT
            deleted_source_id,
            space_id,
            deleted_source_id,
            COALESCE(MIN(NULLIF(source_filename, '')), MIN(source_doc_id), 'Removed source'),
            NULL,
            jsonb_agg(id::text ORDER BY created_at),
            '[]'::jsonb,
            'pending',
            1,
            now()
        FROM kb_facts
        WHERE maintenance_mode = 'review_required'
          AND source_item_id IS NULL
          AND source_doc_id IS NOT NULL
          AND deleted_source_id IS NOT NULL
        GROUP BY space_id, deleted_source_id
        """
    )


def downgrade() -> None:
    op.drop_index("ix_yullo_cleanup_alert_space_status", table_name="yullo_knowledge_cleanup_alerts")
    op.drop_table("yullo_knowledge_cleanup_alerts")
    op.drop_column("kb_facts", "deleted_source_locator")
    op.drop_column("kb_facts", "deleted_source_id")
    op.drop_column("kb_facts", "maintenance_mode")
