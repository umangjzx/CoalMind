"""Compare knowledge-graph fact nodes for the same entity and flag disagreements."""

from __future__ import annotations

import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_event
from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.models import (
    Anomaly,
    AnomalyKind,
    AnomalySeverity,
    AnomalyStatus,
    Document,
    EntityKind,
    ExtractionField,
    KGEntity,
    KGRelation,
    Predicate,
)

log = get_logger(__name__)

_REL_VALUE_DIFF = 0.02   # >2% apart counts as different
_ABS_MIN_DIFF = 0.01
_RESERVE_MAX = 100_000.0  # million tonnes — anything above is implausible


@dataclass(slots=True)
class _Fact:
    value: float
    as_on: str | None
    document_id: str | None
    filename: str | None
    page_no: int | None
    field_key: str


@dataclass(slots=True)
class _Finding:
    kind: AnomalyKind
    severity: AnomalySeverity
    entity_id: str | None
    subsidiary_id: str | None
    title: str
    detail: str
    signature: str
    evidence: list[dict] = field(default_factory=list)


def _diff(a: float, b: float) -> bool:
    return abs(a - b) > max(_ABS_MIN_DIFF, _REL_VALUE_DIFF * max(abs(a), abs(b)))


def _fact_from_node(db: Session, node: KGEntity) -> _Fact | None:
    a = node.attrs or {}
    v = a.get("quantity", a.get("value"))
    if not isinstance(v, (int, float)):
        return None
    f = db.get(ExtractionField, node.source_field_id) if node.source_field_id else None
    doc = db.get(Document, node.document_id) if node.document_id else None
    return _Fact(
        value=float(v),
        as_on=a.get("as_on") or a.get("period"),
        document_id=str(node.document_id) if node.document_id else None,
        filename=doc.original_filename if doc else None,
        page_no=f.page_no if f else None,
        field_key=f.field_key if f else a.get("category") or a.get("metric") or node.name,
    )


def _ev(facts: list[_Fact]) -> list[dict]:
    out: list[dict] = []
    seen: set[tuple] = set()
    for x in facts:
        # collapse re-uploads of the same file: key on filename, not document_id
        key = (x.filename or x.document_id, x.field_key, x.value, x.as_on)
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "document_id": x.document_id, "filename": x.filename, "page_no": x.page_no,
            "field_key": x.field_key, "value": x.value, "as_on": x.as_on,
        })
    return out


def _anchor(db: Session, fact_node: KGEntity) -> KGEntity | None:
    rel = db.execute(
        select(KGRelation).where(
            KGRelation.dst_id == fact_node.id,
            KGRelation.predicate.in_([Predicate.has_reserve, Predicate.produces]),
        ).limit(1)
    ).scalar_one_or_none()
    return db.get(KGEntity, rel.src_id) if rel else None


def _detect(db: Session) -> list[_Finding]:
    findings: list[_Finding] = []

    # group fact nodes by (anchor, category/metric)
    groups: dict[tuple[str | None, str], list[tuple[KGEntity, _Fact]]] = defaultdict(list)
    fact_nodes = db.execute(
        select(KGEntity).where(
            KGEntity.kind.in_([EntityKind.reserve, EntityKind.production_figure])
        )
    ).scalars().all()

    anchors: dict[str, KGEntity] = {}
    for node in fact_nodes:
        fact = _fact_from_node(db, node)
        if fact is None:
            continue
        anchor = _anchor(db, node)
        akey = str(anchor.id) if anchor else None
        if anchor:
            anchors[akey] = anchor
        cat = (node.attrs or {}).get("category") or (node.attrs or {}).get("metric") or node.name
        groups[(akey, cat)].append((node, fact))

        # --- per-fact out-of-range ---
        a = node.attrs or {}
        unit = str(a.get("unit", ""))
        bad = None
        if node.kind == EntityKind.reserve and (fact.value < 0 or fact.value > _RESERVE_MAX):
            bad = f"reserve quantity {fact.value:g} {unit} is out of plausible range"
        if "percent" in unit and not (0 <= fact.value <= 110):
            bad = f"percentage {fact.value:g}% outside 0-100"
        if cat == "stripping_ratio" and fact.value <= 0:
            bad = f"stripping ratio {fact.value:g} must be positive"
        if bad:
            findings.append(_Finding(
                kind=AnomalyKind.out_of_range, severity=AnomalySeverity.high,
                entity_id=akey, subsidiary_id=(str(anchor.subsidiary_id)
                                               if anchor and anchor.subsidiary_id else None),
                title=f"{(anchor.name + ': ') if anchor else ''}{cat} — implausible value",
                detail=bad, signature=f"oor:{node.id}", evidence=_ev([fact]),
            ))

    # --- contradiction / revision, collapsed to one finding per anchor ---
    # (a reserve report revises several category figures at once — surface that as a
    # single reviewable item, not one row per line.)
    rev_lines: dict[str, list[tuple[str, str]]] = defaultdict(list)   # akey -> [(cat, span)]
    con_lines: dict[str, list[tuple[str, str]]] = defaultdict(list)
    rev_facts: dict[str, list[_Fact]] = defaultdict(list)
    con_facts: dict[str, list[_Fact]] = defaultdict(list)
    rev_docs: dict[str, set[str]] = defaultdict(set)
    con_docs: dict[str, set[str]] = defaultdict(set)

    for (akey, cat), items in groups.items():
        if len(items) < 2:
            continue
        facts = [f for _, f in items]
        if not any(_diff(a.value, b.value) for a in facts for b in facts if a is not b):
            continue
        ordered = sorted(facts, key=lambda f: (f.as_on or ""))
        span = f"{ordered[0].value:g} ({ordered[0].as_on or 'n/d'}) -> " \
               f"{ordered[-1].value:g} ({ordered[-1].as_on or 'n/d'})"
        docs = {f.document_id for f in facts if f.document_id}
        label = str(cat).replace("_", " ")
        if len({f.as_on for f in facts if f.as_on}) > 1:
            rev_lines[akey or ""].append((label, span))
            rev_facts[akey or ""].extend(facts)
            rev_docs[akey or ""].update(docs)
        else:
            con_lines[akey or ""].append((label, span))
            con_facts[akey or ""].extend(facts)
            con_docs[akey or ""].update(docs)

    for akey, lines in rev_lines.items():
        anchor = anchors.get(akey)
        name = (anchor.name + ": ") if anchor else ""
        sub = str(anchor.subsidiary_id) if anchor and anchor.subsidiary_id else None
        body = "; ".join(f"{lbl} {sp}" for lbl, sp in sorted(lines))
        findings.append(_Finding(
            kind=AnomalyKind.revision, severity=AnomalySeverity.medium,
            entity_id=akey or None, subsidiary_id=sub,
            title=f"{name}figures revised across reports ({len(lines)} "
                  f"{'field' if len(lines) == 1 else 'fields'})",
            detail=f"Historical vs current figures differ — {body}. "
                   "Confirm the revision is intentional and supersedes the earlier report.",
            signature=f"rev:{akey}:{','.join(sorted(rev_docs[akey]))}"[:290],
            evidence=_ev(rev_facts[akey]),
        ))

    for akey, lines in con_lines.items():
        anchor = anchors.get(akey)
        name = (anchor.name + ": ") if anchor else ""
        sub = str(anchor.subsidiary_id) if anchor and anchor.subsidiary_id else None
        body = "; ".join(f"{lbl} {sp}" for lbl, sp in sorted(lines))
        findings.append(_Finding(
            kind=AnomalyKind.contradiction, severity=AnomalySeverity.high,
            entity_id=akey or None, subsidiary_id=sub,
            title=f"{name}conflicting figures for the same period "
                  f"({len(lines)} {'field' if len(lines) == 1 else 'fields'})",
            detail=f"Two sources give different values for the same as-on date — {body}.",
            signature=f"con:{akey}:{','.join(sorted(con_docs[akey]))}"[:290],
            evidence=_ev(con_facts[akey]),
        ))

    # --- cross-document reserve sum mismatch (per anchor + as_on) ---
    by_anchor_date: dict[tuple[str, str], dict[str, _Fact]] = defaultdict(dict)
    for (akey, cat), items in groups.items():
        if akey is None or cat not in ("proved", "indicated", "inferred", "total"):
            continue
        for _, f in items:
            by_anchor_date[(akey, f.as_on or "n/d")][cat] = f
    for (akey, as_on), cats in by_anchor_date.items():
        if {"proved", "indicated", "inferred", "total"} <= set(cats):
            summed = cats["proved"].value + cats["indicated"].value + cats["inferred"].value
            total = cats["total"].value
            if _diff(summed, total):
                anchor = anchors.get(akey)
                findings.append(_Finding(
                    kind=AnomalyKind.sum_mismatch, severity=AnomalySeverity.high,
                    entity_id=akey,
                    subsidiary_id=(str(anchor.subsidiary_id)
                                   if anchor and anchor.subsidiary_id else None),
                    title=f"{(anchor.name + ': ') if anchor else ''}reserve categories "
                          f"do not sum to the stated total",
                    detail=f"proved+indicated+inferred = {summed:.2f} but total states "
                           f"{total:.2f} (as on {as_on}).",
                    signature=f"sum:{akey}:{as_on}"[:290],
                    evidence=_ev(list(cats.values())),
                ))

    # --- trend break on production metrics ---
    for (akey, cat), items in groups.items():
        vals = [f.value for _, f in items]
        if akey is None or len(vals) < 4:
            continue
        mean, sd = statistics.fmean(vals), statistics.pstdev(vals)
        if sd == 0:
            continue
        for _, f in items:
            if abs(f.value - mean) > 2.5 * sd:
                anchor = anchors.get(akey)
                findings.append(_Finding(
                    kind=AnomalyKind.trend_break, severity=AnomalySeverity.low,
                    entity_id=akey,
                    subsidiary_id=(str(anchor.subsidiary_id)
                                   if anchor and anchor.subsidiary_id else None),
                    title=f"{(anchor.name + ': ') if anchor else ''}{cat} — outlier vs history",
                    detail=f"{f.value:g} is >2.5σ from the mean of {mean:.2f} for this metric.",
                    signature=f"trend:{akey}:{cat}:{f.value:g}"[:290],
                    evidence=_ev([f]),
                ))
    return findings


def scan_anomalies(db: Session | None = None, *, actor: str = "system") -> dict:
    own = db is None
    db = db or SessionLocal()
    try:
        findings = _detect(db)
        seen = {f.signature for f in findings}
        by_sig = {a.signature: a for a in db.execute(select(Anomaly)).scalars()}

        created = updated = 0
        for f in findings:
            row = by_sig.get(f.signature)
            if row is None:
                db.add(Anomaly(
                    signature=f.signature, kind=f.kind, severity=f.severity,
                    status=AnomalyStatus.open, title=f.title, detail=f.detail,
                    entity_id=_u(f.entity_id), subsidiary_id=_u(f.subsidiary_id),
                    evidence=f.evidence,
                ))
                created += 1
            elif row.status == AnomalyStatus.open:
                row.title, row.detail, row.evidence = f.title, f.detail, f.evidence
                row.severity = f.severity
                updated += 1

        # auto-resolve open anomalies that no longer reproduce
        stale = 0
        for sig, row in by_sig.items():
            if sig not in seen and row.status == AnomalyStatus.open:
                row.status = AnomalyStatus.resolved
                row.reviewed_at = datetime.now()
                row.note = "auto-resolved — no longer detected"
                stale += 1

        counts: dict[str, int] = defaultdict(int)
        for f in findings:
            counts[f.kind.value] += 1
        stats = {"detected": len(findings), "created": created, "updated": updated,
                 "auto_resolved": stale, "by_kind": dict(counts)}
        record_event(db, actor=actor, action="anomaly.scan", meta=stats)
        if own:
            db.commit()
        else:
            db.flush()
        log.info("anomaly scan: %s", stats)
        return stats
    finally:
        if own:
            db.close()


def _u(v: str | None):
    import uuid

    return uuid.UUID(v) if v else None
