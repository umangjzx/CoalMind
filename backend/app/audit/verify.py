"""Walk the append-only audit log and check the SHA-256 hash chain (M6, FR-10)."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit import AuditEvent


def _canonical(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def _recompute(ev: AuditEvent, prev_hash: str) -> str:
    body = _canonical(
        {
            "actor": ev.actor,
            "action": ev.action,
            "target_type": ev.target_type,
            "target_id": ev.target_id,
            "meta": ev.meta or {},
            "prev": prev_hash or "",
        }
    )
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def verify_chain(db: Session) -> dict[str, Any]:
    rows = db.execute(select(AuditEvent).order_by(AuditEvent.seq)).scalars().all()
    prev = ""
    for i, ev in enumerate(rows):
        if (ev.prev_hash or "") != prev:
            return {
                "ok": False, "checked": i, "first_broken_seq": ev.seq,
                "detail": f"prev_hash mismatch at seq {ev.seq}",
            }
        if _recompute(ev, prev) != (ev.entry_hash or ""):
            return {
                "ok": False, "checked": i, "first_broken_seq": ev.seq,
                "detail": f"entry_hash mismatch at seq {ev.seq} — row was altered",
            }
        prev = ev.entry_hash or ""
    return {"ok": True, "checked": len(rows), "first_broken_seq": None,
            "detail": f"{len(rows)} events, chain intact"}
