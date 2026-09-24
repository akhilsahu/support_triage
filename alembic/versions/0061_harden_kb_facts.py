"""Harden kb_facts

Revision ID: 0061_harden_kb_facts
Revises: 0060_migrate_yullo_sources
Create Date: 2026-09-18 19:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '0061_harden_kb_facts'
down_revision: Union[str, None] = '0060_migrate_yullo_sources'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Add space_id to knowledge_base_items as nullable and UQ to knowledge_bases
    op.add_column('knowledge_base_items', sa.Column('space_id', sa.UUID(), nullable=True))
    op.create_index('ix_kb_item_space_id', 'knowledge_base_items', ['space_id'], unique=False)
    op.create_unique_constraint('uq_knowledge_bases_id_space_id', 'knowledge_bases', ['id', 'space_id'])

    # 2. Backfill knowledge_base_items.space_id
    conn.execute(sa.text("""
        UPDATE knowledge_base_items kbi
        SET space_id = kb.space_id
        FROM knowledge_bases kb
        WHERE kbi.kb_id = kb.id
    """))

    # 3. Check for unresolved rows
    null_count = conn.execute(sa.text("SELECT count(1) FROM knowledge_base_items WHERE space_id IS NULL")).scalar()
    if null_count > 0:
        raise Exception(f"Cannot proceed with migration: {null_count} knowledge_base_items rows have no space_id.")

    # 4. Make knowledge_base_items.space_id NOT NULL
    op.alter_column('knowledge_base_items', 'space_id', existing_type=sa.UUID(), nullable=False)

    # 5. Add unique constraint and composite FK to knowledge_base_items
    op.create_unique_constraint('uq_knowledge_base_items_id_space_id_kb_id', 'knowledge_base_items', ['id', 'space_id', 'kb_id'])
    
    # We need to drop the old scalar FK on knowledge_base_items if it exists, but alembic auto-named it
    # We will try to find its name
    res = conn.execute(sa.text("""
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'knowledge_base_items' AND constraint_type = 'FOREIGN KEY'
    """)).fetchall()
    
    for r in res:
        # Just drop all old FKs on knowledge_base_items (should just be kb_id)
        op.drop_constraint(r[0], 'knowledge_base_items', type_='foreignkey')

    op.create_foreign_key(
        'fk_kb_items_kb_id_space_id', 'knowledge_base_items', 'knowledge_bases', 
        ['kb_id', 'space_id'], ['id', 'space_id'], ondelete='CASCADE'
    )

    # 6. Drop scalar kb_id FK from kb_facts
    res_facts = conn.execute(sa.text("""
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'kb_facts' AND constraint_type = 'FOREIGN KEY'
    """)).fetchall()
    for r in res_facts:
        op.drop_constraint(r[0], 'kb_facts', type_='foreignkey')

    # 7. Add columns to kb_facts
    op.add_column('kb_facts', sa.Column('value_json', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('kb_facts', sa.Column('review_status', sa.String(length=30), nullable=True))
    op.add_column('kb_facts', sa.Column('source_item_id', sa.UUID(), nullable=True))
    op.add_column('kb_facts', sa.Column('source_version', sa.Integer(), nullable=True))
    op.add_column('kb_facts', sa.Column('valid_from', sa.DateTime(timezone=True), nullable=True))
    op.add_column('kb_facts', sa.Column('valid_until', sa.DateTime(timezone=True), nullable=True))
    op.add_column('kb_facts', sa.Column('last_verified_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('kb_facts', sa.Column('superseded_by_id', sa.UUID(), nullable=True))

    # We might need to alter existing timestamp columns to timezone=True for consistency if we wanted, but not explicitly requested.

    # 8. Add unique constraint to kb_facts
    op.create_unique_constraint('uq_kb_facts_id_space_id_kb_id', 'kb_facts', ['id', 'space_id', 'kb_id'])

    # 9. Add composite FKs to kb_facts
    op.create_foreign_key(
        'fk_kb_facts_kb_id_space_id', 'kb_facts', 'knowledge_bases',
        ['kb_id', 'space_id'], ['id', 'space_id'], ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_kb_facts_source_item_id', 'kb_facts', 'knowledge_base_items',
        ['source_item_id', 'space_id', 'kb_id'], ['id', 'space_id', 'kb_id'], ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_kb_facts_superseded_by_id', 'kb_facts', 'kb_facts',
        ['superseded_by_id', 'space_id', 'kb_id'], ['id', 'space_id', 'kb_id'], ondelete='SET NULL'
    )

    # 10. Backfill kb_facts.review_status
    conn.execute(sa.text("""
        UPDATE kb_facts
        SET review_status = CASE 
            WHEN verified = true THEN 'owner_confirmed'
            ELSE 'extracted'
        END
    """))
    op.alter_column('kb_facts', 'review_status', existing_type=sa.String(length=30), nullable=False)

    # 11. Backfill kb_facts.source_item_id
    # Only update when exactly one match exists in knowledge_base_items
    conn.execute(sa.text("""
        UPDATE kb_facts f
        SET source_item_id = sub.id
        FROM (
            SELECT i.id, i.kb_id, i.doc_id
            FROM knowledge_base_items i
            JOIN (
                SELECT kb_id, doc_id
                FROM knowledge_base_items
                WHERE doc_id IS NOT NULL
                GROUP BY kb_id, doc_id
                HAVING COUNT(1) = 1
            ) single_match ON i.kb_id = single_match.kb_id AND i.doc_id = single_match.doc_id
        ) sub
        WHERE f.kb_id = sub.kb_id AND f.source_doc_id = sub.doc_id
    """))

    # 12. Add check constraints
    op.create_check_constraint('ck_kb_facts_review_status', 'kb_facts', "review_status IN ('extracted', 'owner_confirmed', 'source_authoritative', 'rejected', 'superseded')")
    op.create_check_constraint('ck_kb_facts_verified_match', 'kb_facts', "(review_status IN ('owner_confirmed', 'source_authoritative')) = verified")
    op.create_check_constraint('ck_kb_facts_valid_time', 'kb_facts', "valid_until > valid_from")
    op.create_check_constraint('ck_kb_facts_source_version', 'kb_facts', "source_version > 0")
    op.create_check_constraint('ck_kb_facts_no_self_supersede', 'kb_facts', "superseded_by_id != id")
    op.create_check_constraint('ck_kb_facts_superseded_consistent', 'kb_facts', "(review_status = 'superseded') = (superseded_by_id IS NOT NULL)")


def downgrade() -> None:
    pass
