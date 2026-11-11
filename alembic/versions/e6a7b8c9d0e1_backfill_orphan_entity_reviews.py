"""Backfill cleanup reviews for extracted entities without evidence.

Revision ID: e6a7b8c9d0e1
Revises: d5f6a7b8c9d0
Create Date: 2026-10-25
"""

from typing import Sequence, Union

from alembic import op


revision: str = "e6a7b8c9d0e1"
down_revision: Union[str, None] = "d5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Evidence is the source relationship for extracted entities. Notification
    # eligibility below intentionally ignores active/public/review state: if an
    # extracted entity remains stored with no evidence, the owner must see it.
    op.execute(
        """
        UPDATE yullo_space_entities AS entity
        SET is_active = false,
            is_public = false,
            review_status = 'superseded',
            revision = revision + 1
        WHERE entity.origin_type = 'extracted'
          AND NOT EXISTS (
              SELECT 1
              FROM yullo_space_entity_evidence AS evidence
              WHERE evidence.entity_id = entity.id
                AND evidence.space_id = entity.space_id
          )
          AND (
              entity.is_active = true
              OR entity.is_public = true
              OR entity.review_status <> 'superseded'
          )
        """
    )
    op.execute(
        """
        WITH orphan_entities AS (
            SELECT entity.*
            FROM yullo_space_entities AS entity
            WHERE entity.origin_type = 'extracted'
              AND NOT EXISTS (
                  SELECT 1
                  FROM yullo_space_entity_evidence AS evidence
                  WHERE evidence.entity_id = entity.id
                    AND evidence.space_id = entity.space_id
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM yullo_knowledge_cleanup_alerts AS alert,
                       jsonb_array_elements_text(alert.entity_ids) AS alert_entity_id
                  WHERE alert.space_id = entity.space_id
                    AND alert_entity_id::uuid = entity.id
              )
        ), grouped AS (
            SELECT
                space_id,
                (
                    substr(md5(space_id::text || '|legacy-orphan-entities'), 1, 8) || '-' ||
                    substr(md5(space_id::text || '|legacy-orphan-entities'), 9, 4) || '-' ||
                    substr(md5(space_id::text || '|legacy-orphan-entities'), 13, 4) || '-' ||
                    substr(md5(space_id::text || '|legacy-orphan-entities'), 17, 4) || '-' ||
                    substr(md5(space_id::text || '|legacy-orphan-entities'), 21, 12)
                )::uuid AS review_id,
                jsonb_agg(id::text ORDER BY created_at) AS entity_ids
            FROM orphan_entities
            GROUP BY space_id
        )
        INSERT INTO yullo_knowledge_cleanup_alerts (
            id, space_id, deleted_source_id, source_title, source_locator,
            fact_ids, entity_ids, status, revision, created_at
        )
        SELECT
            review_id,
            space_id,
            review_id,
            'Removed or unavailable sources',
            NULL,
            '[]'::jsonb,
            entity_ids,
            'pending',
            1,
            now()
        FROM grouped
        """
    )


def downgrade() -> None:
    # Entity state may have been reviewed after upgrade, so downgrade removes
    # only the deterministic backfill alert and does not reactivate data.
    op.execute(
        """
        DELETE FROM yullo_knowledge_cleanup_alerts
        WHERE id = (
            substr(md5(space_id::text || '|legacy-orphan-entities'), 1, 8) || '-' ||
            substr(md5(space_id::text || '|legacy-orphan-entities'), 9, 4) || '-' ||
            substr(md5(space_id::text || '|legacy-orphan-entities'), 13, 4) || '-' ||
            substr(md5(space_id::text || '|legacy-orphan-entities'), 17, 4) || '-' ||
            substr(md5(space_id::text || '|legacy-orphan-entities'), 21, 12)
        )::uuid
        """
    )
