"""Initial schema — single clean baseline with Space nomenclature.

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-27

Strategy:
  1. Create all tables fresh with final names (spaces, space_*, space_id).
  2. If old tables exist (organizations, org_*, org_id) migrate data then drop them.
  3. downgrade() drops everything.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON
import uuid

revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None


def _table_exists(conn, name: str) -> bool:
    result = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema='public' AND table_name=:n"
        ),
        {"n": name},
    )
    return result.fetchone() is not None


def upgrade():
    conn = op.get_bind()

    # ── spaces ────────────────────────────────────────────────────────────────
    if not _table_exists(conn, "spaces"):
        op.create_table(
            "spaces",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("slug", sa.String(80), nullable=False),
            sa.Column("display_name", sa.String(200), nullable=False),
            sa.Column("email", sa.String(255), nullable=False),
            sa.Column("password_hash", sa.String(255), nullable=False),
            sa.Column("logo_url", sa.String(500), nullable=True),
            sa.Column("theme_color", sa.String(20), nullable=True, server_default="#6366f1"),
            sa.Column("plan", sa.String(50), nullable=True, server_default="free"),
            sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("show_rag_citations", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("enabled_nav_items", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_spaces_slug",  "spaces", ["slug"],  unique=True)
        op.create_index("ix_spaces_email", "spaces", ["email"], unique=True)
    else:
        # Add enabled_nav_items column if upgrading existing spaces table
        cols = [r[0] for r in conn.execute(sa.text(
            "SELECT column_name FROM information_schema.columns WHERE table_name='spaces'"
        )).fetchall()]
        if "enabled_nav_items" not in cols:
            op.add_column("spaces", sa.Column("enabled_nav_items", sa.Text(), nullable=True))

        # Migrate data from old organizations table if it exists
        if _table_exists(conn, "organizations"):
            conn.execute(sa.text("""
                INSERT INTO spaces (id, slug, display_name, email, password_hash,
                    logo_url, theme_color, plan, active, show_rag_citations,
                    created_at, updated_at)
                SELECT id, slug, display_name, email, password_hash,
                    logo_url, theme_color, plan, active,
                    COALESCE(show_rag_citations, false),
                    created_at, updated_at
                FROM organizations
                ON CONFLICT DO NOTHING
            """))

    # ── builtin_agent_catalog ─────────────────────────────────────────────────
    if not _table_exists(conn, "builtin_agent_catalog"):
        op.create_table(
            "builtin_agent_catalog",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("slug", sa.String(80), nullable=False, unique=True),
            sa.Column("agent_type", sa.String(80), nullable=False, unique=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("icon", sa.String(20), nullable=True, server_default="🤖"),
            sa.Column("base_prompt", sa.Text(), nullable=True),
            sa.Column("default_temperature", sa.Float(), nullable=True, server_default="0.4"),
            sa.Column("default_max_tokens", sa.Integer(), nullable=True, server_default="500"),
            sa.Column("default_rag_enabled", sa.Boolean(), nullable=True, server_default="false"),
            sa.Column("default_rag_doc_types", sa.String(500), nullable=True),
            sa.Column("default_rag_top_k", sa.Integer(), nullable=True, server_default="5"),
            sa.Column("platform_enabled", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("locked", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

        # ── Seed builtin agent catalog (all platform_enabled=false by default) ─
        # Super admin enables agents per org. Triage is locked (cannot be disabled).
        conn.execute(sa.text("""
            INSERT INTO builtin_agent_catalog
                (id, slug, agent_type, name, description, icon,
                 base_prompt, default_temperature, default_max_tokens,
                 default_rag_enabled, default_rag_doc_types, default_rag_top_k,
                 platform_enabled, locked, created_at)
            VALUES
                (gen_random_uuid(), 'triage',      'triage',      'Triage Dispatcher',
                 'Routes each customer message to the most appropriate specialist agent.',
                 '🧭', 'You are the triage coordinator. Analyse the customer message and route it to the best specialist. If the query spans multiple domains, coordinate multiple specialists.',
                 0.1, 200, false, '', 5, false, true,  NOW()),

                (gen_random_uuid(), 'finance',     'finance',     'Finance Agent',
                 'Handles refunds, billing inquiries, payment disputes and account charges.',
                 '💰', 'You are a finance support specialist. Help customers with refund requests, billing questions, and payment issues. Always verify eligibility before confirming refunds.',
                 0.3, 600, true, 'policy,finance', 5, false, false, NOW()),

                (gen_random_uuid(), 'logistics',   'logistics',   'Logistics Agent',
                 'Tracks shipments, resolves delivery issues and manages returns.',
                 '🚚', 'You are a logistics support specialist. Help customers track orders, resolve delivery issues, and process returns. Provide accurate tracking information.',
                 0.3, 600, true, 'logistics,shipping', 5, false, false, NOW()),

                (gen_random_uuid(), 'tech_support','tech_support','Tech Support Agent',
                 'Troubleshoots technical issues, product malfunctions and software errors.',
                 '🔧', 'You are a technical support specialist. Help customers troubleshoot product issues, software bugs, and configuration problems. Ask clarifying questions when needed.',
                 0.4, 800, true, 'manual,tech_support', 5, false, false, NOW()),

                (gen_random_uuid(), 'order',       'order',       'Order Agent',
                 'Manages order status, modifications, cancellations and confirmations.',
                 '📦', 'You are an order management specialist. Help customers check order status, modify or cancel orders, and understand order confirmations.',
                 0.3, 500, true, 'order', 5, false, false, NOW()),

                (gen_random_uuid(), 'empathy',     'empathy',     'Empathy Agent',
                 'Detects negative sentiment and de-escalates distressed customers.',
                 '💚', 'You are an empathy specialist. When customers are upset or frustrated, acknowledge their feelings, apologise sincerely, and offer concrete next steps. De-escalate calmly.',
                 0.5, 400, false, '', 3, false, false, NOW())
            ON CONFLICT (slug) DO NOTHING;
        """))


    if not _table_exists(conn, "chatbots"):
        op.create_table(
            "chatbots",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("space_id", UUID(as_uuid=True),
                      sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("slug", sa.String(80), nullable=False),
            sa.Column("display_name", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("logo_url", sa.String(500), nullable=True),
            sa.Column("theme_color", sa.String(20), nullable=True),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_chatbot_space_slug", "chatbots", ["space_id", "slug"], unique=True)

        if _table_exists(conn, "chatbots_old") or _table_exists(conn, "chatbots"):
            pass  # fresh table, no old equivalent with different name

    # ── agent_definitions (deprecated, kept for compat) ───────────────────────
    if not _table_exists(conn, "agent_definitions"):
        op.create_table(
            "agent_definitions",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("space_id", UUID(as_uuid=True),
                      sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=True),
            sa.Column("chatbot_id", UUID(as_uuid=True),
                      sa.ForeignKey("chatbots.id", ondelete="CASCADE"), nullable=True),
            sa.Column("slug", sa.String(80), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("icon", sa.String(20), nullable=True),
            sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("active", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("platform_enabled", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("temperature", sa.Float(), nullable=True, server_default="0.4"),
            sa.Column("max_tokens", sa.Integer(), nullable=True, server_default="500"),
            sa.Column("rag_enabled", sa.Boolean(), nullable=True, server_default="false"),
            sa.Column("rag_doc_types", sa.String(500), nullable=True),
            sa.Column("rag_top_k", sa.Integer(), nullable=True, server_default="5"),
            sa.Column("skills_json", sa.Text(), nullable=True, server_default="[]"),
            sa.Column("keywords_json", sa.Text(), nullable=True, server_default="[]"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_agent_def_space_slug", "agent_definitions",
                        ["space_id", "slug"], unique=True)

        if _table_exists(conn, "agent_definitions_old"):
            conn.execute(sa.text("""
                INSERT INTO agent_definitions
                SELECT * FROM agent_definitions_old ON CONFLICT DO NOTHING
            """))

    # ── space_builtin_agent_configs ───────────────────────────────────────────
    if not _table_exists(conn, "space_builtin_agent_configs"):
        op.create_table(
            "space_builtin_agent_configs",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("space_id", UUID(as_uuid=True),
                      sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("chatbot_id", UUID(as_uuid=True),
                      sa.ForeignKey("chatbots.id", ondelete="CASCADE"), nullable=True),
            sa.Column("catalog_id", UUID(as_uuid=True),
                      sa.ForeignKey("builtin_agent_catalog.id", ondelete="CASCADE"),
                      nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("system_prompt", sa.Text(), nullable=True),
            sa.Column("temperature", sa.Float(), nullable=True),
            sa.Column("max_tokens", sa.Integer(), nullable=True),
            sa.Column("rag_enabled", sa.Boolean(), nullable=True),
            sa.Column("rag_doc_types", sa.String(500), nullable=True),
            sa.Column("rag_top_k", sa.Integer(), nullable=True),
            sa.Column("keywords_json", sa.Text(), nullable=True, server_default="[]"),
            sa.Column("skills_json", sa.Text(), nullable=True, server_default="[]"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("uq_chatbot_builtin_config", "space_builtin_agent_configs",
                        ["chatbot_id", "catalog_id"], unique=True)

        if _table_exists(conn, "org_builtin_agent_configs"):
            conn.execute(sa.text("""
                INSERT INTO space_builtin_agent_configs
                SELECT * FROM org_builtin_agent_configs ON CONFLICT DO NOTHING
            """))

    # ── custom_agents ─────────────────────────────────────────────────────────
    if not _table_exists(conn, "custom_agents"):
        op.create_table(
            "custom_agents",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("space_id", UUID(as_uuid=True),
                      sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("slug", sa.String(80), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("icon", sa.String(20), nullable=True, server_default="🤖"),
            sa.Column("system_prompt", sa.Text(), nullable=True),
            sa.Column("temperature", sa.Float(), nullable=True, server_default="0.4"),
            sa.Column("max_tokens", sa.Integer(), nullable=True, server_default="500"),
            sa.Column("rag_enabled", sa.Boolean(), nullable=True, server_default="false"),
            sa.Column("rag_doc_types", sa.String(500), nullable=True),
            sa.Column("rag_top_k", sa.Integer(), nullable=True, server_default="5"),
            sa.Column("keywords_json", sa.Text(), nullable=True, server_default="[]"),
            sa.Column("skills_json", sa.Text(), nullable=True, server_default="[]"),
            sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("uq_custom_agent_space_slug", "custom_agents",
                        ["space_id", "slug"], unique=True)

        if _table_exists(conn, "custom_agents_old"):
            conn.execute(sa.text("""
                INSERT INTO custom_agents
                SELECT * FROM custom_agents_old ON CONFLICT DO NOTHING
            """))

    # ── knowledge_bases ───────────────────────────────────────────────────────
    if not _table_exists(conn, "knowledge_bases"):
        op.create_table(
            "knowledge_bases",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("space_id", UUID(as_uuid=True),
                      sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_kb_space", "knowledge_bases", ["space_id"])

    # ── knowledge_base_items ──────────────────────────────────────────────────
    if not _table_exists(conn, "knowledge_base_items"):
        op.create_table(
            "knowledge_base_items",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("kb_id", UUID(as_uuid=True),
                      sa.ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False),
            sa.Column("item_type", sa.String(20), nullable=False),
            sa.Column("title", sa.String(500), nullable=True),
            sa.Column("doc_id", sa.String(500), nullable=True),
            sa.Column("question", sa.Text(), nullable=True),
            sa.Column("content", sa.Text(), nullable=True),
            sa.Column("indexed_doc_id", sa.String(500), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_kb_item_kb",   "knowledge_base_items", ["kb_id"])
        op.create_index("ix_kb_item_type", "knowledge_base_items", ["item_type"])

    # ── agent_knowledge_bases (M2M) ───────────────────────────────────────────
    if not _table_exists(conn, "agent_knowledge_bases"):
        op.create_table(
            "agent_knowledge_bases",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("agent_id", UUID(as_uuid=True),
                      sa.ForeignKey("custom_agents.id", ondelete="CASCADE"), nullable=False),
            sa.Column("kb_id", UUID(as_uuid=True),
                      sa.ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("uq_agent_kb", "agent_knowledge_bases",
                        ["agent_id", "kb_id"], unique=True)

    # ── chatbot_custom_agents (M2M) ───────────────────────────────────────────
    if not _table_exists(conn, "chatbot_custom_agents"):
        op.create_table(
            "chatbot_custom_agents",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("chatbot_id", UUID(as_uuid=True),
                      sa.ForeignKey("chatbots.id", ondelete="CASCADE"), nullable=False),
            sa.Column("agent_id", UUID(as_uuid=True),
                      sa.ForeignKey("custom_agents.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("uq_chatbot_custom_agent", "chatbot_custom_agents",
                        ["chatbot_id", "agent_id"], unique=True)

    # ── prompt_skills ─────────────────────────────────────────────────────────
    if not _table_exists(conn, "prompt_skills"):
        op.create_table(
            "prompt_skills",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("space_id", UUID(as_uuid=True),
                      sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("skill_type", sa.String(50), nullable=True, server_default="instruction"),
            sa.Column("prompt_text", sa.Text(), nullable=False),
            sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

        if _table_exists(conn, "prompt_skills_old"):
            conn.execute(sa.text("""
                INSERT INTO prompt_skills
                SELECT * FROM prompt_skills_old ON CONFLICT DO NOTHING
            """))

    # ── conversation_logs ─────────────────────────────────────────────────────
    if not _table_exists(conn, "conversation_logs"):
        op.create_table(
            "conversation_logs",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("space_id", UUID(as_uuid=True),
                      sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("chatbot_id", UUID(as_uuid=True),
                      sa.ForeignKey("chatbots.id", ondelete="SET NULL"), nullable=True),
            sa.Column("session_id", sa.String(100), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("intent", sa.String(80), nullable=True),
            sa.Column("agent_slug", sa.String(80), nullable=True),
            sa.Column("rag_hit", sa.Boolean(), nullable=True),
            sa.Column("sentiment_score", sa.Float(), nullable=True),
            sa.Column("timestamp", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_conv_log_session",   "conversation_logs", ["session_id"])
        op.create_index("ix_conv_log_timestamp",  "conversation_logs", ["timestamp"])
        op.create_index("ix_conv_log_space_ts",   "conversation_logs", ["space_id", "timestamp"])

        if _table_exists(conn, "conversation_logs_old"):
            conn.execute(sa.text("""
                INSERT INTO conversation_logs
                SELECT * FROM conversation_logs_old ON CONFLICT DO NOTHING
            """))

    # ── agent_meta_suggestions ────────────────────────────────────────────────
    if not _table_exists(conn, "agent_meta_suggestions"):
        op.create_table(
            "agent_meta_suggestions",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("space_id", UUID(as_uuid=True),
                      sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("agent_id", UUID(as_uuid=True),
                      sa.ForeignKey("agent_definitions.id", ondelete="SET NULL"), nullable=True),
            sa.Column("doc_id", sa.String(500), nullable=False, server_default=""),
            sa.Column("doc_type_key", sa.String(500), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("system_prompt", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_agent_meta_suggestion_space_doc_type", "agent_meta_suggestions",
                        ["space_id", "doc_id", "doc_type_key"], unique=True)

    # ── space_data_sources ────────────────────────────────────────────────────
    if not _table_exists(conn, "space_data_sources"):
        op.create_table(
            "space_data_sources",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("space_id", UUID(as_uuid=True),
                      sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("agent_type", sa.String(80), nullable=False),
            sa.Column("api_url", sa.String(1000), nullable=False),
            sa.Column("auth_header", sa.String(100), nullable=True, server_default="Authorization"),
            sa.Column("sample_response", sa.Text(), nullable=True),
            sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_space_data_source_space_agent", "space_data_sources",
                        ["space_id", "agent_type"])

        if _table_exists(conn, "org_data_sources"):
            conn.execute(sa.text("""
                INSERT INTO space_data_sources
                SELECT * FROM org_data_sources ON CONFLICT DO NOTHING
            """))

    # ── chat_sessions ─────────────────────────────────────────────────────────
    if not _table_exists(conn, "chat_sessions"):
        op.create_table(
            "chat_sessions",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("space_id", UUID(as_uuid=True),
                      sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("chatbot_id", UUID(as_uuid=True),
                      sa.ForeignKey("chatbots.id", ondelete="CASCADE"), nullable=True),
            sa.Column("title", sa.String(200), nullable=True),
            sa.Column("agent_slug", sa.String(80), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="open"),
            sa.Column("message_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("last_message_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_chat_sessions_space_last", "chat_sessions",
                        ["space_id", "last_message_at"])

        if _table_exists(conn, "chat_sessions_old"):
            conn.execute(sa.text("""
                INSERT INTO chat_sessions
                SELECT * FROM chat_sessions_old ON CONFLICT DO NOTHING
            """))

    # ── documents ─────────────────────────────────────────────────────────────
    if not _table_exists(conn, "documents"):
        op.create_table(
            "documents",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("space_id", UUID(as_uuid=True),
                      sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=True),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("doc_metadata", JSON(), nullable=False),
            sa.Column("source", sa.String(500), nullable=False),
            sa.Column("chunk_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("parent_document_id", UUID(as_uuid=True), nullable=True),
            sa.Column("document_type", sa.String(50), nullable=True, server_default="text"),
            sa.Column("language", sa.String(10), nullable=True, server_default="en"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_documents_space_id",   "documents", ["space_id"])
        op.create_index("ix_documents_source",      "documents", ["source"])
        op.create_index("ix_documents_parent_id",   "documents", ["parent_document_id"])
        op.create_index("ix_documents_created_at",  "documents", ["created_at"])

        if _table_exists(conn, "documents_old"):
            conn.execute(sa.text("""
                INSERT INTO documents
                SELECT * FROM documents_old ON CONFLICT DO NOTHING
            """))

    # ── agents (orchestration framework) ─────────────────────────────────────
    if not _table_exists(conn, "agents"):
        op.create_table(
            "agents",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("name", sa.String(255), nullable=False, unique=True),
            sa.Column("type", sa.String(50), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("capabilities", JSON(), nullable=False),
            sa.Column("configuration", JSON(), nullable=False),
            sa.Column("status", sa.String(50), nullable=False, server_default="active"),
            sa.Column("version", sa.String(50), nullable=True, server_default="1.0.0"),
            sa.Column("temperature", sa.String(10), nullable=True, server_default="0.7"),
            sa.Column("max_tokens", sa.String(10), nullable=True, server_default="2000"),
            sa.Column("system_prompt", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_agents_type_status", "agents", ["type", "status"])
        op.create_index("ix_agents_created_at",  "agents", ["created_at"])

    # ── workflows ─────────────────────────────────────────────────────────────
    if not _table_exists(conn, "workflows"):
        op.create_table(
            "workflows",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("execution_type", sa.String(50), nullable=False),
            sa.Column("configuration", JSON(), nullable=False),
            sa.Column("status", sa.String(50), nullable=False, server_default="draft"),
            sa.Column("version", sa.String(50), nullable=True, server_default="1.0.0"),
            sa.Column("tags", JSON(), nullable=False),
            sa.Column("retry_policy", JSON(), nullable=True),
            sa.Column("created_by", sa.String(255), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_workflows_status_type", "workflows", ["status", "execution_type"])
        op.create_index("ix_workflows_created_at",  "workflows", ["created_at"])

    # ── tasks ─────────────────────────────────────────────────────────────────
    if not _table_exists(conn, "tasks"):
        op.create_table(
            "tasks",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("workflow_id", UUID(as_uuid=True),
                      sa.ForeignKey("workflows.id", ondelete="CASCADE"), nullable=True),
            sa.Column("agent_id", UUID(as_uuid=True),
                      sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("input_data", JSON(), nullable=False),
            sa.Column("output_data", JSON(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("error_traceback", sa.Text(), nullable=True),
            sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
            sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("max_retries", sa.Integer(), nullable=False, server_default="3"),
            sa.Column("metadata", JSON(), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_tasks_status_priority",  "tasks", ["status", "priority"])
        op.create_index("ix_tasks_workflow_status",   "tasks", ["workflow_id", "status"])
        op.create_index("ix_tasks_agent_status",      "tasks", ["agent_id", "status"])
        op.create_index("ix_tasks_created_at",        "tasks", ["created_at"])

    # ── executions ────────────────────────────────────────────────────────────
    if not _table_exists(conn, "executions"):
        op.create_table(
            "executions",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("workflow_id", UUID(as_uuid=True),
                      sa.ForeignKey("workflows.id", ondelete="CASCADE"), nullable=True),
            sa.Column("task_id", UUID(as_uuid=True),
                      sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True),
            sa.Column("agent_id", UUID(as_uuid=True),
                      sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=True),
            sa.Column("input_data", JSON(), nullable=True),
            sa.Column("output_data", JSON(), nullable=True),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Column("error_traceback", sa.Text(), nullable=True),
            sa.Column("status", sa.String(50), nullable=False),
            sa.Column("exec_metadata", JSON(), nullable=False),
            sa.Column("execution_type", sa.String(50), nullable=True),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_executions_workflow_status", "executions", ["workflow_id", "status"])
        op.create_index("ix_executions_task_status",     "executions", ["task_id", "status"])
        op.create_index("ix_executions_agent_status",    "executions", ["agent_id", "status"])
        op.create_index("ix_executions_type_status",     "executions", ["execution_type", "status"])
        op.create_index("ix_executions_created_at",      "executions", ["created_at"])

    # ── conversations ─────────────────────────────────────────────────────────
    if not _table_exists(conn, "conversations"):
        op.create_table(
            "conversations",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("title", sa.String(255), nullable=True),
            sa.Column("agent_id", UUID(as_uuid=True),
                      sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=True),
            sa.Column("user_id", sa.String(255), nullable=True),
            sa.Column("conv_metadata", JSON(), nullable=False),
            sa.Column("message_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_conversations_user_id",    "conversations", ["user_id"])
        op.create_index("ix_conversations_agent_id",   "conversations", ["agent_id"])
        op.create_index("ix_conversations_created_at", "conversations", ["created_at"])

    # ── messages ──────────────────────────────────────────────────────────────
    if not _table_exists(conn, "messages"):
        op.create_table(
            "messages",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("conversation_id", UUID(as_uuid=True),
                      sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("role", sa.String(20), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("msg_metadata", JSON(), nullable=False),
            sa.Column("tokens", sa.Integer(), nullable=True),
            sa.Column("model", sa.String(100), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_messages_conversation_id", "messages", ["conversation_id"])
        op.create_index("ix_messages_role",            "messages", ["role"])
        op.create_index("ix_messages_created_at",      "messages", ["created_at"])

    # ── platform_settings ─────────────────────────────────────────────────────
    if not _table_exists(conn, "platform_settings"):
        op.create_table(
            "platform_settings",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
            sa.Column("nav_config", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        # Seed single row with all nav items enabled
        conn.execute(sa.text(
            "INSERT INTO platform_settings (id, nav_config, created_at) "
            "VALUES (gen_random_uuid(), "
            "'{\"dashboard\":true,\"chat\":true,\"agents\":true,\"knowledge-base\":true,"
            "\"analytics\":true,\"data-sources\":true,\"settings\":true}', NOW())"
        ))

    # ── Drop old tables (data already copied above) ───────────────────────────
    for old_table in [
        "org_data_sources",
        "org_builtin_agent_configs",
        "organizations",
    ]:
        if _table_exists(conn, old_table):
            op.drop_table(old_table)


def downgrade():
    op.drop_table("messages")
    op.drop_table("conversations")
    op.drop_table("executions")
    op.drop_table("tasks")
    op.drop_table("workflows")
    op.drop_table("agents")
    op.drop_table("documents")
    op.drop_table("chat_sessions")
    op.drop_table("space_data_sources")
    op.drop_table("agent_meta_suggestions")
    op.drop_table("conversation_logs")
    op.drop_table("prompt_skills")
    op.drop_table("chatbot_custom_agents")
    op.drop_table("agent_knowledge_bases")
    op.drop_table("knowledge_base_items")
    op.drop_table("knowledge_bases")
    op.drop_table("custom_agents")
    op.drop_table("space_builtin_agent_configs")
    op.drop_table("agent_definitions")
    op.drop_table("chatbots")
    op.drop_table("builtin_agent_catalog")
    op.drop_table("platform_settings")
    op.drop_table("spaces")
