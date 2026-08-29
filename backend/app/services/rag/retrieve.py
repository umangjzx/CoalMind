"""Retrieve evidence for a question: graph facts (high precision) + vector passages."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Document, EntityKind, ExtractionField, KGEntity, Predicate
from app.services.knowledge import queries as kq

_NAMED_KINDS = (
    EntityKind.mine, EntityKind.block, EntityKind.seam,
    EntityKind.mineral, EntityKind.subsidiary,
)
_FACT_PREDICATES = (Predicate.has_reserve, Predicate.produces, Predicate.reported_in)

# structural words that appear in many entity names — matching on these alone links
# an entity to any question that merely says "block" / "mine" / "reserve".
_GENERIC_NAME_TOKENS = frozenset({
    "block", "blocks", "mine", "mines", "opencast", "colliery", "collieries",
    "project", "underground", "expansion", "seam", "seams", "coalfield",
    "coalfields", "limited", "area", "reserve", "reserves", "coal", "the",
})


@dataclass(slots=True)
class Evidence:
    kind: str  # "fact" | "passage"
    text: str
    score: float  # 0..1 relevance / confidence
    document_id: str | None = None
    document_filename: str | None = None
    page_no: int | None = None
    source_field_id: str | None = None  # set for graph facts -> exact traceability
    entity: str | None = None


@dataclass(slots=True)
class Retrieval:
    question: str
    facts: list[Evidence] = field(default_factory=list)
    passages: list[Evidence] = field(default_factory=list)

    @property
    def all(self) -> list[Evidence]:
        return sorted([*self.facts, *self.passages], key=lambda e: e.score, reverse=True)

    @property
    def top_score(self) -> float:
        return self.all[0].score if self.all else 0.0


def _tokens(s: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", s.lower()) if len(t) > 2}


def match_entities(db: Session, question: str, subsidiary_id: uuid.UUID | None) -> list[KGEntity]:
    q_tokens = _tokens(question)
    stmt = select(KGEntity).where(KGEntity.kind.in_(_NAMED_KINDS))
    if subsidiary_id is not None:
        stmt = stmt.where(
            (KGEntity.subsidiary_id == subsidiary_id) | (KGEntity.subsidiary_id.is_(None))
        )
    hits: list[KGEntity] = []
    for ent in db.execute(stmt).scalars():
        key_tokens = (_tokens(ent.normalized_key) or _tokens(ent.name)) - _GENERIC_NAME_TOKENS
        # match only on a *distinctive* token of the entity name (not "block"/"mine"/...)
        if key_tokens & q_tokens:
            hits.append(ent)
    return hits


def _fact_evidence(db: Session, ent: KGEntity) -> list[Evidence]:
    out: list[Evidence] = []
    for n in kq.neighbors(db, ent.id):
        if n.relation.predicate not in _FACT_PREDICATES:
            continue
        fact = n.entity
        if fact.kind not in (EntityKind.reserve, EntityKind.production_figure, EntityKind.finding):
            continue
        fid = fact.source_field_id
        f = db.get(ExtractionField, fid) if fid else None
        doc = db.get(Document, f.document_id) if f else None
        a = fact.attrs or {}
        val = a.get("quantity", a.get("value"))
        unit = str(a.get("unit", "")).replace("_", " ")
        label = a.get("category") or a.get("metric") or fact.name
        text = f"{ent.name}: {label} = {val} {unit}".strip()
        out.append(
            Evidence(
                kind="fact",
                text=text,
                score=round((f.confidence if f else 0.6) * 0.98, 3),
                document_id=str(f.document_id) if f else None,
                document_filename=doc.original_filename if doc else None,
                page_no=f.page_no if f else None,
                source_field_id=str(fid) if fid else None,
                entity=ent.name,
            )
        )
    return out


def retrieve(
    db: Session,
    question: str,
    *,
    subsidiary_id: uuid.UUID | None = None,
    k: int = 6,
) -> Retrieval:
    r = Retrieval(question=question)

    seen_facts: set[tuple] = set()
    for ent in match_entities(db, question, subsidiary_id):
        for ev in _fact_evidence(db, ent):
            key = (ev.entity, ev.text)
            if key not in seen_facts:
                seen_facts.add(key)
                r.facts.append(ev)

    for hit in kq.vector_search(db, question, k=k, subsidiary_id=subsidiary_id):
        r.passages.append(
            Evidence(
                kind="passage",
                text=hit.chunk.text.strip(),
                score=round(max(0.0, hit.score), 3),
                document_id=str(hit.document.id),
                document_filename=hit.document.original_filename,
                page_no=hit.chunk.page_no,
            )
        )
    return r
