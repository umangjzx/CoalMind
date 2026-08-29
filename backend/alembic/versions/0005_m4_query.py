"""m4 query & response: qa_pair (verified-answer cache)

Revision ID: 0005_m4_query
Revises: 0004_m3_reports
Create Date: 2026-08-29
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0005_m4_query"
down_revision: str | None = "0004_m3_reports"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EMBED_DIM = 384
qa_status = postgresql.ENUM(
    "answered", "verified", "insufficient", "rejected", name="qa_status", create_type=False
)


def upgrade() -> None:
    qa_status.create(op.get_bind(), checkfirst=True)
    ts = dict(server_default=sa.text("now()"), nullable=False)
    uid = postgresql.UUID(as_uuid=True)

    op.create_table(
        "qa_pair",
        sa.Column("id", uid, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), **ts),
        sa.Column("updated_at", sa.DateTime(timezone=True), **ts),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("question_norm", sa.String(500), nullable=False),
        sa.Column("question_embedding", Vector(EMBED_DIM), nullable=False),
        sa.Column("answer_md", sa.Text(), nullable=False, server_default=""),
        sa.Column("citations", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("evidence", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0"),
        sa.Column("status", qa_status, nullable=False, server_default="answered"),
        sa.Column("answer_mode", sa.String(16), nullable=False, server_default="rag"),
        sa.Column("subsidiary_id", uid,
                  sa.ForeignKey("subsidiary.id", ondelete="SET NULL"), nullable=True),
        sa.Column("asked_by_id", uid,
                  sa.ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("verified_by_id", uid,
                  sa.ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hit_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_qa_pair_question_norm", "qa_pair", ["question_norm"])
    op.create_index("ix_qa_pair_status", "qa_pair", ["status"])
    op.execute(
        "CREATE INDEX ix_qa_pair_embedding_hnsw ON qa_pair "
        "USING hnsw (question_embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.drop_table("qa_pair")
    qa_status.drop(op.get_bind(), checkfirst=True)
