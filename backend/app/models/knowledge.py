"""The domain knowledge graph + the document vector store (M2).

`KGEntity` / `KGRelation` are a typed, temporally-valid graph built by
`app.services.knowledge` from *accepted* `ExtractionField` rows. Every node and
edge keeps a link back to the field (and document) it came from, so a downstream
answer or report figure is always traceable to `{document, page, bbox}`.

`DocChunk` holds embedded text spans for semantic retrieval (pgvector).
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import get_settings
from app.core.db import Base
from app.models.base import Timestamps, UUIDPk

_EMBED_DIM = get_settings().embed_dim


class EntityKind(enum.StrEnum):
    # named entities (deduplicated by normalized_key within a subsidiary scope)
    mine = "mine"
    block = "block"
    seam = "seam"
    mineral = "mineral"
    subsidiary = "subsidiary"
    officer = "officer"
    report = "report"          # a source Document
    inquiry = "inquiry"        # a parliamentary / administrative question
    # fact nodes (one per measurement, keyed by the extraction field)
    reserve = "reserve"
    production_figure = "production_figure"
    finding = "finding"


class Predicate(enum.StrEnum):
    located_in = "located_in"
    contains = "contains"
    has_reserve = "has_reserve"
    produces = "produces"
    for_mineral = "for_mineral"
    reported_in = "reported_in"     # fact/entity -> report (the traceability edge)
    responds_to = "responds_to"     # report -> inquiry
    authored_by = "authored_by"
    supersedes = "supersedes"
    mentions = "mentions"


class KGEntity(UUIDPk, Timestamps, Base):
    __tablename__ = "kg_entity"
    __table_args__ = (
        UniqueConstraint(
            "kind", "normalized_key", "subsidiary_id",
            name="uq_kg_entity_identity", postgresql_nulls_not_distinct=True,
        ),
    )

    kind: Mapped[EntityKind] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(320))
    normalized_key: Mapped[str] = mapped_column(String(320), index=True)
    attrs: Mapped[dict] = mapped_column(JSONB, default=dict)

    subsidiary_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("subsidiary.id", ondelete="SET NULL"), nullable=True
    )

    # provenance
    source_field_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("extraction_field.id", ondelete="SET NULL"), nullable=True
    )
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("document.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    confidence: Mapped[float] = mapped_column(Float, default=0.0)


class KGRelation(UUIDPk, Timestamps, Base):
    __tablename__ = "kg_relation"
    __table_args__ = (
        UniqueConstraint(
            "src_id", "dst_id", "predicate", "valid_from",
            name="uq_kg_relation_identity", postgresql_nulls_not_distinct=True,
        ),
    )

    src_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("kg_entity.id", ondelete="CASCADE"), index=True
    )
    dst_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("kg_entity.id", ondelete="CASCADE"), index=True
    )
    predicate: Mapped[Predicate] = mapped_column(String(32), index=True)

    # temporal validity ("as of" / "before" / "after" queries)
    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    attrs: Mapped[dict] = mapped_column(JSONB, default=dict)

    source_field_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("extraction_field.id", ondelete="SET NULL"), nullable=True
    )
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("document.id", ondelete="SET NULL"), nullable=True
    )
    confidence: Mapped[float] = mapped_column(Float, default=0.0)

    src: Mapped[KGEntity] = relationship(foreign_keys=[src_id])
    dst: Mapped[KGEntity] = relationship(foreign_keys=[dst_id])


class DocChunk(UUIDPk, Timestamps, Base):
    __tablename__ = "doc_chunk"
    __table_args__ = (
        UniqueConstraint("document_id", "chunk_index", name="uq_doc_chunk_identity"),
    )

    document_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("document.id", ondelete="CASCADE"), index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer)
    page_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    text: Mapped[str] = mapped_column(Text)
    char_count: Mapped[int] = mapped_column(Integer, default=0)
    embedding: Mapped[list[float]] = mapped_column(Vector(_EMBED_DIM))
    embed_model: Mapped[str] = mapped_column(String(96), default="")
    meta: Mapped[dict] = mapped_column(JSONB, default=dict)
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
