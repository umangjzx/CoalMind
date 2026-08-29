"""m2 knowledge layer: kg_entity, kg_relation, doc_chunk (pgvector)

Revision ID: 0003_m2_knowledge
Revises: 0da5f9fedde9
Create Date: 2026-08-29
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003_m2_knowledge"
down_revision: str | None = "0da5f9fedde9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# NB: embedding dimension is fixed here; changing EMBED_DIM needs a new migration.
EMBED_DIM = 384


def upgrade() -> None:
    ts = dict(server_default=sa.text("now()"), nullable=False)

    op.create_table(
        "kg_entity",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), **ts),
        sa.Column("updated_at", sa.DateTime(timezone=True), **ts),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("name", sa.String(320), nullable=False),
        sa.Column("normalized_key", sa.String(320), nullable=False),
        sa.Column("attrs", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column(
            "subsidiary_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("subsidiary.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "source_field_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("extraction_field.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "document_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("document.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0"),
        sa.UniqueConstraint(
            "kind", "normalized_key", "subsidiary_id",
            name="uq_kg_entity_identity", postgresql_nulls_not_distinct=True,
        ),
    )
    op.create_index("ix_kg_entity_kind", "kg_entity", ["kind"])
    op.create_index("ix_kg_entity_normalized_key", "kg_entity", ["normalized_key"])
    op.create_index("ix_kg_entity_document_id", "kg_entity", ["document_id"])

    op.create_table(
        "kg_relation",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), **ts),
        sa.Column("updated_at", sa.DateTime(timezone=True), **ts),
        sa.Column(
            "src_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("kg_entity.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "dst_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("kg_entity.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("predicate", sa.String(32), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=True),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("attrs", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column(
            "source_field_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("extraction_field.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "document_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("document.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0"),
        sa.UniqueConstraint(
            "src_id", "dst_id", "predicate", "valid_from",
            name="uq_kg_relation_identity", postgresql_nulls_not_distinct=True,
        ),
    )
    op.create_index("ix_kg_relation_src_id", "kg_relation", ["src_id"])
    op.create_index("ix_kg_relation_dst_id", "kg_relation", ["dst_id"])
    op.create_index("ix_kg_relation_predicate", "kg_relation", ["predicate"])

    op.create_table(
        "doc_chunk",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), **ts),
        sa.Column("updated_at", sa.DateTime(timezone=True), **ts),
        sa.Column(
            "document_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("document.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("page_no", sa.Integer(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("char_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("embedding", Vector(EMBED_DIM), nullable=False),
        sa.Column("embed_model", sa.String(96), nullable=False, server_default=""),
        sa.Column("meta", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("indexed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("document_id", "chunk_index", name="uq_doc_chunk_identity"),
    )
    op.create_index("ix_doc_chunk_document_id", "doc_chunk", ["document_id"])
    op.execute(
        "CREATE INDEX ix_doc_chunk_embedding_hnsw ON doc_chunk "
        "USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.drop_table("doc_chunk")
    op.drop_table("kg_relation")
    op.drop_table("kg_entity")
