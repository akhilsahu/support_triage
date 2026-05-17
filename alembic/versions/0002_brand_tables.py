"""add brand, agent_definitions, prompt_skills, conversation_logs tables

Revision ID: 0002_brand_tables
Revises: 19fd7781d00f
Create Date: 2026-05-12 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = '0002_brand_tables'
down_revision: Union[str, None] = '19fd7781d00f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── brands ────────────────────────────────────────────────────────────────
    op.create_table(
        'organizations',
        sa.Column('id',            UUID(as_uuid=True), primary_key=True),
        sa.Column('slug',          sa.String(80),  nullable=False),
        sa.Column('display_name',  sa.String(200), nullable=False),
        sa.Column('email',         sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('logo_url',      sa.String(500), nullable=True),
        sa.Column('theme_color',   sa.String(20),  server_default='#6366f1'),
        sa.Column('plan',          sa.String(50),  server_default='free'),
        sa.Column('active',        sa.Boolean(),   nullable=False, server_default='true'),
        sa.Column('created_at',    sa.DateTime(),  nullable=False),
        sa.Column('updated_at',    sa.DateTime(),  nullable=True),
    )
    op.create_index('ix_orgs_slug',  'organizations', ['slug'],  unique=True)
    op.create_index('ix_orgs_email', 'organizations', ['email'], unique=True)

    # ── agent_definitions ─────────────────────────────────────────────────────
    op.create_table(
        'agent_definitions',
        sa.Column('id',            UUID(as_uuid=True), primary_key=True),
        sa.Column('org_id',      UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('slug',          sa.String(80),  nullable=False),
        sa.Column('name',          sa.String(200), nullable=False),
        sa.Column('description',   sa.Text(),      server_default=''),
        sa.Column('agent_type',    sa.String(80),  nullable=False),
        sa.Column('icon',          sa.String(20),  server_default='🤖'),
        sa.Column('is_builtin',    sa.Boolean(),   nullable=False, server_default='false'),
        sa.Column('active',        sa.Boolean(),   nullable=False, server_default='false'),
        sa.Column('system_prompt', sa.Text(),      server_default=''),
        sa.Column('temperature',   sa.Float(),     server_default='0.4'),
        sa.Column('max_tokens',    sa.Integer(),   server_default='500'),
        sa.Column('rag_enabled',   sa.Boolean(),   server_default='false'),
        sa.Column('rag_doc_types', sa.String(500), server_default=''),
        sa.Column('rag_top_k',     sa.Integer(),   server_default='5'),
        sa.Column('skills_json',   sa.Text(),      server_default='[]'),
        sa.Column('keywords_json', sa.Text(),      server_default='[]'),
        sa.Column('created_at',    sa.DateTime(),  nullable=False),
        sa.Column('updated_at',    sa.DateTime(),  nullable=True),
    )
    op.create_index('ix_agent_def_org_id', 'agent_definitions', ['org_id'])
    op.create_index('ix_agent_def_org_slug', 'agent_definitions', ['org_id', 'slug'], unique=True)

    # ── prompt_skills ─────────────────────────────────────────────────────────
    op.create_table(
        'prompt_skills',
        sa.Column('id',          UUID(as_uuid=True), primary_key=True),
        sa.Column('org_id',    UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name',        sa.String(200), nullable=False),
        sa.Column('description', sa.Text(),      server_default=''),
        sa.Column('skill_type',  sa.String(50),  server_default='instruction'),
        sa.Column('prompt_text', sa.Text(),      nullable=False),
        sa.Column('active',      sa.Boolean(),   nullable=False, server_default='true'),
        sa.Column('created_at',  sa.DateTime(),  nullable=False),
        sa.Column('updated_at',  sa.DateTime(),  nullable=True),
    )
    op.create_index('ix_prompt_skills_org_id', 'prompt_skills', ['org_id'])

    # ── conversation_logs ─────────────────────────────────────────────────────
    op.create_table(
        'conversation_logs',
        sa.Column('id',              UUID(as_uuid=True), primary_key=True),
        sa.Column('org_id',        UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('session_id',      sa.String(100), nullable=False),
        sa.Column('role',            sa.String(20),  nullable=False),
        sa.Column('message',         sa.Text(),      nullable=False),
        sa.Column('intent',          sa.String(80),  nullable=True),
        sa.Column('agent_slug',      sa.String(80),  nullable=True),
        sa.Column('rag_hit',         sa.Boolean(),   nullable=True),
        sa.Column('sentiment_score', sa.Float(),     nullable=True),
        sa.Column('response_ms',     sa.Integer(),   nullable=True),
        sa.Column('timestamp',       sa.DateTime(),  nullable=False),
    )
    op.create_index('ix_conv_log_org_id',   'conversation_logs', ['org_id'])
    op.create_index('ix_conv_log_session_id', 'conversation_logs', ['session_id'])
    op.create_index('ix_conv_log_timestamp',  'conversation_logs', ['timestamp'])
    op.create_index('ix_conv_log_brand_ts',   'conversation_logs', ['org_id', 'timestamp'])


def downgrade() -> None:
    op.drop_table('conversation_logs')
    op.drop_table('prompt_skills')
    op.drop_table('agent_definitions')
    op.drop_table('organizations')
