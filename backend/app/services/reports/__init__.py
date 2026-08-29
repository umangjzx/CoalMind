"""Report Generation Platform (M3, PRD Module 1).

Templates bind their slots to knowledge-graph facts; every figure gets a citation
back to an ExtractionField (-> document, page). Low-confidence bound fields block
finalisation. Draft history records whether the AI or a human produced each version.
"""

from app.services.reports.engine import (
    add_human_edit,
    create_report,
    finalize_report,
    rerender_report,
    version_diff,
)
from app.services.reports.registry import get_template, list_templates

__all__ = [
    "add_human_edit",
    "create_report",
    "finalize_report",
    "rerender_report",
    "version_diff",
    "get_template",
    "list_templates",
]
