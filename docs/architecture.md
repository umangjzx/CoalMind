# CoalMind AI — Architecture

Companion to [`PRD.md`](PRD.md) §7. This describes **what the code actually does**, layer
by layer, and the state at each milestone. Domain model: [`entity-schema.md`](entity-schema.md).

## 1. Layered view

```
┌───────────────────────────────────────────────────────────────────────┐
│ APPLICATION            React + Vite + Tailwind SPA (frontend/)         │
│                        Dashboard · Ingestion/Review · Report Builder · │
│                        Ask CoalMind · Topics · Admin                   │
└───────────────┬───────────────────────────────────────────────────────┘
                │  HTTP / JSON  (FastAPI, backend/app/api)
┌───────────────▼───────────────────────────────────────────────────────┐
│ INTELLIGENCE           reports/  rag/  topics/  (+ anomaly detector)   │
│                        all consume the Knowledge layer + LLM provider  │
├───────────────────────────────────────────────────────────────────────┤
│ KNOWLEDGE              knowledge/  — KG (kg_entity/kg_relation, Postgres)│
│                        + vector store (pgvector) + document store (MinIO)│
├───────────────────────────────────────────────────────────────────────┤
│ EXTRACTION & VALIDATION  extraction/  — NER, confidence scoring,        │
│                        business-rule checks, review-queue routing      │
├───────────────────────────────────────────────────────────────────────┤
│ INGESTION              ingestion/  — classifier, OCR (Tesseract),      │
│                        digital-PDF + table parsing, hash dedupe        │
└───────────────────────────────────────────────────────────────────────┘

Cross-cutting: app/audit (append-only trail), app/core (config/db/logging),
app/services/llm + app/services/embeddings (provider abstractions), RBAC (M6).
```

## 2. Component responsibilities

| Package | Responsibility | Milestone |
|---|---|---|
| `app/core/config.py` | One typed `Settings` object; nothing else reads the environment | M0 |
| `app/core/db.py` | SQLAlchemy engine + `get_db()` dependency; `Base` for models | M0 |
| `app/models/` | ORM tables — `Subsidiary`, `User`, `Document`, `ExtractionField`, `AuditEvent` (KG + report + RAG tables added later) | M0 → |
| `app/services/llm/` | `LLMProvider` protocol; `OllamaProvider` (default), `AnthropicProvider` (gated by `ALLOW_THIRD_PARTY_API`); `get_llm()` factory | M0 |
| `app/services/embeddings/` | `Embedder` protocol; `FastEmbedEmbedder` (default, on-prem), `OllamaEmbedder`; `get_embedder()` factory | M0 |
| `app/services/storage/` | MinIO wrapper — content-addressed `put_document`, `get_bytes`, presigned URLs | M0 |
| `app/audit/writer.py` | `record_event(db, …)` — the only way to write the append-only trail; SHA-256 hash-chained | M0 |
| `app/services/ingestion/` | Document classifier → OCR / digital text + table extraction | M1 |
| `app/services/extraction/` | Mining-domain NER, per-field confidence, rule validation, review-queue routing | M1 |
| `app/services/knowledge/` | Entity resolution → `kg_entity`/`kg_relation`; chunk + embed → pgvector; provenance rows | M2 |
| `app/services/reports/` | Jinja templates, citation assembly, confidence gating, draft versioning, PDF/DOCX export | M3 |
| `app/services/rag/` | Graph-aware retrieval, extractive-first answer composition, verified-answer cache | M4 |
| `app/services/topics/` | BERTopic/LDA, trend aggregation, term normalization, topic synthesis | M5 |
| `app/workers/` | Background pipeline runner (arq + Redis) — ingestion/extraction run off the request path | M1 |

## 3. Key data-flow: ingestion → answerable knowledge  (M1–M2)

1. **Upload** (`POST /ingestion/documents`) → bytes hashed → `ObjectStore.put_document`
   (dedupe by SHA-256) → `Document(status=received)` row → audit `document.ingested`.
2. **Pipeline** (worker): classify doc_type/language → OCR or digital text extraction →
   table/form parsing → produces candidate `ExtractionField` rows with `{page_no, bbox,
   source_snippet, confidence}`.
3. **Validation:** business rules cross-check against existing KG facts for the same
   entity. Fields with `confidence ≥ CONFIDENCE_THRESHOLD` → `auto_accepted`; below →
   `needs_review` and the document → `needs_review`.
4. **Review** (`/review/queue`): officer confirms/corrects → `verified`; audit
   `field.verified` records old/new value + actor.
5. **Knowledge build:** accepted fields resolve to `kg_entity` nodes and `kg_relation`
   edges (temporally valid); text chunks are embedded into the pgvector index; every
   fact keeps a provenance link back to its `ExtractionField`.

## 4. Key data-flow: a cited answer  (M4)

```
question ──▶ verified-answer cache?  ──hit──▶ return cached answer + original citations  (<5s target)
   │ miss
   ▼
scope by role (subsidiary + national) ─▶ graph-aware retrieval:
   entity/relation lookup in KG  +  vector search over pgvector chunks
   ─▶ assemble candidate source spans (each linked to a Document + page + field)
   ─▶ LLM composes an EXTRACTIVE-FIRST answer over those spans only
   ─▶ if best support confidence < threshold: return "insufficient confidence" + what was found
   ─▶ else: answer + source chain  (<20s target)
officer marks answer verified ─▶ promoted into the verified-answer cache
```

If `get_llm()` raises `LLMUnavailable`, the query endpoint degrades to returning ranked
source spans (search-only mode) instead of failing — see PRD NFR "graceful degradation".

## 5. Report generation  (M3)

Template (Jinja) declares slots, each bound to a KG query or extracted field. The engine
fills slots, attaches a citation footnote `{document_id, page_no, field_key}` to every
figure, and **blocks finalization** while any bound field is `needs_review`. Draft
versions are stored with an AI-vs-human diff so an auditor can see exactly what a human
changed. Export: WeasyPrint (PDF) / python-docx (DOCX) in CIL-style layouts.

## 6. Deployment

- **Dev:** `docker compose` runs Postgres (pgvector) + MinIO; FastAPI and Vite run on the
  host with reload. Ollama runs on the host (`localhost:11434`).
- **Target:** container images for backend + frontend + worker; Postgres, MinIO/S3,
  Redis, and an on-prem open-weight LLM server as managed services. k8s/Helm manifests
  land in M7 for on-prem / MeghRaj (GI Cloud). No component depends on a hosted API when
  `ALLOW_THIRD_PARTY_API=false`.

## 7. Security posture (hardened in M6)

- Sovereignty gate in `get_llm()` — hosted providers refused unless explicitly allowed.
- RBAC: every query and document row carries a `subsidiary_id`; row-level scoping filters
  results to the caller's subsidiary + national scope.
- Audit trail is append-only and hash-chained; no update/delete paths.
- Secrets via environment / mounted secrets; encryption at rest (DB + object store) and
  in transit (TLS) configured at deployment.
