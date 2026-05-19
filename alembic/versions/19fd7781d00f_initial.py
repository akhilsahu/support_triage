"""squashed initial – all tables

Revision ID: 19fd7781d00f
Revises:
Create Date: 2026-05-18
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = '19fd7781d00f'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── agents ────────────────────────────────────────────────────────────────
    op.create_table(
        'agents',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('type', sa.Enum('CHAT', 'TASK', 'ANALYSIS', 'ORCHESTRATOR', 'CUSTOM', name='agenttype'), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('capabilities', sa.JSON(), nullable=False),
        sa.Column('configuration', sa.JSON(), nullable=False),
        sa.Column('status', sa.Enum('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'ERROR', name='agentstatus'), nullable=False),
        sa.Column('version', sa.String(50), nullable=True),
        sa.Column('llm_model', sa.String(100), nullable=True),
        sa.Column('temperature', sa.String(10), nullable=True),
        sa.Column('max_tokens', sa.String(10), nullable=True),
        sa.Column('system_prompt', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_agents_created_at', 'agents', ['created_at'])
    op.create_index(op.f('ix_agents_id'), 'agents', ['id'])
    op.create_index(op.f('ix_agents_name'), 'agents', ['name'], unique=True)
    op.create_index(op.f('ix_agents_status'), 'agents', ['status'])
    op.create_index(op.f('ix_agents_type'), 'agents', ['type'])
    op.create_index('ix_agents_type_status', 'agents', ['type', 'status'])

    # ── workflows ─────────────────────────────────────────────────────────────
    op.create_table(
        'workflows',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('execution_type', sa.Enum('SEQUENTIAL', 'PARALLEL', 'CONDITIONAL', 'GRAPH', name='executiontype'), nullable=False),
        sa.Column('steps', sa.JSON(), nullable=False),
        sa.Column('configuration', sa.JSON(), nullable=False),
        sa.Column('status', sa.Enum('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED', name='workflowstatus'), nullable=False),
        sa.Column('version', sa.String(50), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=False),
        sa.Column('timeout', sa.String(10), nullable=True),
        sa.Column('retry_policy', sa.JSON(), nullable=True),
        sa.Column('created_by', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_workflows_created_at', 'workflows', ['created_at'])
    op.create_index(op.f('ix_workflows_execution_type'), 'workflows', ['execution_type'])
    op.create_index(op.f('ix_workflows_id'), 'workflows', ['id'])
    op.create_index(op.f('ix_workflows_name'), 'workflows', ['name'])
    op.create_index(op.f('ix_workflows_status'), 'workflows', ['status'])
    op.create_index('ix_workflows_status_type', 'workflows', ['status', 'execution_type'])

    # ── organizations ─────────────────────────────────────────────────────────
    op.create_table(
        'organizations',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('slug', sa.String(80), nullable=False),
        sa.Column('display_name', sa.String(200), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('logo_url', sa.String(500), nullable=True),
        sa.Column('theme_color', sa.String(20), server_default='#6366f1'),
        sa.Column('plan', sa.String(50), server_default='free'),
        sa.Column('active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('show_rag_citations', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_orgs_slug', 'organizations', ['slug'], unique=True)
    op.create_index('ix_orgs_email', 'organizations', ['email'], unique=True)

    # ── documents ─────────────────────────────────────────────────────────────
    op.create_table(
        'documents',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('doc_metadata', sa.JSON(), nullable=False),
        sa.Column('source', sa.String(500), nullable=False),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('parent_document_id', sa.UUID(), nullable=True),
        sa.Column('document_type', sa.String(50), nullable=True),
        sa.Column('language', sa.String(10), nullable=True),
        sa.Column('org_id', sa.UUID(), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_documents_created_at', 'documents', ['created_at'])
    op.create_index(op.f('ix_documents_id'), 'documents', ['id'])
    op.create_index('ix_documents_parent_id', 'documents', ['parent_document_id'])
    op.create_index('ix_documents_source', 'documents', ['source'])
    op.create_index('ix_documents_org_id', 'documents', ['org_id'])

    # ── conversations ─────────────────────────────────────────────────────────
    op.create_table(
        'conversations',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(255), nullable=True),
        sa.Column('agent_id', sa.UUID(), sa.ForeignKey('agents.id', ondelete='CASCADE'), nullable=True),
        sa.Column('user_id', sa.String(255), nullable=True),
        sa.Column('conv_metadata', sa.JSON(), nullable=False),
        sa.Column('message_count', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_conversations_agent_id', 'conversations', ['agent_id'])
    op.create_index('ix_conversations_created_at', 'conversations', ['created_at'])
    op.create_index(op.f('ix_conversations_id'), 'conversations', ['id'])
    op.create_index(op.f('ix_conversations_user_id'), 'conversations', ['user_id'])

    # ── tasks ─────────────────────────────────────────────────────────────────
    op.create_table(
        'tasks',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('workflow_id', sa.UUID(), sa.ForeignKey('workflows.id', ondelete='CASCADE'), nullable=True),
        sa.Column('agent_id', sa.UUID(), sa.ForeignKey('agents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('input_data', sa.JSON(), nullable=False),
        sa.Column('output_data', sa.JSON(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('error_traceback', sa.Text(), nullable=True),
        sa.Column('status', sa.Enum('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', name='taskstatus'), nullable=False),
        sa.Column('priority', sa.Integer(), nullable=False),
        sa.Column('retry_count', sa.Integer(), nullable=False),
        sa.Column('max_retries', sa.Integer(), nullable=False),
        sa.Column('timeout', sa.Integer(), nullable=False),
        sa.Column('metadata', sa.JSON(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_tasks_agent_id'), 'tasks', ['agent_id'])
    op.create_index('ix_tasks_agent_status', 'tasks', ['agent_id', 'status'])
    op.create_index('ix_tasks_created_at', 'tasks', ['created_at'])
    op.create_index(op.f('ix_tasks_id'), 'tasks', ['id'])
    op.create_index(op.f('ix_tasks_priority'), 'tasks', ['priority'])
    op.create_index(op.f('ix_tasks_status'), 'tasks', ['status'])
    op.create_index('ix_tasks_status_priority', 'tasks', ['status', 'priority'])
    op.create_index(op.f('ix_tasks_workflow_id'), 'tasks', ['workflow_id'])
    op.create_index('ix_tasks_workflow_status', 'tasks', ['workflow_id', 'status'])

    # ── executions ────────────────────────────────────────────────────────────
    op.create_table(
        'executions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('workflow_id', sa.UUID(), sa.ForeignKey('workflows.id', ondelete='CASCADE'), nullable=True),
        sa.Column('task_id', sa.UUID(), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=True),
        sa.Column('agent_id', sa.UUID(), sa.ForeignKey('agents.id', ondelete='CASCADE'), nullable=True),
        sa.Column('execution_type', sa.String(50), nullable=False),
        sa.Column('input_data', sa.JSON(), nullable=True),
        sa.Column('output_data', sa.JSON(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('error_traceback', sa.Text(), nullable=True),
        sa.Column('duration', sa.Float(), nullable=True),
        sa.Column('status', sa.Enum('STARTED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', name='executionstatus'), nullable=False),
        sa.Column('exec_metadata', sa.JSON(), nullable=False),
        sa.Column('logs', sa.JSON(), nullable=False),
        sa.Column('metrics', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_executions_agent_id'), 'executions', ['agent_id'])
    op.create_index('ix_executions_agent_status', 'executions', ['agent_id', 'status'])
    op.create_index('ix_executions_created_at', 'executions', ['created_at'])
    op.create_index(op.f('ix_executions_id'), 'executions', ['id'])
    op.create_index(op.f('ix_executions_status'), 'executions', ['status'])
    op.create_index(op.f('ix_executions_task_id'), 'executions', ['task_id'])
    op.create_index('ix_executions_task_status', 'executions', ['task_id', 'status'])
    op.create_index('ix_executions_type_status', 'executions', ['execution_type', 'status'])
    op.create_index(op.f('ix_executions_workflow_id'), 'executions', ['workflow_id'])
    op.create_index('ix_executions_workflow_status', 'executions', ['workflow_id', 'status'])

    # ── messages ──────────────────────────────────────────────────────────────
    op.create_table(
        'messages',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('conversation_id', sa.UUID(), sa.ForeignKey('conversations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(50), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('msg_metadata', sa.JSON(), nullable=False),
        sa.Column('tokens', sa.Integer(), nullable=True),
        sa.Column('model', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_messages_conversation_id', 'messages', ['conversation_id'])
    op.create_index('ix_messages_created_at', 'messages', ['created_at'])
    op.create_index(op.f('ix_messages_id'), 'messages', ['id'])
    op.create_index('ix_messages_role', 'messages', ['role'])

    # ── chatbots ──────────────────────────────────────────────────────────────
    op.create_table(
        'chatbots',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('org_id', UUID(as_uuid=True),
                  sa.ForeignKey('organizations.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('slug', sa.String(80), nullable=False),
        sa.Column('display_name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), server_default=''),
        sa.Column('logo_url', sa.String(500), nullable=True),
        sa.Column('theme_color', sa.String(20), nullable=True),
        sa.Column('is_default', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
    )
    op.create_index('ix_chatbot_org_slug', 'chatbots', ['org_id', 'slug'], unique=True)
    op.create_index('ix_chatbots_org_id', 'chatbots', ['org_id'])

    # ── agent_definitions ─────────────────────────────────────────────────────
    op.create_table(
        'agent_definitions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('org_id', UUID(as_uuid=True),
                  sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('chatbot_id', UUID(as_uuid=True),
                  sa.ForeignKey('chatbots.id', ondelete='CASCADE'), nullable=True),
        sa.Column('slug', sa.String(80), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), server_default=''),
        sa.Column('agent_type', sa.String(80), nullable=False),
        sa.Column('icon', sa.String(20), server_default='🤖'),
        sa.Column('is_builtin', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('active', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('platform_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('system_prompt', sa.Text(), server_default=''),
        sa.Column('base_prompt', sa.Text(), server_default=''),
        sa.Column('temperature', sa.Float(), server_default='0.4'),
        sa.Column('max_tokens', sa.Integer(), server_default='500'),
        sa.Column('rag_enabled', sa.Boolean(), server_default='false'),
        sa.Column('rag_doc_types', sa.String(500), server_default=''),
        sa.Column('rag_top_k', sa.Integer(), server_default='5'),
        sa.Column('skills_json', sa.Text(), server_default='[]'),
        sa.Column('keywords_json', sa.Text(), server_default='[]'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_agent_def_org_id', 'agent_definitions', ['org_id'])
    op.create_index('ix_agent_def_org_slug', 'agent_definitions', ['org_id', 'slug'], unique=True)
    op.create_index('ix_agent_def_chatbot_id', 'agent_definitions', ['chatbot_id'])
    op.create_index('ix_agent_def_platform_enabled', 'agent_definitions', ['is_builtin', 'platform_enabled'])

    # ── prompt_skills ─────────────────────────────────────────────────────────
    op.create_table(
        'prompt_skills',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('org_id', UUID(as_uuid=True),
                  sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), server_default=''),
        sa.Column('skill_type', sa.String(50), server_default='instruction'),
        sa.Column('prompt_text', sa.Text(), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_prompt_skills_org_id', 'prompt_skills', ['org_id'])

    # ── conversation_logs ─────────────────────────────────────────────────────
    op.create_table(
        'conversation_logs',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('org_id', UUID(as_uuid=True),
                  sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('chatbot_id', UUID(as_uuid=True),
                  sa.ForeignKey('chatbots.id', ondelete='SET NULL'), nullable=True),
        sa.Column('session_id', sa.String(100), nullable=False),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('intent', sa.String(80), nullable=True),
        sa.Column('agent_slug', sa.String(80), nullable=True),
        sa.Column('rag_hit', sa.Boolean(), nullable=True),
        sa.Column('sentiment_score', sa.Float(), nullable=True),
        sa.Column('response_ms', sa.Integer(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_conv_log_org_id', 'conversation_logs', ['org_id'])
    op.create_index('ix_conv_log_session_id', 'conversation_logs', ['session_id'])
    op.create_index('ix_conv_log_timestamp', 'conversation_logs', ['timestamp'])
    op.create_index('ix_conv_log_brand_ts', 'conversation_logs', ['org_id', 'timestamp'])
    op.create_index('ix_conv_log_chatbot_id', 'conversation_logs', ['chatbot_id'])

    # ── org_data_sources ──────────────────────────────────────────────────────
    op.create_table(
        'org_data_sources',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('org_id', sa.UUID(),
                  sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('agent_type', sa.String(80), nullable=False),
        sa.Column('api_url', sa.String(1000), nullable=False),
        sa.Column('auth_type', sa.String(20), server_default='none'),
        sa.Column('auth_value', sa.Text(), server_default=''),
        sa.Column('auth_header', sa.String(100), server_default='Authorization'),
        sa.Column('field_mapping_json', sa.Text(), server_default='{}'),
        sa.Column('sample_response', sa.Text(), server_default=''),
        sa.Column('request_headers_json', sa.Text(), server_default='{}'),
        sa.Column('request_params_json', sa.Text(), server_default='{}'),
        sa.Column('method', sa.String(10), server_default='GET'),
        sa.Column('request_body_json', sa.Text(), server_default='{}'),
        sa.Column('active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_org_data_source_org_id', 'org_data_sources', ['org_id'])
    op.create_index('ix_org_data_source_org_agent', 'org_data_sources', ['org_id', 'agent_type'])

    # ── agent_meta_suggestions ────────────────────────────────────────────────
    op.create_table(
        'agent_meta_suggestions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('org_id', UUID(as_uuid=True),
                  sa.ForeignKey('organizations.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('agent_id', UUID(as_uuid=True),
                  sa.ForeignKey('agent_definitions.id', ondelete='SET NULL'),
                  nullable=True, index=True),
        sa.Column('doc_type_key', sa.String(500), nullable=False),
        sa.Column('doc_id', sa.String(500), server_default='', nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), server_default=''),
        sa.Column('system_prompt', sa.Text(), server_default=''),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index(
        'ix_agent_meta_suggestion_org_doc_type',
        'agent_meta_suggestions',
        ['org_id', 'doc_id', 'doc_type_key'],
        unique=True,
    )

    # ── agent_doc_links ───────────────────────────────────────────────────────
    op.create_table(
        'agent_doc_links',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('agent_id', UUID(as_uuid=True),
                  sa.ForeignKey('agent_definitions.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('doc_id', sa.String(500), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('agent_id', 'doc_id', name='uq_agent_doc_link'),
    )

    # ── chat_sessions ─────────────────────────────────────────────────────────
    op.create_table(
        'chat_sessions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('org_id', UUID(as_uuid=True),
                  sa.ForeignKey('organizations.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('chatbot_id', UUID(as_uuid=True),
                  sa.ForeignKey('chatbots.id', ondelete='CASCADE'),
                  nullable=True, index=True),
        sa.Column('title', sa.String(200), nullable=True),
        sa.Column('agent_slug', sa.String(80), nullable=True),
        sa.Column('status', sa.String(20), server_default='open', nullable=False),
        sa.Column('message_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('started_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('last_message_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_chat_sessions_org_last', 'chat_sessions', ['org_id', 'last_message_at'])
    op.create_index('ix_chat_sessions_chatbot_id', 'chat_sessions', ['chatbot_id'])


def downgrade() -> None:
    op.drop_table('chat_sessions')
    op.drop_table('agent_doc_links')
    op.drop_table('agent_meta_suggestions')
    op.drop_table('org_data_sources')
    op.drop_table('conversation_logs')
    op.drop_table('prompt_skills')
    op.drop_table('agent_definitions')
    op.drop_table('chatbots')
    op.drop_table('messages')
    op.drop_table('executions')
    op.drop_table('tasks')
    op.drop_table('conversations')
    op.drop_table('documents')
    op.drop_table('organizations')
    op.drop_table('workflows')
    op.drop_table('agents')
    op.execute('DROP TYPE IF EXISTS agenttype')
    op.execute('DROP TYPE IF EXISTS agentstatus')
    op.execute('DROP TYPE IF EXISTS executiontype')
    op.execute('DROP TYPE IF EXISTS workflowstatus')
    op.execute('DROP TYPE IF EXISTS taskstatus')
    op.execute('DROP TYPE IF EXISTS executionstatus')
