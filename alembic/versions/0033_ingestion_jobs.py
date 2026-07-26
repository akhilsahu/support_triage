"""Add ingestion_jobs table — background document ingestion tracking

Revision ID: 0033_ingestion_jobs
Revises: 0032_user_login
Create Date: 2026-07-26

Large uploads (image-heavy PDFs run vision over every embedded image) take
minutes, far longer than any reasonable HTTP timeout. Uploads now return 202
immediately and process in the background; this table is how the client follows
progress and surfaces failures.

status: queued | parsing | chunking | indexing | done | failed
"""
from alembic import op
import sqlalchemy as sa

revision = "0033_ingestion_jobs"
down_revision = "0032_user_login"
branch_labels = None
depends_on = None


def _table_exists(conn, table):
    return conn.execute(sa.text("SELECT to_regclass(:t)"), {"t": f"public.{table}"}).scalar() is not None


def upgrade():
    conn = op.get_bind()
    if not _table_exists(conn, "ingestion_jobs"):
        conn.execute(sa.text(
            """
            CREATE TABLE ingestion_jobs (
                id           UUID PRIMARY KEY,
                space_id     UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
                kb_id        UUID,
                filename     VARCHAR(500) NOT NULL,
                doc_type     VARCHAR(50),
                kb_name      VARCHAR(200),
                status       VARCHAR(20) NOT NULL DEFAULT 'queued',
                progress     INTEGER NOT NULL DEFAULT 0,
                stage_detail VARCHAR(200),
                doc_id       VARCHAR(64),
                pages        INTEGER,
                chunks       INTEGER,
                error        TEXT,
                created_at   TIMESTAMP NOT NULL DEFAULT now(),
                updated_at   TIMESTAMP NOT NULL DEFAULT now()
            )
            """
        ))
        conn.execute(sa.text(
            "CREATE INDEX ix_ingestion_jobs_space_id ON ingestion_jobs (space_id)"
        ))
        conn.execute(sa.text(
            "CREATE INDEX ix_ingestion_jobs_space_created ON ingestion_jobs (space_id, created_at)"
        ))


def downgrade():
    conn = op.get_bind()
    if _table_exists(conn, "ingestion_jobs"):
        conn.execute(sa.text("DROP TABLE ingestion_jobs"))
