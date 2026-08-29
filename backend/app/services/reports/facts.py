"""Pull the facts a template needs.

Structure (which block is in which mine, what seam it contains) comes from the
knowledge graph. Figures come from the underlying `ExtractionField` rows so a
report reflects their *live* verification status — a cited field that is still
`needs_review` blocks finalisation.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EntityKind, ExtractionField, KGEntity, KGRelation, Predicate
from app.services.knowledge import queries as kq

RESERVE_KEYS = (
    "proved_reserve", "indicated_reserve", "inferred_reserve", "total_geological_reserve",
)
PRODUCTION_KEYS = (
    "coal_production_actual", "ob_removal_actual", "stripping_ratio",
    "cil_production", "cil_target",
)


@dataclass(slots=True)
class Figure:
    field: ExtractionField
    label: str


def targets(db: Session, kind: str) -> list[dict]:
    rows = (
        db.execute(select(KGEntity).where(KGEntity.kind == kind).order_by(KGEntity.name))
        .scalars()
        .all()
    )
    return [
        {
            "id": str(e.id),
            "name": e.name,
            "subsidiary_id": str(e.subsidiary_id) if e.subsidiary_id else None,
        }
        for e in rows
    ]


def resolve_anchor(db: Session, params: dict) -> KGEntity | None:
    for key in ("block_id", "mine_id", "subsidiary_id", "entity_id"):
        if params.get(key):
            ent = db.get(KGEntity, uuid.UUID(str(params[key])))
            if ent is not None:
                return ent
    name = params.get("mine_name") or params.get("target_name")
    if name:
        return db.execute(
            select(KGEntity).where(KGEntity.name.ilike(f"%{name}%")).limit(1)
        ).scalar_one_or_none()
    return None


def anchor_documents(db: Session, anchor: KGEntity) -> set[uuid.UUID]:
    """Documents that report on this entity (via `reported_in` edges) + its own doc."""
    docs: set[uuid.UUID] = set()
    if anchor.document_id:
        docs.add(anchor.document_id)
    for rel in db.execute(
        select(KGRelation).where(
            KGRelation.src_id == anchor.id, KGRelation.predicate == Predicate.reported_in
        )
    ).scalars():
        if rel.document_id:
            docs.add(rel.document_id)
    # also documents of directly-related fact nodes (reserves / production figures)
    for n in kq.neighbors(db, anchor.id):
        if n.entity.document_id:
            docs.add(n.entity.document_id)
    return docs


def figures_on(
    db: Session, doc_ids: set[uuid.UUID], field_keys: tuple[str, ...]
) -> list[ExtractionField]:
    if not doc_ids:
        return []
    return list(
        db.execute(
            select(ExtractionField)
            .where(
                ExtractionField.document_id.in_(doc_ids),
                ExtractionField.field_key.in_(field_keys),
            )
            .order_by(ExtractionField.field_key)
        ).scalars()
    )


def seam_and_grade(db: Session, block: KGEntity) -> tuple[KGEntity | None, KGEntity | None]:
    seam = mineral = None
    for n in kq.neighbors(db, block.id, predicate=Predicate.contains):
        if n.entity.kind == EntityKind.seam:
            seam = n.entity
    target = seam or block
    for n in kq.neighbors(db, target.id, predicate=Predicate.for_mineral):
        if n.entity.kind == EntityKind.mineral:
            mineral = n.entity
    return seam, mineral


def subsidiary_of(db: Session, anchor: KGEntity) -> KGEntity | None:
    if anchor.kind == EntityKind.subsidiary:
        return anchor
    for n in kq.neighbors(db, anchor.id, predicate=Predicate.located_in):
        if n.entity.kind == EntityKind.subsidiary:
            return n.entity
        if n.entity.kind == EntityKind.mine:
            for m in kq.neighbors(db, n.entity.id, predicate=Predicate.located_in):
                if m.entity.kind == EntityKind.subsidiary:
                    return m.entity
    return None


def parent_mine(db: Session, block: KGEntity) -> KGEntity | None:
    for n in kq.neighbors(db, block.id, predicate=Predicate.located_in):
        if n.entity.kind == EntityKind.mine:
            return n.entity
    return None


def reserve_as_on(db: Session, doc_ids: set[uuid.UUID]) -> date | None:
    row = db.execute(
        select(ExtractionField)
        .where(
            ExtractionField.document_id.in_(doc_ids or {uuid.uuid4()}),
            ExtractionField.field_key == "reserves_as_on",
        )
        .limit(1)
    ).scalar_one_or_none()
    if row and row.value_json and row.value_json.get("iso"):
        try:
            return date.fromisoformat(row.value_json["iso"])
        except ValueError:
            return None
    return None
