"""Report lifecycle: create → (re)render → human edit → finalise, with an
append-only version history and AI-vs-human provenance."""

from __future__ import annotations

import difflib
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.audit import record_event
from app.core.logging import get_logger
from app.models import Report, ReportStatus, ReportVersion, VersionAuthor
from app.services.reports.citations import CitationCollector
from app.services.reports.models import DraftResult
from app.services.reports.registry import get_template
from app.services.reports.render import blocks_to_markdown

log = get_logger(__name__)


class ReportError(RuntimeError):
    pass


def _draft_to_payload(d: DraftResult) -> dict[str, Any]:
    blocks = [b.to_dict() for b in d.blocks]
    citations = [
        {
            "marker": c.marker,
            "extraction_field_id": c.extraction_field_id,
            "document_id": c.document_id,
            "document_filename": c.document_filename,
            "page_no": c.page_no,
            "field_key": c.field_key,
            "value": c.value,
            "snippet": c.snippet,
            "confidence": c.confidence,
        }
        for c in d.citations
    ]
    unresolved = [
        {
            "extraction_field_id": u.extraction_field_id,
            "field_key": u.field_key,
            "label": u.label,
            "document_id": u.document_id,
            "reason": u.reason,
        }
        for u in d.unresolved
    ]
    return {
        "blocks": blocks,
        "citations": citations,
        "unresolved": unresolved,
        "content_md": blocks_to_markdown(blocks, citations),
        "title": d.title,
    }


def _new_version(
    db: Session,
    report: Report,
    *,
    author_kind: VersionAuthor,
    summary: str,
    payload: dict[str, Any],
    author_id: uuid.UUID | None = None,
) -> ReportVersion:
    last = db.execute(
        select(func.max(ReportVersion.version_no)).where(ReportVersion.report_id == report.id)
    ).scalar()
    n = (last or 0) + 1
    v = ReportVersion(
        report_id=report.id,
        version_no=n,
        author_kind=author_kind,
        author_id=author_id,
        summary=summary,
        blocks=payload["blocks"],
        content_md=payload["content_md"],
        citations=payload["citations"],
        unresolved=payload["unresolved"],
    )
    db.add(v)
    db.flush()
    report.current_version_id = v.id
    report.status = ReportStatus.in_review if payload["unresolved"] else ReportStatus.draft
    return v


def create_report(
    db: Session,
    *,
    template_key: str,
    params: dict[str, Any],
    title: str | None = None,
    subsidiary_id: uuid.UUID | None = None,
    actor: str = "system",
    actor_id: uuid.UUID | None = None,
) -> Report:
    tmpl = get_template(template_key)
    if tmpl is None:
        raise ReportError(f"unknown template: {template_key}")

    cc = CitationCollector()
    draft = tmpl.build(db, params, cc)
    payload = _draft_to_payload(draft)

    report = Report(
        title=title or payload["title"],
        template_key=template_key,
        params=params,
        subsidiary_id=subsidiary_id,
        created_by_id=actor_id,
    )
    db.add(report)
    db.flush()
    _new_version(
        db, report, author_kind=VersionAuthor.ai, summary="initial AI draft", payload=payload
    )
    record_event(
        db,
        actor=actor,
        action="report.created",
        target_type="report",
        target_id=str(report.id),
        meta={"template": template_key, "unresolved": len(payload["unresolved"])},
    )
    db.commit()
    return report


def rerender_report(db: Session, report: Report, *, actor: str = "system") -> ReportVersion:
    if report.status == ReportStatus.final:
        raise ReportError("report is final; cannot re-render")
    tmpl = get_template(report.template_key)
    if tmpl is None:
        raise ReportError(f"unknown template: {report.template_key}")
    cc = CitationCollector()
    payload = _draft_to_payload(tmpl.build(db, report.params, cc))
    v = _new_version(
        db,
        report,
        author_kind=VersionAuthor.ai,
        summary="AI re-render (facts refreshed)",
        payload=payload,
    )
    record_event(
        db,
        actor=actor,
        action="report.rerendered",
        target_type="report",
        target_id=str(report.id),
        meta={"version": v.version_no},
    )
    db.commit()
    return v


def add_human_edit(
    db: Session,
    report: Report,
    *,
    content_md: str,
    summary: str,
    actor: str = "system",
    actor_id: uuid.UUID | None = None,
) -> ReportVersion:
    if report.status == ReportStatus.final:
        raise ReportError("report is final; cannot edit")
    current = db.get(ReportVersion, report.current_version_id)
    # a human edit keeps the citations/unresolved of the version it was based on;
    # the edited markdown is parsed back into structured blocks so exports stay clean.
    from app.services.reports.mdblocks import md_to_blocks

    blocks = md_to_blocks(content_md) or [
        {"type": "paragraph", "text": content_md, "editable": True}
    ]
    payload = {
        "blocks": blocks,
        "citations": current.citations if current else [],
        "unresolved": current.unresolved if current else [],
        "content_md": content_md,
    }
    v = _new_version(
        db,
        report,
        author_kind=VersionAuthor.human,
        summary=summary or "officer edit",
        payload=payload,
        author_id=actor_id,
    )
    record_event(
        db,
        actor=actor,
        action="report.edited",
        target_type="report",
        target_id=str(report.id),
        meta={"version": v.version_no, "summary": summary},
    )
    db.commit()
    return v


def finalize_report(
    db: Session, report: Report, *, actor: str = "system", actor_id: uuid.UUID | None = None
) -> Report:
    current = db.get(ReportVersion, report.current_version_id)
    if current is None:
        raise ReportError("nothing to finalise")
    if current.unresolved:
        raise ReportError(
            f"{len(current.unresolved)} bound field(s) still need verification: "
            + ", ".join(u["label"] for u in current.unresolved)
        )
    report.status = ReportStatus.final
    report.finalized_at = datetime.now(UTC)
    report.finalized_by_id = actor_id
    record_event(
        db,
        actor=actor,
        action="report.finalized",
        target_type="report",
        target_id=str(report.id),
        meta={"version": current.version_no, "citations": len(current.citations)},
    )
    db.commit()
    return report


def version_diff(db: Session, report: Report, from_no: int, to_no: int) -> dict[str, Any]:
    rows = db.execute(
        select(ReportVersion).where(
            ReportVersion.report_id == report.id,
            ReportVersion.version_no.in_([from_no, to_no]),
        )
    ).scalars().all()
    vs = {v.version_no: v for v in rows}
    a, b = vs.get(from_no), vs.get(to_no)
    if a is None or b is None:
        raise ReportError("version not found")
    diff = list(
        difflib.unified_diff(
            a.content_md.splitlines(),
            b.content_md.splitlines(),
            fromfile=f"v{from_no} ({a.author_kind})",
            tofile=f"v{to_no} ({b.author_kind})",
            lineterm="",
        )
    )
    return {
        "from": {"version_no": from_no, "author_kind": a.author_kind},
        "to": {"version_no": to_no, "author_kind": b.author_kind},
        "unified": "\n".join(diff),
    }
