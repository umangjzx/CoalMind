"""The single entry point for writing audit rows.

Usage::

    from app.audit import record_event
    record_event(db, actor="officer@cil.in", action="document.ingested",
                 target_type="document", target_id=str(doc.id),
                 meta={"filename": doc.original_filename})

The call flushes but does not commit — it joins the caller's transaction so the
audit row and the business change land together (or not at all).
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit import AuditEvent


def _canonical(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def record_event(
    db: Session,
    *,
    actor: str = "system",
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    meta: dict[str, Any] | None = None,
) -> AuditEvent:
    meta = meta or {}

    prev_hash = db.execute(
        select(AuditEvent.entry_hash).order_by(AuditEvent.seq.desc()).limit(1)
    ).scalar_one_or_none()

    body = _canonical(
        {
            "actor": actor,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "meta": meta,
            "prev": prev_hash or "",
        }
    )
    entry_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()

    event = AuditEvent(
        actor=actor,
        action=action,
        target_type=target_type,
        target_id=target_id,
        meta=meta,
        prev_hash=prev_hash,
        entry_hash=entry_hash,
    )
    db.add(event)
    db.flush()
    return event
