"""add_users_and_auth_identities_tables

Revision ID: a04e4cefccb2
Revises: 680cd033bf05
Create Date: 2026-09-16 01:10:12.858469

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a04e4cefccb2'
down_revision: Union[str, None] = '680cd033bf05'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create users table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('email', sa.String(255), nullable=True, unique=True),
        sa.Column('phone', sa.String(50), nullable=True, unique=True),
        sa.Column('full_name', sa.String(200), nullable=True),
        sa.Column('onboarding_completed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_phone'), 'users', ['phone'], unique=True)

    # 2. Create auth_identities table
    op.create_table(
        'auth_identities',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('provider', sa.String(20), nullable=False),
        sa.Column('provider_subject', sa.String(255), nullable=False),
        sa.Column('verified_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index(op.f('ix_auth_identities_user_id'), 'auth_identities', ['user_id'], unique=False)
    op.create_index(op.f('ix_auth_identities_provider_subject'), 'auth_identities', ['provider_subject'], unique=False)
    op.create_index('uix_provider_subject', 'auth_identities', ['provider', 'provider_subject'], unique=True)

    # 3. Add owner_user_id to spaces if not present
    conn = op.get_bind()
    res = conn.execute(sa.text("SELECT column_name FROM information_schema.columns WHERE table_name='spaces' AND column_name='owner_user_id';"))
    if not res.scalar():
        op.add_column('spaces', sa.Column('owner_user_id', postgresql.UUID(as_uuid=True), nullable=True))
        op.create_index(op.f('ix_spaces_owner_user_id'), 'spaces', ['owner_user_id'], unique=False)
        op.create_foreign_key('fk_spaces_owner_user_id', 'spaces', 'users', ['owner_user_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('fk_spaces_owner_user_id', 'spaces', type_='foreignkey')
    op.drop_index(op.f('ix_spaces_owner_user_id'), table_name='spaces')
    op.drop_column('spaces', 'owner_user_id')
    op.drop_index('uix_provider_subject', table_name='auth_identities')
    op.drop_index(op.f('ix_auth_identities_provider_subject'), table_name='auth_identities')
    op.drop_index(op.f('ix_auth_identities_user_id'), table_name='auth_identities')
    op.drop_table('auth_identities')
    op.drop_index(op.f('ix_users_phone'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
