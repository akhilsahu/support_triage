"""Migrate Yullo Sources to Knowledge

Revision ID: 0060_migrate_yullo_sources
Revises: 5a764872442b
Create Date: 2026-09-18 18:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid

# revision identifiers, used by Alembic.
revision: str = '0060_migrate_yullo_sources'
down_revision: Union[str, None] = '5a764872442b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


import json

def upgrade() -> None:
    # Add Task 6 fields to yullo_sources
    op.add_column('yullo_sources', sa.Column('kb_id', sa.UUID(), nullable=True))
    op.add_column('yullo_sources', sa.Column('ingestion_job_id', sa.UUID(), nullable=True))
    op.add_column('yullo_sources', sa.Column('content_hash', sa.String(), nullable=True))
    op.add_column('yullo_sources', sa.Column('version', sa.Integer(), server_default='1', nullable=False))
    
    op.create_foreign_key('fk_yullo_sources_kb_id', 'yullo_sources', 'knowledge_bases', ['kb_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('fk_yullo_sources_ingestion_job_id', 'yullo_sources', 'ingestion_jobs', ['ingestion_job_id'], ['id'], ondelete='SET NULL')

    # Backfill space_sources into yullo_sources
    conn = op.get_bind()
    space_sources = conn.execute(sa.text("SELECT id, space_id, source_type, content_ref, status, error_msg, created_at, updated_at FROM space_sources")).fetchall()
    
    for source in space_sources:
        metadata_str = json.dumps({
            "content_ref": source.content_ref,
            "status": source.status,
            "error_msg": source.error_msg
        })
        conn.execute(
            sa.text("""
                INSERT INTO yullo_sources (id, space_id, type, metadata, created_at, updated_at)
                VALUES (:id, :space_id, :type, CAST(:metadata AS jsonb), :created_at, :updated_at)
            """),
            {
                "id": source.id,
                "space_id": source.space_id,
                "type": source.source_type,
                "metadata": metadata_str,
                "created_at": source.created_at,
                "updated_at": source.updated_at
            }
        )

def downgrade() -> None:
    op.drop_constraint('fk_yullo_sources_ingestion_job_id', 'yullo_sources', type_='foreignkey')
    op.drop_constraint('fk_yullo_sources_kb_id', 'yullo_sources', type_='foreignkey')
    op.drop_column('yullo_sources', 'version')
    op.drop_column('yullo_sources', 'content_hash')
    op.drop_column('yullo_sources', 'ingestion_job_id')
    op.drop_column('yullo_sources', 'kb_id')
