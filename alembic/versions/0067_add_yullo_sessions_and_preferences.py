"""add_yullo_sessions_and_preferences

Revision ID: 785d571cb2a5
Revises: 1abd5cccdafd
Create Date: 2026-09-19 02:13:16.029455

This migration ONLY creates the two Yullo-specific tables.
All unrelated auto-generated drift (enum casts, index renames, column drops
on agents/tasks/workflows/executions/etc.) has been intentionally removed
to keep the migration focused and safe.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '785d571cb2a5'
down_revision: Union[str, None] = '1abd5cccdafd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Yullo User Preferences ──────────────────────────────────────────────
    op.create_table(
        'yullo_user_preferences',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('app_theme', sa.String(length=20), nullable=False),
        sa.Column('timezone', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "app_theme IN ('system', 'light', 'warm', 'dark')",
            name='chk_yullo_user_preferences_app_theme',
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id'),
    )

    # ── Yullo User Sessions (revocable, cookie-based) ───────────────────────
    op.create_table(
        'yullo_user_sessions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('csrf_hash', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('user_agent_hash', sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_yullo_user_sessions_token_hash'),
        'yullo_user_sessions',
        ['token_hash'],
        unique=True,
    )
    op.create_index(
        op.f('ix_yullo_user_sessions_user_id'),
        'yullo_user_sessions',
        ['user_id'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_yullo_user_sessions_user_id'), table_name='yullo_user_sessions')
    op.drop_index(op.f('ix_yullo_user_sessions_token_hash'), table_name='yullo_user_sessions')
    op.drop_table('yullo_user_sessions')
    op.drop_table('yullo_user_preferences')
