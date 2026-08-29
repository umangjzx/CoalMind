"""Assemble the citation list for a draft, deduplicated, one marker per source field."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models import Document, ExtractionField, FieldStatus
from app.services.reports.models import Citation, Unresolved


class CitationCollector:
    """Call `cite(db, field_id, value)` while building blocks; it returns a `[[c:N]]`
    marker string and records the Citation. `needs_review` fields are additionally
    tracked as `unresolved` (they block finalisation)."""

    def __init__(self) -> None:
        self._by_field: dict[str, Citation] = {}
        self._order: list[str] = []
        self.unresolved: list[Unresolved] = []
        self._unresolved_seen: set[str] = set()

    def cite(self, db: Session, field_id: uuid.UUID | str | None, value: str) -> str:
        if field_id is None:
            return ""
        fid = str(field_id)
        if fid not in self._by_field:
            field = db.get(ExtractionField, uuid.UUID(fid))
            if field is None:
                return ""
            doc = db.get(Document, field.document_id)
            marker = len(self._order) + 1
            self._by_field[fid] = Citation(
                marker=marker,
                extraction_field_id=fid,
                document_id=str(field.document_id),
                document_filename=doc.original_filename if doc else None,
                page_no=field.page_no,
                field_key=field.field_key,
                value=value or field.value_text,
                snippet=field.source_snippet,
                confidence=field.confidence,
            )
            self._order.append(fid)
            if field.status == FieldStatus.needs_review and fid not in self._unresolved_seen:
                self._unresolved_seen.add(fid)
                self.unresolved.append(
                    Unresolved(
                        extraction_field_id=fid,
                        field_key=field.field_key,
                        label=field.label or field.field_key,
                        document_id=str(field.document_id),
                        reason=f"confidence {field.confidence:.2f} — awaiting verification",
                    )
                )
        return f"[[c:{self._by_field[fid].marker}]]"

    def citations(self) -> list[Citation]:
        return [self._by_field[fid] for fid in self._order]
