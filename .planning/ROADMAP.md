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

## ✅ M2 — Knowledge layer    (foundation for FR-7)

- Migration `0003_m2_knowledge`: `kg_entity` (typed, get-or-created named entities +
  document-specific fact nodes, `NULLS NOT DISTINCT` identity, provenance FKs),
  `kg_relation` (typed predicate, `valid_from`/`valid_to`, provenance), `doc_chunk`
  (`vector(384)` + HNSW cosine index).
- `resolver.resolve_document` — turns a doc's **accepted** (`auto_accepted` + `verified`)
  extraction fields into the graph: Mine/Block/Seam/Mineral/Subsidiary/Report/Inquiry/
  Finding entities + Reserve/ProductionFigure fact nodes; edges `located_in`, `contains`,
  `has_reserve`, `produces`, `for_mineral`, `reported_in` (the traceability edge),
  `responds_to`, `supersedes`, `mentions`. Temporal edges stamped with the "as on" date.
  Idempotent rebuild (relations + fact nodes wiped per-doc; named entities merged).
- `chunker` + `indexer.index_document` — sentence-aware overlapping chunks → embed via
  `get_embedder()` (fastembed bge-small) → upsert `doc_chunk`; embedding failure is
  non-fatal.
- `queries` — `search_entities`, `neighbors(as_of=…)`, `document_subgraph`,
  `vector_search` (cosine, role-scopeable), `graph_stats`.
- `build.build_knowledge(document_id, reindex=…)` orchestrator + audit `knowledge.built`.
  Wired into the pipeline (after extraction) and the review endpoint (graph-only rebuild
  on verify/correct/reject — verified facts flow into the graph, rejected ones drop out).
- API `/knowledge/*`: `stats`, `entities`, `entities/{id}` (+ `as_of`),
  `documents/{id}/subgraph`, `search`.
- Frontend **Knowledge Graph** page (new nav item): live stats, semantic search with
  example queries + scored chunk hits + source links, entity browser grouped by kind
  with values/confidence, entity drawer with in/out relation navigation + temporal
  stamps + provenance link. Plus a compact graph panel in the Ingestion document drawer.
- CLI: `dev.py build-kg` (`ingest_cli --build-kg`) rebuilds graph + index for all docs.
- Tests: chunker/normalize (unit) + resolver (builds graph, idempotent, temporal
  stamping, accepted-only) + neighbors/subgraph (DB-backed). **35 backend tests green**;
  `tsc`/`eslint`/`vite build` green.

**Acceptance:** `dev.py build-kg` on the 6-doc corpus → 27 entities / 35 relations / 6
chunks; the reserve doc yields Block `located_in` Mine `located_in` Subsidiary, Block
`contains` Seam `for_mineral` Coal(G6), 4 Reserve nodes `has_reserve` (valid_from
2021-04-01) each `reported_in` the Report; semantic search "manganese reserve revision"
→ the WCL correspondence at score ~0.79; verifying a subsidiary mention in the review
queue makes the Subsidiary node + `located_in` edge appear.

**Known limits (M3+):** resolver mapping is tuned to the 6 sample doc types (extend
per real CIL template); no cross-document entity co-reference beyond normalized-name
match; `supersedes` only fires within one correspondence document; graph has no
force-directed visual yet (relation list only).

---

## ✅ M3 — Module 1: Report Generation Platform    (FR-4, 5, 13)

- Migration `0004_m3_reports`: `report` (template_key, status draft/in_review/final,
  params, finalized_at/by) + append-only `report_version` (version_no, `author_kind`
  ai|human, blocks, content_md, citations, unresolved).
- **4 templates** (`app/services/reports/templates/`): Geological Reserve Status,
  Parliamentary Q&A, Monthly Production/MIS, Ad-hoc Inquiry. Each declares a
  `param_schema` the frontend renders as a form.
- **Fact binding**: structure (block→mine→subsidiary, seam, grade) from the KG;
  **figures pulled from the underlying `ExtractionField` rows** so a cited figure that
  is still `needs_review` is caught live. `CitationCollector` assigns one `[[c:N]]`
  marker per source field → `{document, page, field_key, snippet, confidence}`.
- **Extractive-first narrative**: LLM (`get_llm`) given only the gathered facts +
  markers, told never to invent a figure and to keep every marker; deterministic
  fact-join fallback when the LLM is unavailable or drops citations
  (`COALMIND_NARRATIVE_LLM=0` forces the fallback — used in tests).
- **Confidence gate**: any cited `needs_review` field → report `status=in_review`,
  listed in `unresolved`; `finalize` raises until they are verified (then `rerender`
  clears them). Audit `report.{created,rerendered,edited,finalized}`.
- **Draft history / provenance**: `rerender` appends an `ai` version; `edit` appends a
  `human` version (submitted Markdown parsed back into blocks via `mdblocks`);
  `version_diff` returns a unified diff labelled `v1 (ai) → v2 (human)`.
- **Export**: `render_html` → **xhtml2pdf** (PDF, no system deps) + **python-docx**
  (DOCX); citation markers become `[N]` with a numbered Sources list. HTML export too.
- API `/reports/*`: `templates`, list, create, get, `versions/{n}`, `rerender`, `edit`,
  `finalize`, `diff`, `export?format=pdf|docx|html`.
- Frontend **Report Builder** (new nav item): template picker + dynamic param form,
  rendered draft with **click-citation popovers** (snippet + confidence + open-source
  link), unresolved-fields banner linking to the review queue, version bar, inline
  Markdown edit → new version, version diff viewer (AI/human colour-coded), Finalise
  (disabled while unresolved), PDF/DOCX buttons.
- Tests: mdblocks round-trip + `blocks_to_markdown` (unit); create/cite-every-figure,
  needs-review-blocks-finalize (+ verify→rerender→finalize), human-edit provenance +
  diff, PDF/DOCX export (DB-backed). **42 backend tests green**; `tsc`/`eslint`/`vite
  build` green.

**Acceptance:** pick *Geological Reserve Status* + Jhanjra Block-II → draft with the 4
reserve figures each cited to `…jhanjra_2021.pdf p.1` + an LLM paragraph that keeps the
`[N]` markers; flip `proved_reserve` to needs_review → report goes *in_review*, Finalise
blocked; verify it → *draft* → Finalise → *final*; PDF/DOCX download.

**Deps:** `jinja2`, `xhtml2pdf`, `python-docx`. *(WeasyPrint swapped for xhtml2pdf to
avoid GTK/Pango system deps on Windows; it is the fidelity upgrade for production.)*

**Known limits (M4+):** templates tuned to the 4 types + current field keys; human
edit is Markdown-level (no WYSIWYG); citation popover shows snippet + page link, not a
pixel bbox overlay on the scan; parliamentary/ad-hoc pull figures broadly (officer
reviews scope).

---

## ✅ M4 — Module 3: Query & Response System    (FR-7, 8, 9)

- Migration `0005_m4_query`: `qa_pair` — every question asked + its answer + evidence
  trace + `question_embedding vector(384)` (HNSW). `status` = answered / verified /
  insufficient / rejected; `answer_mode` = rag / search_only / cache; `hit_count`.
- `rag/retrieve.py` — **graph-aware retrieval**: (a) match named entities in the
  question → their `has_reserve`/`produces` fact nodes → high-precision `Evidence` with
  the fact's `source_field_id` (exact traceability); (b) `pgvector` passage search over
  `doc_chunk`. Role-scoped (`subsidiary_id` + national). Merged, ranked by score.
- `rag/answer.py` — **extractive-first composition**: LLM constrained to the numbered
  sources, must keep `[n]` after every figure, must reply `INSUFFICIENT` when they don't
  answer. **Declines** (`status=insufficient`) below the evidence floor or when only weak
  passages back it (FR-8). **Search-only mode** (returns ranked sources) when `get_llm()`
  raises `LLMUnavailable`. Confidence = f(fact score, passage score), flagged below
  `CONFIDENCE_THRESHOLD`.
- `rag/cache.py` — **verified-answer cache**: cosine lookup over verified `qa_pair`
  embeddings (≥0.90 similarity → reuse verbatim, ~0.2 s; well under the <5 s target);
  `promote_answer` / `reject_answer` (officer), audited.
- `rag/engine.py` — `ask()`: cache lookup → retrieve → compose → persist; audit
  `query.{answered,declined,cache_hit,verified,rejected}`.
- API `/query`: `POST` ask, `GET /history`, `GET /cache`, `GET /{id}`,
  `POST /{id}/verify`, `POST /{id}/reject`.
- Frontend **Ask CoalMind** chat (new nav item): question box + examples, answer with
  clickable `[n]` citation popovers (snippet + relevance + open-source), confidence bar,
  mode badge (RAG / search-only / verified cache), collapsible source chain,
  insufficient / low-confidence styling, per-answer **Verify → cache** / **Reject**.
- Tests: normalize/compose (unit — decline paths, deterministic markers) + fact-backed
  answer, decline-when-nothing-relevant, cache hit after verify + audit, reject
  (DB-backed). **50 backend tests green**; `tsc`/`eslint`/`vite build` green.

**Acceptance:** "manganese reserve estimates for Wani North before and after the 2019
revision" → *"revised from 1.42 MT to 1.15 MT … as stated in the 1998 revision `[1]`.
There are no further estimates after 2019 in the sources."* (answered the before/after,
flagged the false 2019 premise, cited, no fabrication). Verify it → paraphrase →
**cache hit** in ~0.2 s. "Talcher opencast safety status in 2025" → *insufficient*.

**Known limits (M5+):** entity match is token-overlap (no fuzzy/alias); with the LLM
disabled a topically-adjacent-but-unanswerable question yields a low-confidence
"answered" rather than a decline (the LLM path returns INSUFFICIENT correctly);
temporal `supersedes` reasoning is surfaced from the source text, not walked in the graph.

---

## ▶ M5 — Module 2: Topic & Word Cloud    (FR-6)

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
