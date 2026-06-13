"""staff inbox tables and chat_session columns

Revision ID: 0003_staff_inbox
Revises: 0002_nav_config
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "0003_staff_inbox"
down_revision = "0002_nav_config"
branch_labels = None
depends_on = None


def _table_exists(conn, name):
    result = conn.execute(
        sa.text("SELECT to_regclass(:t)"), {"t": name}
    )
    return result.scalar() is not None


def _col_exists(conn, table, col):
    result = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name=:t AND column_name=:c"
        ),
        {"t": table, "c": col},
    )
    return result.fetchone() is not None


def upgrade():
    conn = op.get_bind()

    # ── staff_members ─────────────────────────────────────────────────────────
    if not _table_exists(conn, "staff_members"):
        op.create_table(
            "staff_members",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("space_id", UUID(as_uuid=True), sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("email", sa.String(255), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("password_hash", sa.Text, nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("presence", sa.String(20), server_default="offline", nullable=False),
            sa.Column("service_paused", sa.Boolean, server_default="false", nullable=False),
            sa.Column("max_concurrent_chats", sa.Integer, server_default="3", nullable=False),
            sa.Column("active_chat_count", sa.Integer, server_default="0", nullable=False),
            sa.Column("service_hours_start", sa.String(5), nullable=True),
            sa.Column("service_hours_end", sa.String(5), nullable=True),
            sa.Column("timezone", sa.String(50), server_default="UTC", nullable=False),
            sa.Column("active", sa.Boolean, server_default="true", nullable=False),
            sa.Column("last_seen_at", sa.DateTime, nullable=True),
            sa.Column("created_at", sa.DateTime, server_default=sa.text("NOW()"), nullable=False),
            sa.Column("updated_at", sa.DateTime, server_default=sa.text("NOW()"), nullable=False),
        )
        op.create_index("ix_staff_members_space_id", "staff_members", ["space_id"])
        op.create_index("ix_staff_members_email_space", "staff_members", ["email", "space_id"], unique=True)

    # ── session_waiting_queue ─────────────────────────────────────────────────
    if not _table_exists(conn, "session_waiting_queue"):
        op.create_table(
            "session_waiting_queue",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("space_id", UUID(as_uuid=True), sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, unique=True),
            sa.Column("status", sa.String(20), server_default="waiting", nullable=False),
            sa.Column("priority", sa.Integer, server_default="0", nullable=False),
            sa.Column("position", sa.Integer, nullable=False),
            sa.Column("escalation_reason", sa.String(100), nullable=True),
            sa.Column("last_customer_message", sa.Text, nullable=True),
            sa.Column("queued_at", sa.DateTime, server_default=sa.text("NOW()"), nullable=False),
            sa.Column("expires_at", sa.DateTime, nullable=True),
        )
        op.create_index("ix_queue_space_priority", "session_waiting_queue", ["space_id", "priority", "position"])

    # ── session_assignment_history ────────────────────────────────────────────
    if not _table_exists(conn, "session_assignment_history"):
        op.create_table(
            "session_assignment_history",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("staff_id", UUID(as_uuid=True), sa.ForeignKey("staff_members.id", ondelete="CASCADE"), nullable=False),
            sa.Column("space_id", UUID(as_uuid=True), nullable=False),
            sa.Column("action", sa.String(30), nullable=False),
            sa.Column("source", sa.String(30), nullable=True),
            sa.Column("assigned_at", sa.DateTime, server_default=sa.text("NOW()"), nullable=False),
            sa.Column("released_at", sa.DateTime, nullable=True),
        )
        op.create_index("ix_assignment_history_session", "session_assignment_history", ["session_id"])
        op.create_index("ix_assignment_history_staff", "session_assignment_history", ["staff_id"])

    # ── space_assignment_rules ────────────────────────────────────────────────
    if not _table_exists(conn, "space_assignment_rules"):
        op.create_table(
            "space_assignment_rules",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("space_id", UUID(as_uuid=True), sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False, unique=True),
            sa.Column("llm_assignment_enabled", sa.Boolean, server_default="false", nullable=False),
            sa.Column("queue_wait_timeout_minutes", sa.Integer, server_default="30", nullable=False),
            sa.Column("notification_email", sa.String(255), nullable=True),
            sa.Column("created_at", sa.DateTime, server_default=sa.text("NOW()"), nullable=False),
            sa.Column("updated_at", sa.DateTime, server_default=sa.text("NOW()"), nullable=False),
        )

    # ── chat_sessions new columns ─────────────────────────────────────────────
    for col, ddl in [
        ("ai_disabled",       "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("escalated_at",      "TIMESTAMP"),
        ("escalation_reason", "VARCHAR(100)"),
        ("assigned_staff_id", "UUID REFERENCES staff_members(id) ON DELETE SET NULL"),
        ("claimed_at",        "TIMESTAMP"),
        ("resolved_at",       "TIMESTAMP"),
    ]:
        if not _col_exists(conn, "chat_sessions", col):
            conn.execute(sa.text(f"ALTER TABLE chat_sessions ADD COLUMN {col} {ddl}"))


def downgrade():
    op.drop_table("space_assignment_rules")
    op.drop_table("session_assignment_history")
    op.drop_table("session_waiting_queue")
    op.drop_table("staff_members")
    for col in ["ai_disabled", "escalated_at", "escalation_reason", "assigned_staff_id", "claimed_at", "resolved_at"]:
        op.drop_column("chat_sessions", col)
