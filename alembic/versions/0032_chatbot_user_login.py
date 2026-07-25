"""Add chatbot customer login: chatbot_users + identities, session owner, gate column

Revision ID: 0032_user_login
Revises: 0031_homepage_snapshot
Create Date: 2026-07-25

End-customer (chatbot user) identity, platform-wide rather than space-scoped so
one login follows a customer across every space's chatbot. Two tables so future
auth methods (phone, plain email, facebook) are additive identity rows instead
of schema changes, and two methods can link to one person.

Also:
  - chat_sessions.chatbot_user_id -- NULL = anonymous session (unchanged today).
  - chatbots.login_after_messages -- NULL never / 0 before first message /
    N free messages then login required.
"""
from alembic import op
import sqlalchemy as sa

revision = "0032_user_login"
down_revision = "0031_homepage_snapshot"
branch_labels = None
depends_on = None


def _table_exists(conn, table):
    return conn.execute(sa.text("SELECT to_regclass(:t)"), {"t": f"public.{table}"}).scalar() is not None


def _col_exists(conn, table, col):
    return conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c"
    ), {"t": table, "c": col}).scalar() is not None


def upgrade():
    conn = op.get_bind()

    if not _table_exists(conn, "chatbot_users"):
        conn.execute(sa.text(
            """
            CREATE TABLE chatbot_users (
                id           UUID PRIMARY KEY,
                email        VARCHAR(320),
                phone        VARCHAR(20),
                name         VARCHAR(200),
                avatar_url   TEXT,
                created_at   TIMESTAMP NOT NULL DEFAULT now(),
                last_seen_at TIMESTAMP NOT NULL DEFAULT now()
            )
            """
        ))
        conn.execute(sa.text("CREATE INDEX ix_chatbot_users_email ON chatbot_users (email)"))

    if not _table_exists(conn, "chatbot_user_identities"):
        conn.execute(sa.text(
            """
            CREATE TABLE chatbot_user_identities (
                id           UUID PRIMARY KEY,
                user_id      UUID NOT NULL REFERENCES chatbot_users(id) ON DELETE CASCADE,
                provider     VARCHAR(20) NOT NULL,
                provider_sub VARCHAR(255) NOT NULL,
                created_at   TIMESTAMP NOT NULL DEFAULT now()
            )
            """
        ))
        conn.execute(sa.text(
            "CREATE UNIQUE INDEX ix_chatbot_user_identity_key "
            "ON chatbot_user_identities (provider, provider_sub)"
        ))
        conn.execute(sa.text(
            "CREATE INDEX ix_chatbot_user_identities_user_id ON chatbot_user_identities (user_id)"
        ))

    if not _col_exists(conn, "chat_sessions", "chatbot_user_id"):
        conn.execute(sa.text(
            "ALTER TABLE chat_sessions ADD COLUMN chatbot_user_id UUID "
            "REFERENCES chatbot_users(id) ON DELETE SET NULL"
        ))
        conn.execute(sa.text(
            "CREATE INDEX ix_chat_sessions_chatbot_user_id ON chat_sessions (chatbot_user_id)"
        ))

    if not _col_exists(conn, "chatbots", "login_after_messages"):
        conn.execute(sa.text("ALTER TABLE chatbots ADD COLUMN login_after_messages INTEGER"))


def downgrade():
    conn = op.get_bind()
    if _col_exists(conn, "chatbots", "login_after_messages"):
        conn.execute(sa.text("ALTER TABLE chatbots DROP COLUMN login_after_messages"))
    if _col_exists(conn, "chat_sessions", "chatbot_user_id"):
        conn.execute(sa.text("ALTER TABLE chat_sessions DROP COLUMN chatbot_user_id"))
    if _table_exists(conn, "chatbot_user_identities"):
        conn.execute(sa.text("DROP TABLE chatbot_user_identities"))
    if _table_exists(conn, "chatbot_users"):
        conn.execute(sa.text("DROP TABLE chatbot_users"))
