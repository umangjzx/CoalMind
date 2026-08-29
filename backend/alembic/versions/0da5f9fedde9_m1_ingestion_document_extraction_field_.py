"""m1 ingestion: document + extraction_field columns

Revision ID: 0da5f9fedde9
Revises: 0001_baseline
Create Date: 2026-08-29
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0da5f9fedde9"
down_revision: str | None = "0001_baseline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "document",
        sa.Column("error", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "document",
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
    )

    ef_cols = [
        sa.Column("label", sa.String(160), nullable=False, server_default=""),
        sa.Column("extractor", sa.String(64), nullable=False, server_default=""),
        sa.Column("source_kind", sa.String(16), nullable=False, server_default="pdf_text"),
        sa.Column("original_value_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("review_note", sa.Text(), nullable=False, server_default=""),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    ]
    for col in ef_cols:
        op.add_column("extraction_field", col)


def downgrade() -> None:
    for name in ("reviewed_at", "review_note", "original_value_text", "source_kind",
                 "extractor", "label"):
        op.drop_column("extraction_field", name)
    op.drop_column("document", "processed_at")
    op.drop_column("document", "error")
