"""m3 report generation: report, report_version

Revision ID: 0004_m3_reports
Revises: 0003_m2_knowledge
Create Date: 2026-08-29
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004_m3_reports"
down_revision: str | None = "0003_m2_knowledge"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

report_status = postgresql.ENUM("draft", "in_review", "final", name="report_status",
                                create_type=False)
version_author = postgresql.ENUM("ai", "human", name="version_author", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    report_status.create(bind, checkfirst=True)
    version_author.create(bind, checkfirst=True)
    ts = dict(server_default=sa.text("now()"), nullable=False)
    uid = postgresql.UUID(as_uuid=True)

    op.create_table(
        "report",
        sa.Column("id", uid, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), **ts),
        sa.Column("updated_at", sa.DateTime(timezone=True), **ts),
        sa.Column("title", sa.String(320), nullable=False),
        sa.Column("template_key", sa.String(64), nullable=False),
        sa.Column("status", report_status, nullable=False, server_default="draft"),
        sa.Column("params", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("subsidiary_id", uid,
                  sa.ForeignKey("subsidiary.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by_id", uid,
                  sa.ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("current_version_id", uid, nullable=True),  # FK added after report_version
        sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finalized_by_id", uid,
                  sa.ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_report_template_key", "report", ["template_key"])
    op.create_index("ix_report_status", "report", ["status"])

    op.create_table(
        "report_version",
        sa.Column("id", uid, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), **ts),
        sa.Column("report_id", uid,
                  sa.ForeignKey("report.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("author_kind", version_author, nullable=False, server_default="ai"),
        sa.Column("author_id", uid,
                  sa.ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("summary", sa.String(400), nullable=False, server_default=""),
        sa.Column("blocks", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("content_md", sa.Text(), nullable=False, server_default=""),
        sa.Column("citations", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("unresolved", postgresql.JSONB(), nullable=False, server_default="[]"),
    )
    op.create_index("ix_report_version_report_id", "report_version", ["report_id"])

    op.create_foreign_key(
        "fk_report_current_version", "report", "report_version",
        ["current_version_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_report_current_version", "report", type_="foreignkey")
    op.drop_table("report_version")
    op.drop_table("report")
    bind = op.get_bind()
    version_author.drop(bind, checkfirst=True)
    report_status.drop(bind, checkfirst=True)
