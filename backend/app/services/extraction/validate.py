"""Business-rule validation over a document's extracted fields.

Cross-checks internal consistency (e.g. reserve categories vs. their total) and
flags contradictions by lowering confidence and attaching a note — which pushes
the affected field into the review queue. Cross-checking against historical KG
records for the same entity arrives with the knowledge layer (M2).
"""

from __future__ import annotations

from datetime import datetime

from app.services.extraction.types import FieldCandidate


def _num(c: FieldCandidate | None) -> float | None:
    if c and c.value_json and isinstance(c.value_json.get("value"), (int, float)):
        return float(c.value_json["value"])
    return None


def validate(cands: list[FieldCandidate]) -> list[str]:
    by_key = {c.field_key: c for c in cands}
    doc_notes: list[str] = []

    # --- reserve categories should sum to the stated total ---
    proved = _num(by_key.get("proved_reserve"))
    indicated = _num(by_key.get("indicated_reserve"))
    inferred = _num(by_key.get("inferred_reserve"))
    total_c = by_key.get("total_geological_reserve")
    total = _num(total_c)
    if None not in (proved, indicated, inferred) and total is not None:
        summed = proved + indicated + inferred
        if abs(summed - total) > max(0.5, 0.015 * total):
            msg = f"reserve categories sum to {summed:.2f} but total states {total:.2f}"
            doc_notes.append(msg)
            for key in ("proved_reserve", "indicated_reserve", "inferred_reserve",
                        "total_geological_reserve"):
                if key in by_key:
                    by_key[key].notes.append(msg)
                    by_key[key].confidence = round(by_key[key].confidence * 0.8, 3)

    # --- dates must be plausible ---
    now_year = datetime.now().year
    for c in cands:
        iso = (c.value_json or {}).get("iso")
        if not iso:
            continue
        try:
            y = int(iso[:4])
        except ValueError:
            continue
        if y < 1950 or y > now_year + 1:
            note = f"implausible date {iso}"
            c.notes.append(note)
            c.confidence = round(c.confidence * 0.7, 3)
            doc_notes.append(f"{c.field_key}: {note}")

    # --- percentages in 0..100 ---
    for c in cands:
        if (c.value_json or {}).get("unit") == "percent":
            v = _num(c)
            if v is not None and not (0 <= v <= 100):
                c.notes.append(f"percentage out of range: {v}")
                c.confidence = round(c.confidence * 0.7, 3)

    return doc_notes
