"""Knowledge layer: turn accepted extractions into a queryable domain graph +
an embedded document index.

    build_knowledge(db, document_id)          # resolve entities + (re)index chunks
    build_knowledge(db, document_id, reindex=False)   # graph only (used on review)
"""

from app.services.knowledge.build import build_knowledge

__all__ = ["build_knowledge"]
