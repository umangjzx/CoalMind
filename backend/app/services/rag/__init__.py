"""Graph-aware RAG query engine (M4, PRD Module 3).

    ask(db, question, subsidiary_id=…, actor=…) -> QAPair

Pipeline: verified-answer cache lookup -> graph + vector retrieval ->
extractive-first cited answer -> decline if nothing is confident enough (FR-8) ->
search-only mode if the LLM is unavailable.
"""

from app.services.rag.cache import promote_answer, reject_answer
from app.services.rag.engine import ask

__all__ = ["ask", "promote_answer", "reject_answer"]
