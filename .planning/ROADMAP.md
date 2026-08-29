# ROADMAP — CoalMind AI

Milestone-by-milestone. Each milestone ends with UAT against the mapped FR IDs and PRD
success metrics. FR IDs → [`docs/PRD.md`](../docs/PRD.md) §8.

Legend: ✅ done · ▶ next · ⬚ planned

---

## ✅ M0 — Scaffold, infra, provider abstraction, docs

Monorepo + git · `docker-compose` (Postgres 16 + pgvector, MinIO) · FastAPI skeleton
(`/health`, `/version`) · `LLMProvider` (Ollama default, Anthropic gated by
`ALLOW_THIRD_PARTY_API`) + `Embedder` (fastembed bge-small) abstractions · MinIO
content-addressed store · append-only hash-chained audit writer · baseline Alembic
migration (`subsidiary`, `app_user`, `document`, `extraction_field`, `audit_event`) ·
seed (9 subsidiaries incl. national, 5 demo users) · synthetic sample corpus (6 PDFs +
ground-truth JSON) · React + Vite + Tailwind shell with the 6 module routes + live health
badge · `scripts/dev.py` task runner · docs (PRD, architecture, entity-schema).

**Acceptance:** `python scripts/dev.py bootstrap` then `api` + `web` → dashboard shell
loads, `/health` green (db/storage/llm/embeddings), `pytest` + `tsc` + `vite build` pass.

---

## ✅ M1 — Ingestion & Extraction pipeline    (FR-1, 2, 3, 5, 10, 15)

- `POST /ingestion/documents` (single + bulk multipart) → content-addressed MinIO store,
  SHA-256 dedupe, `Document` row; `GET` list/detail, `/file` (presigned), `/reprocess`.
- Self-contained pipeline `run_pipeline(document_id)` run as a FastAPI `BackgroundTask`
  and from a CLI (`app.workers.ingest_cli`; `dev.py ingest-samples` / `--reprocess`).
  *(arq + Redis queue deferred — not needed at hackathon scale; swap-in point is ready.)*
- `page_extract`: pdfplumber text + word bboxes; **Tesseract OCR fallback** for pages with
  no text layer and for image uploads (per-word OCR confidence captured).
- Rule-based classifier (6 CIL doc types + language + as-on date).
- Extraction: table-driven regex `Spec`s per doc type + spaCy NER + mining gazetteer
  (seam / borehole ID / grade / subsidiary) → `ExtractionField` rows with
  `{page_no, bbox{unit,page_w,page_h,dpi}, source_snippet}`, `extractor`, `source_kind`.
- `confidence.score`: OCR penalty (informed by Tesseract per-word conf), context damping,
  ≤0.97 cap. `CONFIDENCE_THRESHOLD` routes `auto_accepted` vs `needs_review`; document
  status transitions (`received→processing→needs_review|ready|extracted|failed`).
- Business-rule `validate`: reserve categories vs stated total, date plausibility,
  percentage range → lowers confidence + attaches note (→ review queue).
- Review queue: `GET /review/queue`, `POST /review/fields/{id}` (confirm / correct /
  reject) → `verified`/`rejected`, keeps `original_value_text`, recomputes doc status,
  audit `field.{action}` with before/after + actor (`X-Actor-Email` until M6 auth).
- Frontend **Ingestion & Review**: drag-drop upload, live documents table, review queue
  with inline confirm/correct/reject + confidence bars + source snippet + "open source"
  link (`#page=N`), document drawer showing all fields + pipeline notes.
- Tests: classifier, extraction rules + validation + OCR damping (unit); review flow +
  audit (DB-backed, auto-skip offline). 28 backend tests green; `tsc`/`eslint` green.

**Acceptance:** `dev.py ingest-samples` classifies all 6 corpus docs, extracts the
ground-truth reserve/production figures with citations, routes low-confidence + NER
mentions to review; UI confirm decrements the queue and writes an audit row.

**Deps added:** `pdfplumber`, `pypdf`, `pytesseract`, `pillow`, `spacy` + `en_core_web_sm`,
`python-dateutil`. *(`camelot`/`redis` deferred.)*

**Known limits (M2+):** validation cross-checks are intra-document only (historical KG
comparison needs M2); bbox is stored but the UI shows snippet + page link, not a pixel
overlay (M3 Report Builder); background tasks block a worker thread under burst — fine
here, queue worker is the scale path.

---

## ▶ M2 — Knowledge layer    (foundation for FR-7)

- `kg_entity` + `kg_relation` tables (typed, temporally valid — `valid_from`/`valid_to`).
- Entity resolution / linking from accepted `ExtractionField` rows → nodes + edges.
- Chunking + embedding of document text into a `pgvector` index (`Embedder` abstraction).
- Provenance rows: every node/edge that carries a figure links to its `ExtractionField`
  (`reported_in` edge with `{document_id, page_no, bbox}`).
- Graph query helpers: temporal ("as of / before / after"), cross-entity, aggregation.
- Doc: freeze entity schema against a real CIL template set.

---

## ⬚ M3 — Module 1: Report Generation Platform    (FR-4, 5, 13)

- Jinja template engine; 4 templates: Parliamentary Q&A, Geological Reserve Status,
  Monthly Production/MIS, Ad-hoc Inquiry.
- Slot binding to KG queries / extracted fields; citation footnote
  `{document_id, page_no, field_key}` on every figure.
- Confidence-aware drafting: finalization blocked while any bound field is `needs_review`.
- Draft versioning + AI-vs-human provenance diff.
- Export: WeasyPrint (PDF) + python-docx (DOCX) in CIL-style layouts.
- Frontend: **Report Builder** — template picker, live draft, click-citation → highlighted
  scan, draft history, finalize/export.

---

## ⬚ M4 — Module 3: Query & Response System    (FR-7, 8, 9)

- Graph-aware retrieval (KG lookup + vector search) with role scoping (subsidiary + national).
- Extractive-first answer composition over retrieved source spans; full source chain.
- Low-confidence → decline/flag with "what was found", never fabricate (FR-8).
- Verified-answer cache: officer-approved Q&A pairs promoted for instant reuse (<5s).
- Graceful degradation to search-only when `get_llm()` raises `LLMUnavailable`.
- Frontend: **Ask CoalMind** chat — answer + source panel + confidence badges + "verify".

---

## ⬚ M5 — Module 2: Topic & Word Cloud    (FR-6)

- BERTopic (primary) + scikit-learn LDA (fallback) over domain embeddings.
- Trend-over-time aggregation by subsidiary / date / doc type.
- Drill-down: topic → source documents + LLM one-paragraph synthesis of the driver.
- Multilingual term normalization (khadan / mine / colliery; Hindi–English–transliteration).
- Frontend: **Topics & Trends** — word cloud + rising/falling timeline + drill-down.

---

## ⬚ M6 — Security, RBAC, Admin, Audit    (FR-9, 10, 12; NFRs)

- JWT auth (access/refresh); password hashing; login/session.
- RBAC per subsidiary + role; row-level scoping enforced on every query/document path.
- Audit log hardening: hash-chain verification endpoint; no update/delete paths anywhere.
- Admin console: ingestion monitoring, model-performance metrics, review-queue mgmt,
  user/role mgmt.
- `ALLOW_THIRD_PARTY_API=false` hard-enforced end to end; encryption at rest/in transit config.
- Graceful-degradation + availability behaviors verified.

---

## ⬚ M7 — Anomaly detection, Hindi, hardening, deploy    (FR-11, 14; PRD phases 4–7)

- FR-14: anomaly/inconsistency detection between historical and new data per entity.
- FR-11: Hindi documents + queries end to end (OCR, NER, embeddings, answers).
- Accuracy benchmarking harness vs `ml/sample_corpus/ground_truth/` (≥90% digital /
  ≥75% degraded; effective ~99% with review).
- Performance validation (<5s cached, <20s fresh RAG); load test.
- k8s / Helm manifests for on-prem / MeghRaj; CI pipeline.
- Officer usability pass; ui-ux-pro-max full design system applied across all screens.
