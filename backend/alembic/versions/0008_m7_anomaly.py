"""m7 anomaly detection: anomaly table

Revision ID: 0008_m7_anomaly
Revises: 0007_m6_security
Create Date: 2026-08-29
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0008_m7_anomaly"
down_revision: str | None = "0007_m6_security"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

kind = postgresql.ENUM(
    "contradiction", "revision", "sum_mismatch", "out_of_range", "trend_break",
    name="anomaly_kind", create_type=False,
)
severity = postgresql.ENUM("low", "medium", "high", name="anomaly_severity", create_type=False)
status = postgresql.ENUM(
    "open", "acknowledged", "resolved", "dismissed", name="anomaly_status", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    kind.create(bind, checkfirst=True)
    severity.create(bind, checkfirst=True)
    status.create(bind, checkfirst=True)
    ts = dict(server_default=sa.text("now()"), nullable=False)
    uid = postgresql.UUID(as_uuid=True)

    op.create_table(
        "anomaly",
        sa.Column("id", uid, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), **ts),
        sa.Column("updated_at", sa.DateTime(timezone=True), **ts),
        sa.Column("signature", sa.String(300), nullable=False),
        sa.Column("kind", kind, nullable=False),
        sa.Column("severity", severity, nullable=False, server_default="medium"),
        sa.Column("status", status, nullable=False, server_default="open"),
        sa.Column("title", sa.String(320), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False, server_default=""),
        sa.Column("entity_id", uid,
                  sa.ForeignKey("kg_entity.id", ondelete="SET NULL"), nullable=True),
        sa.Column("subsidiary_id", uid,
                  sa.ForeignKey("subsidiary.id", ondelete="SET NULL"), nullable=True),
        sa.Column("evidence", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("reviewed_by_id", uid,
                  sa.ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.UniqueConstraint("signature", name="uq_anomaly_signature"),
    )
    op.create_index("ix_anomaly_signature", "anomaly", ["signature"])
    op.create_index("ix_anomaly_kind", "anomaly", ["kind"])
    op.create_index("ix_anomaly_status", "anomaly", ["status"])


def downgrade() -> None:
    op.drop_table("anomaly")
    bind = op.get_bind()
    status.drop(bind, checkfirst=True)
    severity.drop(bind, checkfirst=True)
    kind.drop(bind, checkfirst=True)
