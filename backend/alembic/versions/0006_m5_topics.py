"""m5 topics & word cloud: topic, topic_doc

Revision ID: 0006_m5_topics
Revises: 0005_m4_query
Create Date: 2026-08-29
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0006_m5_topics"
down_revision: str | None = "0005_m4_query"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    ts = dict(server_default=sa.text("now()"), nullable=False)
    uid = postgresql.UUID(as_uuid=True)

    op.create_table(
        "topic",
        sa.Column("id", uid, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), **ts),
        sa.Column("updated_at", sa.DateTime(timezone=True), **ts),
        sa.Column("run_id", uid, nullable=False),
        sa.Column("topic_index", sa.Integer(), nullable=False),
        sa.Column("engine", sa.String(16), nullable=False, server_default="nmf"),
        sa.Column("label", sa.String(200), nullable=False, server_default=""),
        sa.Column("terms", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("doc_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("first_seen", sa.Date(), nullable=True),
        sa.Column("last_seen", sa.Date(), nullable=True),
        sa.UniqueConstraint("run_id", "topic_index", name="uq_topic_run_index"),
    )
    op.create_index("ix_topic_run_id", "topic", ["run_id"])

    op.create_table(
        "topic_doc",
        sa.Column("topic_id", uid, sa.ForeignKey("topic.id", ondelete="CASCADE"),
                  primary_key=True),
        sa.Column("document_id", uid, sa.ForeignKey("document.id", ondelete="CASCADE"),
                  primary_key=True),
        sa.Column("weight", sa.Float(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("topic_doc")
    op.drop_table("topic")
