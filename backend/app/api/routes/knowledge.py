"""Knowledge-graph + vector-index browsing endpoints (M2).

These expose the primitives the RAG engine (M4) will compose, and let a reviewer
confirm the graph is being built correctly from the extractions.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models import Document
from app.schemas.knowledge import (
    ChunkHitOut,
    EntityDetail,
    EntityListResponse,
    EntityOut,
    GraphStats,
    NeighborOut,
    RelationOut,
    SearchResponse,
    SubgraphResponse,
)
from app.services.knowledge import queries as kq

router = APIRouter(tags=["knowledge"])


@router.get("/stats", response_model=GraphStats)
def stats(db: Session = Depends(get_db)) -> GraphStats:
    return GraphStats(**kq.graph_stats(db))


@router.get("/entities", response_model=EntityListResponse)
def list_entities(
    kind: str | None = None,
    subsidiary_id: uuid.UUID | None = None,
    q: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> EntityListResponse:
    rows = kq.search_entities(db, kind=kind, subsidiary_id=subsidiary_id, q=q, limit=limit)
    return EntityListResponse(items=[EntityOut.model_validate(r) for r in rows], total=len(rows))


@router.get("/entities/{entity_id}", response_model=EntityDetail)
def entity_detail(
    entity_id: uuid.UUID,
    as_of: str | None = Query(default=None, description="ISO date; filter temporally-valid edges"),
    db: Session = Depends(get_db),
) -> EntityDetail:
    ent = kq.get_entity(db, entity_id)
    if ent is None:
        raise HTTPException(404, "entity not found")
    from datetime import date

    aod = date.fromisoformat(as_of) if as_of else None
    nbrs = kq.neighbors(db, entity_id, as_of=aod)
    return EntityDetail(
        entity=EntityOut.model_validate(ent),
        neighbors=[
            NeighborOut(
                direction=n.direction,
                predicate=n.relation.predicate,
                valid_from=n.relation.valid_from,
                entity=EntityOut.model_validate(n.entity),
                relation_id=n.relation.id,
                source_field_id=n.relation.source_field_id,
            )
            for n in nbrs
        ],
    )


@router.get("/documents/{document_id}/subgraph", response_model=SubgraphResponse)
def document_subgraph(document_id: uuid.UUID, db: Session = Depends(get_db)) -> SubgraphResponse:
    if db.get(Document, document_id) is None:
        raise HTTPException(404, "document not found")
    sg = kq.document_subgraph(db, document_id)
    return SubgraphResponse(
        entities=[EntityOut.model_validate(e) for e in sg["entities"]],
        relations=[RelationOut.model_validate(r) for r in sg["relations"]],
    )


@router.get("/search", response_model=SearchResponse)
def search(
    q: str = Query(..., min_length=2),
    k: int = 8,
    subsidiary_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
) -> SearchResponse:
    hits = kq.vector_search(db, q, k=k, subsidiary_id=subsidiary_id)
    return SearchResponse(
        query=q,
        hits=[
            ChunkHitOut(
                chunk_id=h.chunk.id,
                document_id=h.document.id,
                document_filename=h.document.original_filename,
                doc_type=h.document.doc_type,
                page_no=h.chunk.page_no,
                text=h.chunk.text,
                score=h.score,
            )
            for h in hits
        ],
    )
