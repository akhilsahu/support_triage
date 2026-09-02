"""Add auto_assign_on_first_message to space assignment rules.

Revision ID: fb1871f37217
Revises: 0047_datasource_tool_registry
Create Date: 2026-09-01 19:52:18.561049
"""

from alembic import op
import sqlalchemy as sa


revision = "fb1871f37217"
down_revision = "0047_datasource_tool_registry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {
        column["name"]
        for column in sa.inspect(op.get_bind()).get_columns("space_assignment_rules")
    }
    if "auto_assign_on_first_message" not in columns:
        op.add_column(
            "space_assignment_rules",
            sa.Column(
                "auto_assign_on_first_message",
                sa.Boolean(),
                server_default=sa.text("false"),
                nullable=False,
            ),
        )


def downgrade() -> None:
    op.drop_column("space_assignment_rules", "auto_assign_on_first_message")
