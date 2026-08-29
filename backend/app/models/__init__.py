"""ORM models. Importing this package registers every table on ``Base.metadata``
(Alembic autogenerate and ``Base.metadata.create_all`` both rely on that).
"""

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

__all__ = [
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
    "Subsidiary",
    "User",
    "UserRole",
]
