"""add preferred locale and localized rubric artifacts

Revision ID: c4f9d2a76b10
Revises: a2e2b7c9142a
Create Date: 2026-07-10 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4f9d2a76b10"
down_revision: Union[str, Sequence[str], None] = "a2e2b7c9142a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users",
        sa.Column(
            "preferred_locale",
            sa.String(length=16),
            server_default="en",
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "check_users_preferred_locale",
        "users",
        "preferred_locale IN ('en', 'zh-CN')",
    )
    for table_name, constraint_name in (
        ("judge_results", "check_judge_results_locale"),
        ("rubric_centroids", "check_rubric_centroids_locale"),
    ):
        op.add_column(
            table_name,
            sa.Column(
                "locale",
                sa.String(length=16),
                server_default="en",
                nullable=False,
            ),
        )
        op.create_index(
            op.f(f"ix_{table_name}_locale"),
            table_name,
            ["locale"],
            unique=False,
        )
        op.create_check_constraint(
            constraint_name,
            table_name,
            "locale IN ('en', 'zh-CN')",
        )


def downgrade() -> None:
    """Downgrade schema."""
    for table_name, constraint_name in (
        ("rubric_centroids", "check_rubric_centroids_locale"),
        ("judge_results", "check_judge_results_locale"),
    ):
        op.drop_constraint(constraint_name, table_name, type_="check")
        op.drop_index(op.f(f"ix_{table_name}_locale"), table_name=table_name)
        op.drop_column(table_name, "locale")
    op.drop_constraint("check_users_preferred_locale", "users", type_="check")
    op.drop_column("users", "preferred_locale")
