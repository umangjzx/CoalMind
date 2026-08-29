"""Admin console: overview, audit, user management, quality metrics (M6, FR-10/12)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import Principal, get_db, require_roles
from app.audit import record_event, verify_chain
from app.core.config import get_settings
from app.core.security import hash_password
from app.models import (
    AuditEvent,
    DocChunk,
    Document,
    DocumentStatus,
    ExtractionField,
    FieldStatus,
    KGEntity,
    KGRelation,
    QAPair,
    Report,
    Subsidiary,
    Topic,
    User,
    UserRole,
)
from app.schemas.admin import (
    AdminUser,
    AuditListResponse,
    AuditRow,
    ChainVerifyResponse,
    CreateUserRequest,
    ExtractionQuality,
    IngestionMonitor,
    IngestionRow,
    Overview,
    SecurityPosture,
    SetPasswordRequest,
    UpdateUserRequest,
)

router = APIRouter(tags=["admin"])

_admin_only = require_roles(UserRole.data_admin)
_admin_or_ministry = require_roles(UserRole.data_admin, UserRole.ministry_official)


def _counts(db: Session, col, model) -> dict[str, int]:
    return {
        str(k): v
        for k, v in db.execute(select(col, func.count()).select_from(model).group_by(col)).all()
    }


def _posture(db: Session) -> SecurityPosture:
    s = get_settings()
    hosted = s.llm_provider in ("anthropic", "openrouter")
    if hosted and not s.allow_third_party_api:
        effective = "blocked -> degraded (deterministic / search-only)"
    elif hosted:
        effective = "hosted"
    else:
        effective = "on-prem"
    chain = verify_chain(db)
    return SecurityPosture(
        auth_required=s.auth_required,
        llm_provider=s.llm_provider,
        allow_third_party_api=s.allow_third_party_api,
        llm_is_hosted=hosted,
        llm_effective=effective,
        embeddings_provider=s.embed_provider,
        embeddings_on_prem=s.embed_provider in ("fastembed", "ollama"),
        audit_chain_ok=chain["ok"],
        audit_events=chain["checked"],
    )


@router.get("/overview", response_model=Overview)
def overview(db: Session = Depends(get_db), _: Principal = Depends(_admin_or_ministry)) -> Overview:
    return Overview(
        documents_by_status=_counts(db, Document.status, Document),
        fields_by_status=_counts(db, ExtractionField.status, ExtractionField),
        review_queue=db.execute(
            select(func.count()).select_from(ExtractionField)
            .where(ExtractionField.status == FieldStatus.needs_review)
        ).scalar_one(),
        kg_entities=db.execute(select(func.count()).select_from(KGEntity)).scalar_one(),
        kg_relations=db.execute(select(func.count()).select_from(KGRelation)).scalar_one(),
        doc_chunks=db.execute(select(func.count()).select_from(DocChunk)).scalar_one(),
        reports_by_status=_counts(db, Report.status, Report),
        qa_by_status=_counts(db, QAPair.status, QAPair),
        topics=db.execute(select(func.count()).select_from(Topic)).scalar_one(),
        subsidiaries=db.execute(select(func.count()).select_from(Subsidiary)).scalar_one(),
        users=db.execute(select(func.count()).select_from(User)).scalar_one(),
        security=_posture(db),
    )


@router.get("/security", response_model=SecurityPosture)
def security(db: Session = Depends(get_db), _: Principal = Depends(_admin_or_ministry)):
    return _posture(db)


@router.get("/audit", response_model=AuditListResponse)
def audit(
    action: str | None = None,
    actor: str | None = None,
    target_id: str | None = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    _: Principal = Depends(_admin_or_ministry),
) -> AuditListResponse:
    q = select(AuditEvent)
    if action:
        q = q.where(AuditEvent.action == action)
    if actor:
        q = q.where(AuditEvent.actor == actor)
    if target_id:
        q = q.where(AuditEvent.target_id == target_id)
    total = db.execute(select(func.count()).select_from(q.subquery())).scalar_one()
    rows = db.execute(
        q.order_by(AuditEvent.seq.desc()).limit(min(limit, 500)).offset(offset)
    ).scalars().all()
    return AuditListResponse(items=[AuditRow.model_validate(r) for r in rows], total=total)


@router.get("/audit/verify", response_model=ChainVerifyResponse)
def audit_verify(db: Session = Depends(get_db), _: Principal = Depends(_admin_or_ministry)):
    return ChainVerifyResponse(**verify_chain(db))


# --- user management -----------------------------------------------------

def _admin_user(u: User) -> AdminUser:
    out = AdminUser.model_validate(u)
    out.has_password = bool(u.hashed_password)
    return out


@router.get("/users", response_model=list[AdminUser])
def list_users(db: Session = Depends(get_db), _: Principal = Depends(_admin_only)):
    rows = db.execute(select(User).order_by(User.email)).scalars().all()
    return [_admin_user(u) for u in rows]


def _valid_role(role: str) -> UserRole:
    try:
        return UserRole(role)
    except ValueError as exc:
        raise HTTPException(422, f"unknown role: {role}") from exc


@router.post("/users", response_model=AdminUser, status_code=201)
def create_user(
    body: CreateUserRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(_admin_only),
) -> AdminUser:
    email = body.email.strip().lower()
    if db.execute(select(User).where(User.email == email)).scalar_one_or_none():
        raise HTTPException(409, "email already registered")
    user = User(
        email=email, full_name=body.full_name, role=_valid_role(body.role),
        subsidiary_id=body.subsidiary_id, hashed_password=hash_password(body.password),
        is_active=True,
    )
    db.add(user)
    db.flush()
    record_event(db, actor=principal.email, action="admin.user_created",
                 target_type="app_user", target_id=str(user.id),
                 meta={"email": email, "role": body.role})
    db.commit()
    return _admin_user(user)


@router.patch("/users/{user_id}", response_model=AdminUser)
def update_user(
    user_id: uuid.UUID,
    body: UpdateUserRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(_admin_only),
) -> AdminUser:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "user not found")
    changed: dict[str, object] = {}
    if body.full_name is not None:
        user.full_name = body.full_name
        changed["full_name"] = body.full_name
    if body.role is not None:
        user.role = _valid_role(body.role)
        changed["role"] = body.role
    if body.subsidiary_id is not None or body.model_fields_set.__contains__("subsidiary_id"):
        user.subsidiary_id = body.subsidiary_id
        changed["subsidiary_id"] = str(body.subsidiary_id) if body.subsidiary_id else None
    if body.is_active is not None:
        user.is_active = body.is_active
        changed["is_active"] = body.is_active
    record_event(db, actor=principal.email, action="admin.user_updated",
                 target_type="app_user", target_id=str(user.id), meta=changed)
    db.commit()
    return _admin_user(user)


@router.post("/users/{user_id}/password", response_model=AdminUser)
def set_password(
    user_id: uuid.UUID,
    body: SetPasswordRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(_admin_only),
) -> AdminUser:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "user not found")
    if len(body.password) < 6:
        raise HTTPException(422, "password too short")
    user.hashed_password = hash_password(body.password)
    record_event(db, actor=principal.email, action="admin.password_reset",
                 target_type="app_user", target_id=str(user.id))
    db.commit()
    return _admin_user(user)


# --- quality / ingestion monitoring -------------------------------------

@router.get("/extraction-quality", response_model=ExtractionQuality)
def extraction_quality(db: Session = Depends(get_db), _: Principal = Depends(_admin_or_ministry)):
    total = db.execute(select(func.count()).select_from(ExtractionField)).scalar_one()
    if total == 0:
        return ExtractionQuality(total_fields=0, auto_accept_rate=0.0, mean_confidence=0.0,
                                 review_outcomes={}, ocr_page_ratio=0.0, by_doc_type={})
    by_status = _counts(db, ExtractionField.status, ExtractionField)
    auto = by_status.get("auto_accepted", 0) + by_status.get("verified", 0)
    mean_conf = db.execute(select(func.avg(ExtractionField.confidence))).scalar_one() or 0.0

    ocr = db.execute(
        select(func.count()).select_from(ExtractionField)
        .where(ExtractionField.source_kind == "ocr")
    ).scalar_one()

    by_type: dict[str, dict[str, float]] = {}
    rows = db.execute(
        select(Document.doc_type, func.count(ExtractionField.id),
               func.avg(ExtractionField.confidence))
        .join(ExtractionField, ExtractionField.document_id == Document.id)
        .group_by(Document.doc_type)
    ).all()
    for dtype, n, avg in rows:
        by_type[dtype or "unknown"] = {
            "fields": float(n), "mean_confidence": round(float(avg or 0), 3),
        }

    return ExtractionQuality(
        total_fields=total,
        auto_accept_rate=round(auto / total, 3),
        mean_confidence=round(float(mean_conf), 3),
        review_outcomes={
            "verified": by_status.get("verified", 0),
            "rejected": by_status.get("rejected", 0),
            "pending": by_status.get("needs_review", 0),
        },
        ocr_page_ratio=round(ocr / total, 3),
        by_doc_type=by_type,
    )


@router.get("/ingestion", response_model=IngestionMonitor)
def ingestion_monitor(
    limit: int = Query(30, le=200),
    db: Session = Depends(get_db),
    _: Principal = Depends(_admin_or_ministry),
) -> IngestionMonitor:
    rows = db.execute(
        select(Document).order_by(Document.created_at.desc()).limit(limit)
    ).scalars().all()
    failed = db.execute(
        select(func.count()).select_from(Document)
        .where(Document.status == DocumentStatus.failed)
    ).scalar_one()
    items = []
    for d in rows:
        p = (d.meta or {}).get("pipeline", {})
        items.append(IngestionRow(
            id=d.id, filename=d.original_filename, doc_type=d.doc_type, status=d.status,
            fields=p.get("fields_extracted", 0), needs_review=p.get("fields_needs_review", 0),
            ocr_pages=p.get("ocr_pages", 0), error=d.error, created_at=d.created_at,
        ))
    return IngestionMonitor(items=items, failed=failed)
