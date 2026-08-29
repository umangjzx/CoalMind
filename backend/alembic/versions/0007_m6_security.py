"""m6 security: app_user.last_login_at

Revision ID: 0007_m6_security
Revises: 0006_m5_topics
Create Date: 2026-08-29
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007_m6_security"
down_revision: str | None = "0006_m5_topics"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "app_user",
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_audit_event_target_id", "audit_event", ["target_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_event_target_id", table_name="audit_event")
    op.drop_column("app_user", "last_login_at")
