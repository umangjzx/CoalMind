"""Report template registry."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.services.reports.templates.adhoc_inquiry import AdhocInquiry
from app.services.reports.templates.base import Template
from app.services.reports.templates.geological_reserve_status import GeologicalReserveStatus
from app.services.reports.templates.monthly_production_mis import MonthlyProductionMIS
from app.services.reports.templates.parliamentary_qa import ParliamentaryQA

_TEMPLATES: dict[str, Template] = {
    t.key: t
    for t in (
        GeologicalReserveStatus(),
        ParliamentaryQA(),
        MonthlyProductionMIS(),
        AdhocInquiry(),
    )
}


def get_template(key: str) -> Template | None:
    return _TEMPLATES.get(key)


def list_templates(db: Session) -> list[dict]:
    return [
        {
            "key": t.key,
            "title": t.title,
            "description": t.description,
            "param_schema": t.param_schema(db),
        }
        for t in _TEMPLATES.values()
    ]
