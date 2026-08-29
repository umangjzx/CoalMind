"""Read helpers over the knowledge graph + vector index.

These are the primitives the RAG query engine (M4) composes; the M2 API exposes
them directly for browsing and for verifying the graph is being built correctly.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import DocChunk, Document, KGEntity, KGRelation
from app.services.embeddings import get_embedder


@dataclass(slots=True)
class Neighbor:
    relation: KGRelation
    entity: KGEntity
    direction: str  # "out" (entity is dst) | "in" (entity is src)


def get_entity(db: Session, entity_id: uuid.UUID) -> KGEntity | None:
    return db.get(KGEntity, entity_id)


def search_entities(
    db: Session,
    *,
    kind: str | None = None,
    subsidiary_id: uuid.UUID | None = None,
    q: str | None = None,
    limit: int = 50,
) -> list[KGEntity]:
    stmt = select(KGEntity)
    if kind:
        stmt = stmt.where(KGEntity.kind == kind)
    if subsidiary_id:
        stmt = stmt.where(KGEntity.subsidiary_id == subsidiary_id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(func.lower(KGEntity.name).like(like), KGEntity.normalized_key.like(like))
        )
    stmt = stmt.order_by(KGEntity.kind, KGEntity.name).limit(min(limit, 200))
    return list(db.execute(stmt).scalars().all())


def neighbors(
    db: Session,
    entity_id: uuid.UUID,
    *,
    predicate: str | None = None,
    as_of: date | None = None,
) -> list[Neighbor]:
    out: list[Neighbor] = []
    for rel in db.execute(
        select(KGRelation).where(KGRelation.src_id == entity_id)
    ).scalars():
        if predicate and rel.predicate != predicate:
            continue
        if as_of and not _valid_at(rel, as_of):
            continue
        ent = db.get(KGEntity, rel.dst_id)
        if ent:
            out.append(Neighbor(rel, ent, "out"))
    for rel in db.execute(
        select(KGRelation).where(KGRelation.dst_id == entity_id)
    ).scalars():
        if predicate and rel.predicate != predicate:
            continue
        if as_of and not _valid_at(rel, as_of):
            continue
        ent = db.get(KGEntity, rel.src_id)
        if ent:
            out.append(Neighbor(rel, ent, "in"))
    return out


def _valid_at(rel: KGRelation, at: date) -> bool:
    if rel.valid_from and at < rel.valid_from:
        return False
    if rel.valid_to and at > rel.valid_to:
        return False
    return True


def full_graph(db: Session, *, limit: int = 400) -> dict:
    """The whole graph (entity + report nodes are small enough to send at once)."""
    ents = list(db.execute(select(KGEntity).limit(limit)).scalars())
    ent_ids = {e.id for e in ents}
    rels = [
        r
        for r in db.execute(select(KGRelation)).scalars()
        if r.src_id in ent_ids and r.dst_id in ent_ids
    ]
    return {"entities": ents, "relations": rels}


def document_subgraph(db: Session, document_id: uuid.UUID) -> dict:
    rels = list(
        db.execute(
            select(KGRelation).where(KGRelation.document_id == document_id)
        ).scalars()
    )
    ent_ids = {r.src_id for r in rels} | {r.dst_id for r in rels}
    ents = (
        list(db.execute(select(KGEntity).where(KGEntity.id.in_(ent_ids))).scalars())
        if ent_ids
        else []
    )
    return {"entities": ents, "relations": rels}


@dataclass(slots=True)
class ChunkHit:
    chunk: DocChunk
    document: Document
    score: float  # cosine similarity, 1.0 = identical


def vector_search(
    db: Session,
    query_text: str,
    *,
    k: int = 8,
    subsidiary_id: uuid.UUID | None = None,
    include_national: bool = True,
) -> list[ChunkHit]:
    vec = get_embedder().embed_one(query_text)
    dist = DocChunk.embedding.cosine_distance(vec).label("dist")
    stmt = select(DocChunk, dist).join(Document, DocChunk.document_id == Document.id)
    if subsidiary_id is not None:
        scope = [Document.subsidiary_id == subsidiary_id]
        if include_national:
            scope.append(Document.subsidiary_id.is_(None))
        stmt = stmt.where(or_(*scope))
    stmt = stmt.order_by(dist).limit(min(k, 50))

    hits: list[ChunkHit] = []
    for chunk, d in db.execute(stmt).all():
        hits.append(ChunkHit(chunk=chunk, document=db.get(Document, chunk.document_id),
                             score=round(1.0 - float(d), 4)))
    return hits


def graph_stats(db: Session) -> dict:
    ent_by_kind = dict(
        db.execute(select(KGEntity.kind, func.count()).group_by(KGEntity.kind)).all()
    )
    rel_by_pred = dict(
        db.execute(select(KGRelation.predicate, func.count()).group_by(KGRelation.predicate)).all()
    )
    chunks = db.execute(select(func.count()).select_from(DocChunk)).scalar_one()
    return {
        "entities": sum(ent_by_kind.values()),
        "entities_by_kind": ent_by_kind,
        "relations": sum(rel_by_pred.values()),
        "relations_by_predicate": rel_by_pred,
        "chunks": chunks,
    }
