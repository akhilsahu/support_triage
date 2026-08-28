"""Topic/doc-label metadata, agent topic scoping, and the kb_facts store

Revision ID: 0039_topic_meta_facts
Revises: 0038_job_source
Create Date: 2026-08-03

Three related additions, all driven by one failure: the SBI Card PRIME annual
fee lives in a shared MITC document covering ~20 cards, and nothing could say
which document was about which card.

  * knowledge_base_items.topic / doc_label — a user-typed, slugified grouping.
    "topic" groups the documents describing one thing (a card's brochure, its
    T&C and the shared fee schedule); "doc_label" distinguishes them within it.
    Deliberately user input rather than anything inferred: nothing can tell
    "SBI Card MILES PRIME" from "SBI Card PRIME" without being told.

  * custom_agents.topics — optional scoping. NULL/empty preserves today's
    behaviour exactly (the agent sees every document in its linked KBs), so
    this migration changes no existing agent's retrieval.

  * kb_facts — extracted or hand-entered attributes ("Annual Fee: 2,999"),
    with provenance back to the source page. verified defaults to False and
    nothing unverified is ever shown to an agent.

All columns are nullable with no backfill: existing rows keep working, and the
new behaviour only starts once someone fills a topic in.
"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0039_topic_meta_facts"
down_revision = "0038_job_source"
branch_labels = None
depends_on = None


def upgrade():
    # A KB about one product sets this once and every upload inherits it; the
    # per-item column below overrides it for a shared document.
    op.add_column("knowledge_bases", sa.Column("default_topic", sa.String(length=120), nullable=True))

    op.add_column("knowledge_base_items", sa.Column("topic", sa.String(length=120), nullable=True))
    op.add_column("knowledge_base_items", sa.Column("doc_label", sa.String(length=200), nullable=True))
    op.create_index("ix_kb_item_topic", "knowledge_base_items", ["topic"])

    op.add_column("custom_agents", sa.Column("topics", sa.Text(), nullable=True))

    op.create_table(
        "kb_facts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("kb_id", UUID(as_uuid=True),
                  sa.ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("space_id", UUID(as_uuid=True), nullable=False),
        # How a fact reaches the right agent — matched against custom_agents.topics.
        sa.Column("topic", sa.String(length=120), nullable=True),
        # The name as written in the source table, kept verbatim so a human can
        # see what was matched. "SBI Card MILES PRIME" and "SBI Card PRIME" are
        # different subjects one row apart.
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        # Provenance — the fact is injected into the prompt, not retrieved, so it
        # carries its own citation rather than going through _citation_from_chunk.
        sa.Column("source_doc_id", sa.String(length=500), nullable=True),
        sa.Column("source_filename", sa.String(length=500), nullable=True),
        sa.Column("source_page", sa.Integer(), nullable=True),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_kb_fact_kb_verified", "kb_facts", ["kb_id", "verified"])
    op.create_index("ix_kb_fact_topic", "kb_facts", ["topic"])


def downgrade():
    op.drop_index("ix_kb_fact_topic", table_name="kb_facts")
    op.drop_index("ix_kb_fact_kb_verified", table_name="kb_facts")
    op.drop_table("kb_facts")

    op.drop_column("custom_agents", "topics")

    op.drop_index("ix_kb_item_topic", table_name="knowledge_base_items")
    op.drop_column("knowledge_base_items", "doc_label")
    op.drop_column("knowledge_base_items", "topic")

    op.drop_column("knowledge_bases", "default_topic")
