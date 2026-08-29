"""Report Generation Platform endpoints (M3, FR-4/5/13)."""

from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_actor, get_db, resolve_actor_id
from app.models import Report, ReportVersion
from app.schemas.reports import (
    CreateReportRequest,
    DiffResponse,
    EditReportRequest,
    ReportDetail,
    ReportListResponse,
    ReportOut,
    TemplateOut,
    VersionOut,
    VersionSummary,
)
from app.services.reports import (
    add_human_edit,
    create_report,
    finalize_report,
    list_templates,
    rerender_report,
    version_diff,
)
from app.services.reports.engine import ReportError
from app.services.reports.render import render_html, to_docx, to_pdf

router = APIRouter(tags=["reports"])


def _detail(db: Session, report: Report) -> ReportDetail:
    cur = db.get(ReportVersion, report.current_version_id) if report.current_version_id else None
    d = ReportDetail.model_validate(report)
    d.current_version = VersionOut.model_validate(cur) if cur else None
    d.versions = [
        VersionSummary(
            id=v.id,
            version_no=v.version_no,
            author_kind=v.author_kind,
            summary=v.summary,
            created_at=v.created_at,
            unresolved_count=len(v.unresolved or []),
        )
        for v in report.versions
    ]
    return d


@router.get("/templates", response_model=list[TemplateOut])
def templates(db: Session = Depends(get_db)) -> list[TemplateOut]:
    return [TemplateOut(**t) for t in list_templates(db)]


@router.get("", response_model=ReportListResponse)
def list_reports(
    status: str | None = None, limit: int = 50, db: Session = Depends(get_db)
) -> ReportListResponse:
    q = select(Report)
    if status:
        q = q.where(Report.status == status)
    total = db.execute(select(func.count()).select_from(q.subquery())).scalar_one()
    rows = db.execute(q.order_by(Report.created_at.desc()).limit(min(limit, 200))).scalars().all()
    return ReportListResponse(items=[ReportOut.model_validate(r) for r in rows], total=total)


@router.post("", response_model=ReportDetail, status_code=201)
def create(
    body: CreateReportRequest,
    db: Session = Depends(get_db),
    actor: str = Depends(get_actor),
) -> ReportDetail:
    try:
        report = create_report(
            db,
            template_key=body.template_key,
            params=body.params,
            title=body.title,
            subsidiary_id=body.subsidiary_id,
            actor=actor,
            actor_id=resolve_actor_id(db, actor),
        )
    except ReportError as exc:
        raise HTTPException(422, str(exc)) from exc
    return _detail(db, report)


def _get_report(db: Session, report_id: uuid.UUID) -> Report:
    r = db.get(Report, report_id)
    if r is None:
        raise HTTPException(404, "report not found")
    return r


@router.get("/{report_id}", response_model=ReportDetail)
def get_report(report_id: uuid.UUID, db: Session = Depends(get_db)) -> ReportDetail:
    return _detail(db, _get_report(db, report_id))


@router.get("/{report_id}/versions/{version_no}", response_model=VersionOut)
def get_version(report_id: uuid.UUID, version_no: int, db: Session = Depends(get_db)) -> VersionOut:
    v = db.execute(
        select(ReportVersion).where(
            ReportVersion.report_id == report_id, ReportVersion.version_no == version_no
        )
    ).scalar_one_or_none()
    if v is None:
        raise HTTPException(404, "version not found")
    return VersionOut.model_validate(v)


@router.post("/{report_id}/rerender", response_model=ReportDetail)
def rerender(
    report_id: uuid.UUID, db: Session = Depends(get_db), actor: str = Depends(get_actor)
) -> ReportDetail:
    r = _get_report(db, report_id)
    try:
        rerender_report(db, r, actor=actor)
    except ReportError as exc:
        raise HTTPException(409, str(exc)) from exc
    return _detail(db, r)


@router.post("/{report_id}/edit", response_model=ReportDetail)
def edit(
    report_id: uuid.UUID,
    body: EditReportRequest,
    db: Session = Depends(get_db),
    actor: str = Depends(get_actor),
) -> ReportDetail:
    r = _get_report(db, report_id)
    try:
        add_human_edit(
            db,
            r,
            content_md=body.content_md,
            summary=body.summary,
            actor=actor,
            actor_id=resolve_actor_id(db, actor),
        )
    except ReportError as exc:
        raise HTTPException(409, str(exc)) from exc
    return _detail(db, r)


@router.post("/{report_id}/finalize", response_model=ReportDetail)
def finalize(
    report_id: uuid.UUID, db: Session = Depends(get_db), actor: str = Depends(get_actor)
) -> ReportDetail:
    r = _get_report(db, report_id)
    try:
        finalize_report(db, r, actor=actor, actor_id=resolve_actor_id(db, actor))
    except ReportError as exc:
        raise HTTPException(409, str(exc)) from exc
    return _detail(db, r)


@router.get("/{report_id}/diff", response_model=DiffResponse)
def diff(
    report_id: uuid.UUID,
    from_no: int = Query(..., alias="from"),
    to_no: int = Query(..., alias="to"),
    db: Session = Depends(get_db),
) -> DiffResponse:
    r = _get_report(db, report_id)
    try:
        d = version_diff(db, r, from_no, to_no)
    except ReportError as exc:
        raise HTTPException(404, str(exc)) from exc
    return DiffResponse(from_=d["from"], to=d["to"], unified=d["unified"])


@router.get("/{report_id}/export")
def export(
    report_id: uuid.UUID,
    format: str = Query("pdf", pattern="^(pdf|docx|html)$"),
    version: int | None = None,
    db: Session = Depends(get_db),
) -> Response:
    r = _get_report(db, report_id)
    if version is not None:
        v = db.execute(
            select(ReportVersion).where(
                ReportVersion.report_id == r.id, ReportVersion.version_no == version
            )
        ).scalar_one_or_none()
    else:
        v = db.get(ReportVersion, r.current_version_id)
    if v is None:
        raise HTTPException(404, "no version to export")

    payload = {
        "blocks": v.blocks,
        "citations": v.citations,
        "title": r.title,
    }
    # Content-Disposition filename must be latin-1 safe -> ASCII-only stem
    ascii_title = r.title.encode("ascii", "ignore").decode().strip()
    stem = (re.sub(r"[^A-Za-z0-9]+", "_", ascii_title).strip("_")[:60]) or "coalmind_report"
    if format == "html":
        return Response(render_html(payload, report_title=r.title), media_type="text/html")
    if format == "pdf":
        pdf = to_pdf(render_html(payload, report_title=r.title))
        return Response(
            pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{stem}.pdf"'},
        )
    docx = to_docx(payload, report_title=r.title)
    return Response(
        docx,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{stem}.docx"'},
    )
