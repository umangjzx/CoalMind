"""Turn a document's *accepted* extraction fields into graph entities + relations.

Named entities (mine / block / seam / mineral / subsidiary / officer / inquiry) are
get-or-created and shared across documents. Fact nodes (reserve / production_figure /
finding) and the report node are document-specific and rebuilt on every call.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.models import (
    Document,
    EntityKind,
    ExtractionField,
    FieldStatus,
    KGEntity,
    KGRelation,
    Predicate,
    Subsidiary,
)
from app.services.knowledge.normalize import clean_name, norm_key

log = get_logger(__name__)

_ACCEPTED = (FieldStatus.auto_accepted, FieldStatus.verified)
_DOC_SPECIFIC_KINDS = (
    EntityKind.reserve,
    EntityKind.production_figure,
    EntityKind.finding,
    EntityKind.report,
)

_RESERVE_CATEGORY = {
    "proved_reserve": "proved",
    "indicated_reserve": "indicated",
    "inferred_reserve": "inferred",
    "total_geological_reserve": "total",
    "revised_value": "revised",
    "superseded_value": "superseded",
}
_PRODUCTION_METRIC = {
    "coal_production_actual": "coal_production",
    "ob_removal_actual": "overburden_removal",
    "stripping_ratio": "stripping_ratio",
    "cil_production": "cil_coal_production",
    "cil_target": "cil_production_target",
}


class _Builder:
    def __init__(self, db: Session, doc: Document) -> None:
        self.db = db
        self.doc = doc
        self._cache: dict[tuple, KGEntity] = {}

    # --- entity / relation helpers -------------------------------------------------
    def entity(
        self,
        kind: EntityKind,
        name: str,
        *,
        key: str | None = None,
        subsidiary_id: uuid.UUID | None = None,
        attrs: dict | None = None,
        field: ExtractionField | None = None,
    ) -> KGEntity:
        name = clean_name(name)
        nkey = key or norm_key(name)
        cache_key = (kind, nkey, subsidiary_id)
        if cache_key in self._cache:
            ent = self._cache[cache_key]
        else:
            ent = self.db.execute(
                select(KGEntity).where(
                    KGEntity.kind == kind,
                    KGEntity.normalized_key == nkey,
                    KGEntity.subsidiary_id == subsidiary_id,
                )
            ).scalar_one_or_none()
            if ent is None:
                ent = KGEntity(
                    kind=kind, name=name, normalized_key=nkey, subsidiary_id=subsidiary_id,
                    attrs=attrs or {}, document_id=self.doc.id,
                    source_field_id=field.id if field else None,
                    confidence=field.confidence if field else 0.0,
                )
                self.db.add(ent)
                self.db.flush()
            self._cache[cache_key] = ent

        if attrs:
            ent.attrs = {**(ent.attrs or {}), **attrs}
        if field and field.confidence > ent.confidence:
            ent.confidence = field.confidence
        return ent

    def relate(
        self,
        src: KGEntity,
        predicate: Predicate,
        dst: KGEntity,
        *,
        field: ExtractionField | None = None,
        valid_from: date | None = None,
        attrs: dict | None = None,
    ) -> None:
        if src.id == dst.id:
            return
        exists = self.db.execute(
            select(KGRelation).where(
                KGRelation.src_id == src.id,
                KGRelation.dst_id == dst.id,
                KGRelation.predicate == predicate,
                KGRelation.valid_from == valid_from,
            )
        ).scalar_one_or_none()
        if exists is not None:
            return
        self.db.add(
            KGRelation(
                src_id=src.id, dst_id=dst.id, predicate=predicate,
                valid_from=valid_from, attrs=attrs or {},
                source_field_id=field.id if field else None,
                document_id=self.doc.id,
                confidence=field.confidence if field else 0.0,
            )
        )


def _as_date(field: ExtractionField | None) -> date | None:
    if field and field.value_json and field.value_json.get("iso"):
        try:
            return datetime.fromisoformat(field.value_json["iso"]).date()
        except ValueError:
            return None
    return None


def _num(field: ExtractionField | None) -> float | None:
    if field and field.value_json and isinstance(field.value_json.get("value"), (int, float)):
        return float(field.value_json["value"])
    return None


def resolve_document(db: Session, doc: Document) -> dict[str, int]:
    # wipe this document's relations + its doc-specific nodes, then rebuild
    db.execute(delete(KGRelation).where(KGRelation.document_id == doc.id))
    db.execute(
        delete(KGEntity).where(
            KGEntity.document_id == doc.id, KGEntity.kind.in_(_DOC_SPECIFIC_KINDS)
        )
    )
    db.flush()

    fields = db.execute(
        select(ExtractionField).where(
            ExtractionField.document_id == doc.id,
            ExtractionField.status.in_(_ACCEPTED),
        )
    ).scalars().all()
    by_key: dict[str, ExtractionField] = {}
    for f in fields:
        by_key.setdefault(f.field_key, f)  # first/highest-confidence wins (queue order)

    b = _Builder(db, doc)
    sub_id = doc.subsidiary_id

    # --- Report node (this document) ---
    report = b.entity(
        EntityKind.report, doc.original_filename,
        key=f"report:{doc.id}", subsidiary_id=sub_id,
        attrs={
            "doc_type": doc.doc_type,
            "doc_date": doc.doc_date.isoformat() if doc.doc_date else None,
            "subject": by_key["subject"].value_text if "subject" in by_key else None,
        },
    )

    as_on = _as_date(by_key.get("reserves_as_on")) or _as_date(by_key.get("answer_date")) \
        or (doc.doc_date.date() if doc.doc_date else None)

    # --- named entities ---
    subsidiary_ent = None
    sub_field = by_key.get("mention_subsidiary")
    real_sub: Subsidiary | None = None
    if doc.subsidiary_id:
        real_sub = db.get(Subsidiary, doc.subsidiary_id)
    if real_sub is None and sub_field is not None:
        code = sub_field.value_text.strip().upper()
        real_sub = db.execute(
            select(Subsidiary).where(Subsidiary.code == code)
        ).scalar_one_or_none()
    if real_sub is None and "mention_org" in by_key:
        # match a header like "EASTERN COALFIELDS LIMITED" to a seeded subsidiary
        org = by_key["mention_org"].value_text.lower()
        for s in db.execute(select(Subsidiary)).scalars():
            if s.name.lower() in org or org in s.name.lower():
                real_sub = s
                sub_field = by_key["mention_org"]
                break
    if real_sub is not None or sub_field is not None:
        code = real_sub.code if real_sub else sub_field.value_text.strip().upper()
        subsidiary_ent = b.entity(
            EntityKind.subsidiary, real_sub.name if real_sub else code, key=f"sub:{code}",
            subsidiary_id=real_sub.id if real_sub else None, attrs={"code": code},
            field=sub_field,
        )
        if sub_field is not None:
            b.relate(report, Predicate.mentions, subsidiary_ent, field=sub_field)

    mine = None
    mine_field = by_key.get("mine_name") or by_key.get("mention_mine")
    if mine_field:
        mine = b.entity(EntityKind.mine, mine_field.value_text, subsidiary_id=sub_id,
                        field=mine_field)
        b.relate(mine, Predicate.reported_in, report, field=mine_field)
        if subsidiary_ent:
            b.relate(mine, Predicate.located_in, subsidiary_ent, field=mine_field)

    block = None
    if "block_name" in by_key:
        block = b.entity(EntityKind.block, by_key["block_name"].value_text, subsidiary_id=sub_id,
                         field=by_key["block_name"])
        b.relate(block, Predicate.reported_in, report, field=by_key["block_name"])
        if mine:
            b.relate(block, Predicate.located_in, mine, field=by_key["block_name"])
    if "borehole_id" in by_key or "mention_borehole_id" in by_key:
        bf = by_key.get("borehole_id") or by_key["mention_borehole_id"]
        bh = b.entity(EntityKind.block, bf.value_text, subsidiary_id=sub_id,
                      attrs={"is_borehole": True}, field=bf)
        b.relate(bh, Predicate.reported_in, report, field=bf)
        if mine:
            b.relate(bh, Predicate.located_in, mine, field=bf)

    seam = None
    seam_field = by_key.get("principal_seam") or by_key.get("mention_seam")
    if seam_field:
        seam = b.entity(EntityKind.seam, seam_field.value_text, subsidiary_id=sub_id,
                        field=seam_field)
        if block:
            b.relate(block, Predicate.contains, seam, field=seam_field)

    mineral = None
    grade_field = by_key.get("average_grade") or by_key.get("mention_grade")
    if grade_field:
        grade = grade_field.value_text.strip().upper()
        mineral = b.entity(EntityKind.mineral, f"Coal ({grade})", key=f"mineral:coal:{grade}",
                           attrs={"grade": grade, "commodity": "coal"}, field=grade_field)
        if seam:
            b.relate(seam, Predicate.for_mineral, mineral, field=grade_field)

    # --- reserve fact nodes ---
    reserve_anchor = block or mine
    made_reserves: dict[str, KGEntity] = {}
    for fkey, category in _RESERVE_CATEGORY.items():
        f = by_key.get(fkey)
        qty = _num(f)
        if f is None or qty is None:
            continue
        unit = (f.value_json or {}).get("unit", "million_tonnes")
        res = b.entity(
            EntityKind.reserve, f"{category.title()} reserve",
            key=f"reserve:{doc.id}:{fkey}", subsidiary_id=sub_id,
            attrs={"category": category, "quantity": qty, "unit": unit,
                   "as_on": as_on.isoformat() if as_on else None},
            field=f,
        )
        made_reserves[fkey] = res
        b.relate(res, Predicate.reported_in, report, field=f, valid_from=as_on)
        if reserve_anchor is not None:
            b.relate(reserve_anchor, Predicate.has_reserve, res, field=f, valid_from=as_on)
        if mineral is not None:
            b.relate(res, Predicate.for_mineral, mineral, field=f)

    # correspondence: "revised from X to Y" -> new supersedes old
    if "revised_value" in made_reserves and "superseded_value" in made_reserves:
        b.relate(made_reserves["superseded_value"], Predicate.supersedes,
                 made_reserves["revised_value"], field=by_key["revised_value"])

    # --- production fact nodes ---
    period = as_on or _as_date(by_key.get("month"))
    prod_anchor = mine or subsidiary_ent
    for fkey, metric in _PRODUCTION_METRIC.items():
        f = by_key.get(fkey)
        val = _num(f)
        if f is None or val is None:
            continue
        unit = (f.value_json or {}).get("unit", "")
        pf = b.entity(
            EntityKind.production_figure, metric.replace("_", " ").title(),
            key=f"prod:{doc.id}:{fkey}", subsidiary_id=sub_id,
            attrs={"metric": metric, "value": val, "unit": unit,
                   "period": period.isoformat() if period else None},
            field=f,
        )
        b.relate(pf, Predicate.reported_in, report, field=f, valid_from=period)
        if prod_anchor is not None:
            b.relate(prod_anchor, Predicate.produces, pf, field=f, valid_from=period)

    # --- inquiry ---
    if "question_reference" in by_key:
        qf = by_key["question_reference"]
        inq = b.entity(EntityKind.inquiry, qf.value_text, key=f"inquiry:{norm_key(qf.value_text)}",
                       attrs={"answer_date": (by_key["answer_date"].value_text
                                              if "answer_date" in by_key else None)},
                       field=qf)
        b.relate(report, Predicate.responds_to, inq, field=qf)

    # --- finding (inspection) ---
    if "risk_rating" in by_key or "finding" in by_key:
        ff = by_key.get("finding") or by_key["risk_rating"]
        find_name = by_key["area"].value_text if "area" in by_key else "Inspection finding"
        find = b.entity(
            EntityKind.finding, find_name,
            key=f"finding:{doc.id}", subsidiary_id=sub_id,
            attrs={
                "risk": by_key["risk_rating"].value_text if "risk_rating" in by_key else None,
                "action_due": by_key["action_due"].value_text if "action_due" in by_key else None,
            },
            field=ff,
        )
        b.relate(find, Predicate.reported_in, report, field=ff)
        if mine:
            b.relate(mine, Predicate.mentions, find, field=ff)

    db.flush()
    n_ent = db.execute(
        select(KGEntity.id).where(KGEntity.document_id == doc.id)
    ).all()
    n_rel = db.execute(
        select(KGRelation.id).where(KGRelation.document_id == doc.id)
    ).all()
    log.info("resolved %s: %d entities touched, %d relations", doc.id, len(n_ent), len(n_rel))
    return {"entities": len(n_ent), "relations": len(n_rel)}
