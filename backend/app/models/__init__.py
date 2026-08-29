"""ORM models. Importing this package registers every table on ``Base.metadata``
(Alembic autogenerate and ``Base.metadata.create_all`` both rely on that).
"""

from app.models.anomaly import (
    Anomaly,
    AnomalyKind,
    AnomalySeverity,
    AnomalyStatus,
)
from app.models.audit import AuditEvent
from app.models.document import Document, DocumentStatus, ExtractionField, FieldStatus
from app.models.knowledge import (
    DocChunk,
    EntityKind,
    KGEntity,
    KGRelation,
    Predicate,
)
from app.models.organization import Subsidiary, User, UserRole
from app.models.query import QAPair, QAStatus
from app.models.report import Report, ReportStatus, ReportVersion, VersionAuthor
from app.models.topic import Topic, TopicDoc

__all__ = [
    "Anomaly",
    "AnomalyKind",
    "AnomalySeverity",
    "AnomalyStatus",
    "AuditEvent",
    "DocChunk",
    "Document",
    "DocumentStatus",
    "EntityKind",
    "ExtractionField",
    "FieldStatus",
    "KGEntity",
    "KGRelation",
    "Predicate",
    "QAPair",
    "QAStatus",
    "Report",
    "ReportStatus",
    "ReportVersion",
    "Subsidiary",
    "Topic",
    "TopicDoc",
    "User",
    "UserRole",
    "VersionAuthor",
]
