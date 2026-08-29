#!/usr/bin/env python
"""Score classification + rule-based field extraction against the sample corpus.

    python scripts/dev.py eval           # human-readable summary + per-doc table
    python scripts/dev.py eval --json    # machine-readable dict on stdout

Each file in ``ml/sample_corpus/`` is run through the real pipeline stages
(``extract_pages`` -> ``classify`` -> ``extract_fields``) with **no database**, so
the score is a pure function of the code + the corpus and safe to run in CI.

Reported, split by digital vs degraded-scan:

* **classification** - predicted ``doc_type`` vs the ground-truth ``doc_type``.
* **field P / R / F1** - over the fields the rules engine actually targets
  (``GT_ALIASES`` maps every ground-truth key to the extractor key(s) that can
  produce it; ground-truth keys with no mapping are counted as *coverage gaps*,
  not misses).
* **coverage** - share of ground-truth fields the engine even attempts.
* **effective accuracy after review** - ``1 - (silent_error + silent_miss) / N``
  where a *silent error* is a wrong value auto-accepted at/above the confidence
  threshold (it escapes the review queue) and a *silent miss* is a ground-truth
  field that was never extracted (nothing queues it for a human). This is the
  number the PRD's "~99% with human review" target refers to.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from dateutil import parser as dateparser

from app.core.config import get_settings
from app.services.extraction import extract_fields
from app.services.ingestion.classifier import classify
from app.services.ingestion.page_extract import extract_pages

REPO_ROOT = Path(__file__).resolve().parents[1]
CORPUS = REPO_ROOT / "ml" / "sample_corpus"
GROUND_TRUTH = CORPUS / "ground_truth"

_NUM_ABS_TOL = 0.01
_NUM_REL_TOL = 0.005  # 0.5%

# ground-truth field key -> extractor field key(s), tried in order. Keys absent
# here are "not yet targeted by the rules engine" and score as coverage gaps.
GT_ALIASES: dict[str, dict[str, tuple[str, ...]]] = {
    "geological_reserve_status": {
        "proved_reserve_mt": ("proved_reserve",),
        "indicated_reserve_mt": ("indicated_reserve",),
        "inferred_reserve_mt": ("inferred_reserve",),
        "seam": ("principal_seam", "mention_seam"),
        "avg_grade": ("average_grade", "mention_grade"),
        "mine": ("mine_name", "mention_mine"),
        "block": ("block_name",),
        "as_on": ("reserves_as_on",),
    },
    "monthly_production_mis": {
        "coal_production_lakh_te": ("coal_production_actual",),
        "target_lakh_te": ("coal_production_target",),
        "achievement_pct": ("coal_production_achievement_pct",),
        "overburden_removal_lakh_cum": ("ob_removal_actual",),
        "mine": ("mine_name", "mention_mine"),
    },
    "borehole_log_summary": {
        "borehole_id": ("borehole_id", "mention_borehole_id"),
        "total_depth_m": ("total_depth_m",),
        "seams_intersected": ("seams_intersected",),
        "block": ("block_name",),
        "mine": ("mine_name", "mention_mine"),
        "principal_seam": ("mention_seam",),
    },
    "inspection_report": {
        "finding": ("finding",),
        "risk_rating": ("risk_rating",),
        "action_due": ("action_due",),
        "date": ("inspection_date",),
        "mine": ("mine_name", "mention_mine"),
    },
    "parliamentary_qa_response": {
        "question_topic": ("question_topic", "subject"),
        "cil_production_mt_fy24": ("cil_production",),
        "cil_target_mt_fy24": ("cil_target",),
        "date": ("answer_date",),
        "reference": ("question_reference",),
    },
    "correspondence": {
        "subject": ("subject",),
        "mine": ("mine_name", "mention_mine"),
        "reference_no": ("reference_no",),
        "letter_date": ("letter_date",),
        "revised_value": ("revised_value",),
        "superseded_value": ("superseded_value",),
    },
}

# abbreviations seen in mine / colliery names - expanded before text comparison
_ABBREV = {
    "oc": "opencast", "ocp": "opencast", "ug": "underground", "colly": "colliery",
    "expn": "expansion", "extn": "extension", "proj": "project",
}

# top-level ground-truth keys that describe an extractable field (the rest -
# fields{} - is nested)
_TOPLEVEL_FIELD_KEYS = ("mine", "block", "as_on", "date", "reference")

# ground-truth keys that are annotator commentary, not values to be extracted
_META_FIELD_KEYS = frozenset({"note"})


@dataclass(slots=True)
class FieldOutcome:
    gt_key: str
    in_scope: bool
    extracted: bool = False
    correct: bool = False
    auto_accepted: bool = False
    confidence: float = 0.0
    detail: str = ""

    @property
    def silent_error(self) -> bool:
        return self.in_scope and self.extracted and not self.correct and self.auto_accepted

    @property
    def silent_miss(self) -> bool:
        return self.in_scope and not self.extracted


@dataclass(slots=True)
class DocResult:
    name: str
    bucket: str  # "digital" | "degraded"
    gt_doc_type: str
    pred_doc_type: str
    gt_language: str
    pred_language: str
    outcomes: list[FieldOutcome] = field(default_factory=list)
    extra_fields: list[str] = field(default_factory=list)

    @property
    def doc_type_ok(self) -> bool:
        return self.pred_doc_type == self.gt_doc_type

    @property
    def language_ok(self) -> bool:
        if self.gt_language in ("hi", "mixed"):
            return self.pred_language in ("hi", "mixed")
        return self.pred_language == self.gt_language


# --------------------------------------------------------------------------- #
# value comparison
# --------------------------------------------------------------------------- #

def _norm_text(s: str) -> str:
    return " ".join(s.lower().split()).strip(" .:-")


def _tokens(s: str) -> list[str]:
    return [_ABBREV.get(t, t) for t in _norm_text(s).replace("-", " ").split()]


def _as_date(v) -> date | None:
    try:
        return dateparser.parse(str(v), dayfirst=True, fuzzy=True).date()
    except (ValueError, OverflowError, TypeError):
        return None


def _num_match(a: float, b: float) -> bool:
    return abs(a - b) <= max(_NUM_ABS_TOL, _NUM_REL_TOL * max(abs(a), abs(b)))


def _value_match(gt_val, cand) -> tuple[bool, str]:
    """Return (is_correct, human_detail). ``cand`` is a FieldCandidate."""
    vj = cand.value_json or {}
    vt = cand.value_text or ""

    # numeric ground truth: {"value": .., "unit": ..} or a bare int/float
    gt_num = None
    if isinstance(gt_val, dict) and isinstance(gt_val.get("value"), (int, float)):
        gt_num = float(gt_val["value"])
    elif isinstance(gt_val, (int, float)):
        gt_num = float(gt_val)

    if gt_num is not None:
        got = vj.get("value")
        if got is None:
            try:
                got = float(str(vt).replace(",", ""))
            except ValueError:
                return False, f"expected {gt_num:g}, got text {vt!r}"
        ok = _num_match(gt_num, float(got))
        return ok, f"{'=' if ok else '!='} {gt_num:g} vs {float(got):g}"

    # date-ish ground truth
    gt_d = _as_date(gt_val) if _looks_dateish(gt_val) else None
    if gt_d is not None:
        got_d = _as_date(vj.get("iso") or vt)
        ok = got_d == gt_d
        return ok, f"{'=' if ok else '!='} {gt_d} vs {got_d}"

    # text ground truth - exact / containment / token-subset (abbrev-aware), so
    # "Kusmunda OC" matches "Kusmunda Opencast" but a wrong name still fails.
    g, c = _norm_text(str(gt_val)), _norm_text(vt)
    gt_tok, cand_tok = _tokens(str(gt_val)), set(_tokens(vt))
    ok = bool(g) and (
        g == c or g in c or c in g
        or (len(gt_tok) > 0 and all(t in cand_tok for t in gt_tok))
    )
    return ok, f"{'=' if ok else '!='} {gt_val!r} vs {vt!r}"


def _looks_dateish(v) -> bool:
    s = str(v)
    has_sep = any(sep in s for sep in ("-", "/", "."))
    return has_sep and any(ch.isdigit() for ch in s) and _as_date(s) is not None


# --------------------------------------------------------------------------- #
# scoring one document
# --------------------------------------------------------------------------- #

def _flatten_gt(gt: dict) -> dict[str, object]:
    out: dict[str, object] = {}
    for k in _TOPLEVEL_FIELD_KEYS:
        if k in gt:
            out[k] = gt[k]
    out.update(gt.get("fields", {}))
    return {k: v for k, v in out.items() if k not in _META_FIELD_KEYS}


def score_document(path: Path, gt: dict, *, threshold: float) -> DocResult:
    data = path.read_bytes()
    ct = "application/pdf" if path.suffix == ".pdf" else "text/plain"
    pages = extract_pages(data, ct, filename=path.name)
    full_text = "\n".join(p.text for p in pages)

    pred_type, pred_lang, _ = classify(full_text, filename=path.name)
    gt_type = gt["doc_type"]
    # extraction is run with the ground-truth type so a classification miss does
    # not also zero the field score (the two are reported separately).
    cands, _notes = extract_fields(gt_type, pages)
    # first candidate per key wins, matching the KG resolver's setdefault()
    by_key: dict = {}
    for c in cands:
        by_key.setdefault(c.field_key, c)

    aliases = GT_ALIASES.get(gt_type, {})
    res = DocResult(
        name=path.name,
        bucket="degraded" if gt.get("quality") == "degraded_scan" else "digital",
        gt_doc_type=gt_type,
        pred_doc_type=pred_type,
        gt_language=gt.get("language", "en"),
        pred_language=pred_lang,
    )

    matched_keys: set[str] = set()
    for gt_key, gt_val in _flatten_gt(gt).items():
        target_keys = aliases.get(gt_key)
        o = FieldOutcome(gt_key=gt_key, in_scope=target_keys is not None)
        if target_keys:
            cand = next((by_key[k] for k in target_keys if k in by_key), None)
            if cand is not None:
                matched_keys.add(cand.field_key)
                o.extracted = True
                o.confidence = round(cand.confidence, 3)
                o.auto_accepted = cand.confidence >= threshold
                o.correct, o.detail = _value_match(gt_val, cand)
            else:
                o.detail = f"no candidate for {gt_key} ({'/'.join(target_keys)})"
        else:
            o.detail = "not targeted by rules engine"
        res.outcomes.append(o)

    res.extra_fields = sorted(k for k in by_key if k not in matched_keys)
    return res


# --------------------------------------------------------------------------- #
# aggregation + reporting
# --------------------------------------------------------------------------- #

def _agg(results: list[DocResult]) -> dict:
    def bucket_stats(rows: list[DocResult]) -> dict:
        outs = [o for r in rows for o in r.outcomes]
        in_scope = [o for o in outs if o.in_scope]
        extracted = [o for o in in_scope if o.extracted]
        correct = [o for o in extracted if o.correct]
        silent_err = [o for o in in_scope if o.silent_error]
        silent_miss = [o for o in in_scope if o.silent_miss]
        n = len(in_scope)
        prec = len(correct) / len(extracted) if extracted else 0.0
        rec = len(correct) / n if n else 0.0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
        eff = 1 - (len(silent_err) + len(silent_miss)) / n if n else 1.0
        auto_ok = [o for o in correct if o.auto_accepted]
        return {
            "docs": len(rows),
            "gt_fields_total": len(outs),
            "gt_fields_in_scope": n,
            "coverage": round(len(in_scope) / len(outs), 3) if outs else 0.0,
            "extracted": len(extracted),
            "correct": len(correct),
            "precision": round(prec, 3),
            "recall": round(rec, 3),
            "f1": round(f1, 3),
            "auto_accept_correct": len(auto_ok),
            "flagged_for_review": len(extracted) - len([o for o in extracted if o.auto_accepted]),
            "silent_errors": len(silent_err),
            "silent_misses": len(silent_miss),
            "effective_accuracy": round(eff, 3),
            "classification_correct": sum(r.doc_type_ok for r in rows),
            "language_correct": sum(r.language_ok for r in rows),
        }

    digital = [r for r in results if r.bucket == "digital"]
    degraded = [r for r in results if r.bucket == "degraded"]
    return {
        "threshold": get_settings().confidence_threshold,
        "overall": bucket_stats(results),
        "digital": bucket_stats(digital),
        "degraded": bucket_stats(degraded) if degraded else None,
        "classification_accuracy": round(
            sum(r.doc_type_ok for r in results) / len(results), 3
        ),
        "language_accuracy": round(sum(r.language_ok for r in results) / len(results), 3),
        "documents": [
            {
                "name": r.name,
                "bucket": r.bucket,
                "doc_type": {"truth": r.gt_doc_type, "pred": r.pred_doc_type,
                             "ok": r.doc_type_ok},
                "language": {"truth": r.gt_language, "pred": r.pred_language,
                             "ok": r.language_ok},
                "fields": [
                    {
                        "key": o.gt_key, "in_scope": o.in_scope,
                        "extracted": o.extracted, "correct": o.correct,
                        "auto_accepted": o.auto_accepted, "confidence": o.confidence,
                        "detail": o.detail,
                    }
                    for o in r.outcomes
                ],
                "extra_fields": r.extra_fields,
            }
            for r in results
        ],
    }


def run() -> dict:
    threshold = get_settings().confidence_threshold
    results: list[DocResult] = []
    for gt_path in sorted(GROUND_TRUTH.glob("*.json")):
        stem = gt_path.stem
        doc = next(
            (p for p in CORPUS.iterdir()
             if p.is_file() and p.stem == stem and p.suffix in (".pdf", ".txt")),
            None,
        )
        if doc is None:
            print(f"  !! no corpus file for {stem} - run: python scripts/dev.py corpus")
            continue
        gt = json.loads(gt_path.read_text(encoding="utf-8"))
        results.append(score_document(doc, gt, threshold=threshold))
    return _agg(results)


def _print_human(report: dict) -> None:
    def line(label: str, s: dict | None) -> None:
        if not s:
            return
        print(
            f"  {label:<9} docs={s['docs']:<2} "
            f"scope={s['gt_fields_in_scope']:<3}/{s['gt_fields_total']:<3} "
            f"cov={s['coverage']:.0%}  "
            f"P={s['precision']:.2f} R={s['recall']:.2f} F1={s['f1']:.2f}  "
            f"eff={s['effective_accuracy']:.1%}  "
            f"silent(err={s['silent_errors']} miss={s['silent_misses']})  "
            f"class={s['classification_correct']}/{s['docs']}"
        )

    print("\nextraction accuracy vs ml/sample_corpus/ground_truth/")
    print(f"  confidence threshold = {report['threshold']}")
    print()
    line("OVERALL", report["overall"])
    line("digital", report["digital"])
    line("degraded", report["degraded"])
    print(
        f"\n  classification accuracy: {report['classification_accuracy']:.0%}  "
        f"language accuracy: {report['language_accuracy']:.0%}"
    )

    print("\n  per-document:")
    for d in report["documents"]:
        dt = d["doc_type"]
        flag = "ok " if dt["ok"] else "MISS"
        hits = sum(f["correct"] for f in d["fields"] if f["in_scope"])
        scope = sum(f["in_scope"] for f in d["fields"])
        print(f"    [{flag}] {d['name']:<52} type={dt['pred']:<24} fields {hits}/{scope}")
        for f in d["fields"]:
            if f["in_scope"] and not f["correct"]:
                print(f"           - {f['key']}: {f['detail']}  (conf {f['confidence']})")
    print()


def main(argv: list[str]) -> int:
    report = run()
    if "--json" in argv:
        print(json.dumps(report, indent=2))
    else:
        _print_human(report)
    # non-zero exit if the digital bucket regresses below the PRD floor
    digital = report.get("digital") or {}
    ok = digital.get("f1", 0) >= 0.90 and report["classification_accuracy"] >= 0.85
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
