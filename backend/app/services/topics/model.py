"""Topic modelling engine.

NMF over TF-IDF of normalised text is the working engine — robust on a small,
short-document corpus. BERTopic (with the embeddings already stored in
`doc_chunk`) is used instead when it is installed and explicitly requested;
otherwise the code falls back to NMF.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.core.logging import get_logger
from app.services.topics.normalize import DOMAIN_STOPWORDS, normalized_text

log = get_logger(__name__)


@dataclass(slots=True)
class TopicResult:
    topic_index: int
    terms: list[dict]  # [{term, weight}]
    members: list[tuple[str, float]]  # (document_id, weight)
    label: str = ""


@dataclass(slots=True)
class ModelInput:
    document_ids: list[str]
    texts: list[str]
    embeddings: list[list[float]] | None = field(default=None)


def fit_topics(
    data: ModelInput, *, n_topics: int = 5, engine: str = "nmf"
) -> tuple[list[TopicResult], str]:
    n_docs = len(data.texts)
    if n_docs < 2:
        return [], engine
    k = max(2, min(n_topics, n_docs))

    if engine == "bertopic":
        try:
            return _fit_bertopic(data, k), "bertopic"
        except Exception as exc:  # noqa: BLE001
            log.warning("BERTopic unavailable, falling back to NMF: %s", exc)

    return _fit_nmf(data, k), "nmf"


def _fit_nmf(data: ModelInput, k: int) -> list[TopicResult]:
    import numpy as np
    from sklearn.decomposition import NMF
    from sklearn.feature_extraction.text import TfidfVectorizer

    docs = [normalized_text(t) for t in data.texts]
    vec = TfidfVectorizer(
        ngram_range=(1, 2), min_df=1, max_df=0.9,
        stop_words=list(DOMAIN_STOPWORDS), token_pattern=r"(?u)\b[a-z][a-z_]{2,}\b",
    )
    X = vec.fit_transform(docs)
    if X.shape[1] == 0:
        return []
    k = min(k, X.shape[1], X.shape[0])

    model = NMF(n_components=k, init="nndsvda", random_state=42, max_iter=500)
    W = model.fit_transform(X)   # doc x topic
    H = model.components_         # topic x term
    vocab = np.array(vec.get_feature_names_out())

    results: list[TopicResult] = []
    for ti in range(k):
        top_idx = H[ti].argsort()[::-1][:12]
        terms = [
            {"term": str(vocab[j]), "weight": round(float(H[ti][j]), 4)}
            for j in top_idx if H[ti][j] > 0
        ]
        col = W[:, ti]
        thresh = max(0.05, 0.4 * float(col.max()) if col.max() > 0 else 0.05)
        members = [
            (data.document_ids[d], round(float(col[d]), 4))
            for d in range(len(col))
            if col[d] >= thresh
        ]
        # ensure every doc lands in its single best topic even if below threshold
        results.append(
            TopicResult(topic_index=ti, terms=terms, members=members,
                        label=", ".join(t["term"] for t in terms[:4]))
        )

    # assign orphan docs (no topic above threshold) to their argmax topic
    assigned = {d for r in results for d, _ in r.members}
    best = W.argmax(axis=1)
    for d, doc_id in enumerate(data.document_ids):
        if doc_id not in assigned:
            results[int(best[d])].members.append((doc_id, round(float(W[d, best[d]]), 4)))

    return [r for r in results if r.terms]


def _fit_bertopic(data: ModelInput, k: int) -> list[TopicResult]:
    import numpy as np
    from bertopic import BERTopic

    docs = [normalized_text(t) for t in data.texts]
    emb = np.array(data.embeddings) if data.embeddings else None
    model = BERTopic(nr_topics=k, calculate_probabilities=True, verbose=False)
    topics, _ = model.fit_transform(docs, embeddings=emb)

    results: list[TopicResult] = []
    for ti in sorted(set(topics)):
        if ti == -1:  # BERTopic outlier bucket
            continue
        words = model.get_topic(ti) or []
        terms = [{"term": w, "weight": round(float(s), 4)} for w, s in words[:12]]
        members = [
            (data.document_ids[i], 1.0) for i, t in enumerate(topics) if t == ti
        ]
        results.append(
            TopicResult(topic_index=int(ti), terms=terms, members=members,
                        label=", ".join(t["term"] for t in terms[:4]))
        )
    return results
