"""Anomaly / inconsistency review endpoints (M7, FR-14).

An anomaly is a detected disagreement between historical and new data for the same
knowledge-graph entity. Detection is idempotent (``POST /anomalies/scan``); officers
work each row through open -> acknowledged / resolved / dismissed.
"""

from __future__ import annotations

import uuid
from collections import Counter
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, select
from sqlalchemy.orm import Session

from app.api.deps import (
    Principal,
    get_actor,
    get_db,
    get_principal,
    resolve_actor_id,
    visible_subsidiary_ids,
)
from app.audit import record_event
from app.models import Anomaly, AnomalyKind, AnomalySeverity, AnomalyStatus
from app.schemas.anomaly import (
    AnomalyListResponse,
    AnomalyOut,
    AnomalyReview,
    ScanResponse,
)
from app.services.anomaly import scan_anomalies

router = APIRouter(tags=["anomalies"])


def _scope(stmt, principal: Principal):
    """Restrict to the principal's own subsidiary + national (NULL) anomalies."""
    vis = visible_subsidiary_ids(principal)
    if vis is None:
        return stmt
    return stmt.where(
        (Anomaly.subsidiary_id.is_(None)) | (Anomaly.subsidiary_id.in_(vis))
    )


@router.get("", response_model=AnomalyListResponse)
def list_anomalies(
    status: AnomalyStatus | None = None,
    kind: AnomalyKind | None = None,
    severity: AnomalySeverity | None = None,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> AnomalyListResponse:
    base = _scope(select(Anomaly), principal)
    if status is not None:
        base = base.where(Anomaly.status == status)
    if kind is not None:
        base = base.where(Anomaly.kind == kind)
    if severity is not None:
        base = base.where(Anomaly.severity == severity)

    sev_rank = case(
        {AnomalySeverity.high: 0, AnomalySeverity.medium: 1, AnomalySeverity.low: 2},
        value=Anomaly.severity, else_=3,
    )
    status_rank = case(
        {AnomalyStatus.open: 0, AnomalyStatus.acknowledged: 1,
         AnomalyStatus.resolved: 2, AnomalyStatus.dismissed: 3},
        value=Anomaly.status, else_=4,
    )
    rows = db.execute(
        base.order_by(status_rank, sev_rank, Anomaly.updated_at.desc()).limit(limit)
    ).scalars().all()

    all_scoped = db.execute(_scope(select(Anomaly), principal)).scalars().all()
    return AnomalyListResponse(
        items=[AnomalyOut.model_validate(r) for r in rows],
        total=len(all_scoped),
        open_count=sum(1 for a in all_scoped if a.status == AnomalyStatus.open),
        by_kind=dict(Counter(a.kind.value for a in all_scoped)),
        by_severity=dict(Counter(a.severity.value for a in all_scoped)),
    )


@router.post("/scan", response_model=ScanResponse)
def scan(
    db: Session = Depends(get_db), actor: str = Depends(get_actor)
) -> ScanResponse:
    stats = scan_anomalies(db, actor=actor)
    db.commit()
    return ScanResponse(**stats)


@router.get("/{anomaly_id}", response_model=AnomalyOut)
def get_anomaly(
    anomaly_id: uuid.UUID,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> AnomalyOut:
    row = db.get(Anomaly, anomaly_id)
    if row is None:
        raise HTTPException(404, "anomaly not found")
    vis = visible_subsidiary_ids(principal)
    if vis is not None and row.subsidiary_id is not None and row.subsidiary_id not in vis:
        raise HTTPException(404, "anomaly not found")
    return AnomalyOut.model_validate(row)


@router.post("/{anomaly_id}/review", response_model=AnomalyOut)
def review_anomaly(
    anomaly_id: uuid.UUID,
    body: AnomalyReview,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
    actor: str = Depends(get_actor),
) -> AnomalyOut:
    row = db.get(Anomaly, anomaly_id)
    if row is None:
        raise HTTPException(404, "anomaly not found")
    vis = visible_subsidiary_ids(principal)
    if vis is not None and row.subsidiary_id is not None and row.subsidiary_id not in vis:
        raise HTTPException(404, "anomaly not found")
    if body.status == AnomalyStatus.open:
        raise HTTPException(422, "cannot set an anomaly back to 'open' by review")

    prev = row.status
    row.status = body.status
    row.note = body.note
    row.reviewed_by_id = resolve_actor_id(db, actor)
    row.reviewed_at = datetime.now(UTC)
    record_event(
        db, actor=actor, action="anomaly.review",
        target_type="anomaly", target_id=str(row.id),
        meta={"from": prev.value, "to": body.status.value, "note": body.note[:500]},
    )
    db.commit()
    db.refresh(row)
    return AnomalyOut.model_validate(row)
