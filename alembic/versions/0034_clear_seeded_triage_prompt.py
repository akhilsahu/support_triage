"""Clear the seeded triage system_prompt so it means "owner customised routing"

Revision ID: 0034_triage_prompt
Revises: 0033_ingestion_jobs
Create Date: 2026-07-30

A chatbot's triage system_prompt is an OWNER OVERRIDE: TeamFactory uses it as the
Team leader's instructions instead of TRIAGE_COORDINATOR_PROMPT. Space
registration used to seed a placeholder into it (a leftover from the old JSON
routing-classifier design), while chatbots created later were seeded with none —
so the same space could route two different ways depending on which chatbot the
customer landed on, and neither owner had asked for it.

Seeding is removed (see BUILTIN_AGENTS in api/auth.py). This clears the rows that
already carry the placeholder, matching on the exact string so a prompt an owner
actually wrote is left alone.

Irreversible by design: the downgrade would restore a value nobody chose.
"""
from alembic import op
import sqlalchemy as sa

revision = "0034_triage_prompt"
down_revision = "0033_ingestion_jobs"
branch_labels = None
depends_on = None

SEEDED_PROMPT = (
    "Classify the customer message and route to the correct specialist agent. "
    "Be concise and accurate."
)


def upgrade():
    op.get_bind().execute(
        sa.text(
            """
            UPDATE space_builtin_agent_configs AS c
               SET system_prompt = ''
              FROM builtin_agent_catalog AS cat
             WHERE c.catalog_id = cat.id
               AND cat.agent_type = 'triage'
               AND c.system_prompt = :seeded
            """
        ),
        {"seeded": SEEDED_PROMPT},
    )


def downgrade():
    pass
