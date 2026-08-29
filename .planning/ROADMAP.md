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

## ✅ M5 — Module 2: Topic & Word Cloud    (FR-6)

- Migration `0006_m5_topics`: `topic` (run_id, topic_index, engine, label, `terms`
  JSONB, doc_count, `summary`, first_seen/last_seen) + `topic_doc` (topic→document,
  weight). The API always serves the latest `run_id`.
- `topics/normalize.py` — **multilingual term normalisation**: variant→canonical
  (khadan / khadaan / colliery / opencast → `mine`; bhandar → `reserve`; utpadan →
  `production`; roman-Hindi function words) + a domain stoplist (coal, limited, report,
  subsidiary codes, months…). Devanagari tokens retained.
- `topics/model.py` — `TopicEngine`: **scikit-learn NMF over TF-IDF** of normalised
  text (robust on the short 6-doc corpus); **BERTopic** slot is import-guarded and uses
  the embeddings already in `doc_chunk` when installed + requested, else falls back to
  NMF. Returns top terms + weighted member docs; every doc lands in its best topic.
- `topics/wordcloud.py` — `word_frequencies` over chunk text, normalised, filterable by
  subsidiary / doc_type / since-date; returns `{term, count, weight}`.
- `topics/synthesize.py` — LLM one-paragraph "what's driving this theme" from the
  topic's terms + source snippets (deterministic fallback; `COALMIND_NARRATIVE_LLM=0`).
- `topics/queries.py` — `list_topics`, `topic_documents`, `ensure_summary` (lazy),
  `trends` (per-topic doc counts bucketed by `document.doc_date` year-month, scopeable).
- `topics/build.py` — `rebuild_topics` wipes the prior run, fits, persists, audits
  `topics.rebuilt`.
- API `/topics`: `GET /wordcloud`, `GET ""` (current set), `GET /trends`,
  `POST /rebuild?n_topics&engine`, `GET /{id}` (detail + member docs + summary).
- `dev.py topics` CLI.
- Frontend **Topics & Trends** (new nav item): weighted **word cloud** (font-size by
  frequency, doc-type filter), **topic list** (label / terms / doc count / date span),
  **trends** small-multiples (inline SVG bars per topic per month), **Rebuild topics**,
  topic drawer (term chips + LLM driver paragraph + linked member documents).
- Tests: canon/tokenize (folds variants, drops stopwords, keeps Devanagari) + NMF
  theme separation (unit) + word-cloud type filter, rebuild + trends + audit,
  lazy summary (DB-backed). **56 backend tests green**; `tsc`/`eslint`/`vite build` green.

**Acceptance:** `dev.py topics` on the 6-doc corpus → 5 NMF topics (reserve/manganiferous,
production/shortfall, belt-conveyor safety, borehole/seam, parliamentary/subsidiary);
word cloud shows normalised domain vocab (khadan/colliery folded into "mine"); a topic's
drill-down gives the `gpt-4o-mini` driver paragraph + its 2 source docs; trends buckets
the docs by 2019-12 / 2021-04 / 2023-11 / 2024-07.

**Deps:** `scikit-learn`. *(BERTopic/umap/hdbscan not added — heavy C builds on Windows,
and NMF is better on this corpus size; the BERTopic path activates if it's installed.)*

**Known limits (M6+):** corpus is small so topics ≈ documents; trend timeline is sparse
(one doc per period); `bertopic` engine option needs the package installed.

---

## ✅ M6 — Security, RBAC, Admin, Audit    (FR-9, 10, 12; NFRs)

- Migration `0007_m6_security`: `app_user.last_login_at` + `audit_event` target index.
- `core/security.py` — **bcrypt** password hash/verify (72-byte safe; passlib dropped
  for the passlib↔bcrypt-4.x break) + **JWT** access/refresh (HS256, typed, TTL).
- `/auth`: `POST /login` (→ access + refresh + user; audits `auth.login` /
  `auth.login_failed`), `POST /refresh`, `GET /me`.
- **`Principal` dependency** (`api/deps.py`) replaces the `X-Actor-Email` placeholder:
  a valid `Bearer` → real user; no token + `AUTH_REQUIRED=false` (dev default) → acts
  as the seeded `data_admin` so M1-M5 keep working; `AUTH_REQUIRED=true` → 401.
  `require_roles(...)` gate; `principal.scoped` for subsidiary-bound roles.
- **RBAC row-scoping**: `GET /ingestion/documents`, `/review/queue`, `POST /query` now
  filter to `subsidiary_id == principal.subsidiary_id OR IS NULL` for scoped principals;
  a scoped query outside the officer's subsidiary → 403. Verified: a CCL geologist sees
  CCL + national docs, not ECL's; a data_admin sees all.
- **Audit hardening**: `audit/verify.py` re-walks the log by `seq`, recomputes each
  `entry_hash` from the canonical body + `prev`, and reports `first_broken_seq` on
  tamper. The writer is the only path — no update/delete routes exist.
- **Admin API** (`/admin`, data_admin; overview/audit/security also ministry_official):
  `GET /overview` (platform counts + security posture), `GET /security`,
  `GET /audit` + `GET /audit/verify`, `GET /users` + `POST /users` +
  `PATCH /users/{id}` + `POST /users/{id}/password`, `GET /extraction-quality`
  (auto-accept rate, mean confidence, review outcomes, OCR ratio, per-doc-type),
  `GET /ingestion` (recent docs + failures). All mutations audited.
- **Sovereignty enforcement**: with `ALLOW_THIRD_PARTY_API=false` + a hosted
  `LLM_PROVIDER`, `get_llm()` raises `LLMUnavailable` → reports fall to deterministic
  prose, RAG to **search-only** (no data leaves the box); `/health` shows `llm: blocked`
  and `/admin/security` shows `effective: blocked -> degraded`. Verified end to end.
- Frontend: **Login** screen (demo-account shortcuts, "continue without signing in"),
  `lib/auth.ts` token store + `api` bearer injection + 401 auto-clear, header user chip
  + Logout, and the **Admin console** (overview + security posture with re-verify,
  users table with inline role / active edits + add-user, audit log, extraction quality).
- Tests: bcrypt + JWT (unit); login / me / refresh / bad-password; audit-chain verify +
  **tamper detection**; admin role gates (403 for geologist); full user lifecycle
  (create → patch role → set password → login); **document row-scoping** (geologist vs
  admin). **69 backend tests green**; `tsc`/`eslint`/`vite build` green.

**Acceptance:** login as `admin@coalindia.in` / `coalmind` → Admin console shows live
counts, `audit hash-chain: intact (N events)`, editable users; `geologist@ccl.co.in` is
`scoped`, gets 403 on `/admin/*`, and only sees CCL + national documents; flipping
`ALLOW_THIRD_PARTY_API=false` degrades the LLM to on-prem-only without breaking answers.

**Deps:** `bcrypt` (replaced `passlib[bcrypt]`).

**Known limits (M7):** row-scoping applied to documents / review / query (reports,
knowledge, topics still admin-wide); no refresh-token rotation / revocation list;
encryption at rest/in transit is a deployment concern (TLS + DB/MinIO config), not code.

---

## ✅ M7 — Anomaly detection + Hindi support    (FR-11, 14; PRD phases 4–7)

- Migration `0008_m7_anomaly`: `anomaly` table (`kind`, `severity`, `status`, `title`,
  `detail`, `entity_id`→`kg_entity`, `subsidiary_id`, `evidence` JSONB, reviewer +
  `note`) with a unique `signature` for idempotent upsert; 3 enums.
- **FR-14 anomaly detection** (`services/anomaly/detect.py`): compares knowledge-graph
  fact nodes (reserves, production figures) for the same anchor entity + category and
  flags five kinds —
  `revision` (figure changed across "as-on" dates — historical vs new),
  `contradiction` (different values for the same period),
  `sum_mismatch` (proved+indicated+inferred ≠ stated total),
  `out_of_range` (negative reserve, % outside 0–100, non-positive stripping ratio),
  `trend_break` (a metric value >2.5σ from the entity's own history).
  `_diff` ignores <2% / <0.01 rounding noise. Revision/contradiction findings are
  collapsed to one row per anchor (a report revising 4 category figures → one anomaly,
  4 evidence pairs). `scan_anomalies()` upserts by `signature` — new rows created,
  open rows refreshed, open rows that no longer reproduce auto-resolved — and audits
  `anomaly.scan` with counts by kind.
- **API** (`/anomalies`): `GET` list (filters: status / kind / severity; sorted
  open→terminal then severity; returns `open_count` + `by_kind` / `by_severity`
  rollups; RBAC-scoped to the principal's subsidiary + national), `GET /{id}`,
  `POST /scan`, `POST /{id}/review` (acknowledge / resolve / dismiss + note, records
  reviewer + `anomaly.review` audit). `dev.py anomalies` CLI.
- **FR-11 Hindi / bilingual**: `ocr_languages` setting (`eng+hin`) with a probe that
  degrades to the installed subset — `page_extract._ocr_lang()` — and a per-call
  Tesseract fallback to `eng` if a pack fails to load (host here has `eng`/`osd`
  only); classifier `_RULES` gain Devanagari + roman-Hindi aliases per doc type
  (खान/भंडार/मासिक उत्पादन/लोक सभा/निरीक्षण …); RAG system prompt now answers in the
  question's language; sample corpus gains a Hindi/English monthly-production MIS
  (`monthly_production_mis_nigahi_2023_09_hindi.txt`, UTF-8 — no Devanagari font
  needed) + a conflicting `geological_reserve_status_jhanjra_2023.pdf` (same block,
  proved reserve 182.4→176.5 MT) so a real revision anomaly exists to demo.
- **Retrieval precision fix** (`rag/retrieve.py`): `match_entities` no longer links an
  entity to a question on generic name tokens ("block", "mine", "reserve", …) — only
  distinctive tokens — so unrelated blocks stop crowding the cited sources.
- Frontend: **Anomalies** screen (severity dot, kind badge, collapsible evidence table
  with per-source `{file, page, field, value, as-on}`, status tabs, Rescan,
  Acknowledge / Resolve / Dismiss with a note) + `/anomalies` route + nav item;
  **Dashboard** made real — live corpus / review-queue / KG / topic counts from
  `/admin/overview` and an "Open anomalies" panel linking through.
- Tests (`tests/test_anomaly.py`): `_diff` unit; DB-backed cross-document `revision`
  scan with traceable evidence + no false `sum_mismatch`; idempotent re-scan
  (`created == 0`); `/anomalies` list + `/{id}/review` status transition. Hindi
  classifier aliases covered in `test_classifier.py`. **73 backend tests green**;
  `ruff`, `tsc`, `eslint`, `vite build` green; `0008` migration down/up round-trips.

**Acceptance:** `dev.py ingest-samples` then `dev.py anomalies` → one `revision`
anomaly, "Jhanjra Block-II: figures revised across reports (4 fields)", evidence citing
`geological_reserve_status_jhanjra_2021.pdf` vs `…_2023.pdf`; the Anomalies screen shows
it and Acknowledge/Resolve moves it between tabs; the Hindi MIS ingests, classifies as
`monthly_production_mis`, and is retrievable.

**Deps:** none added.

**Deferred (post-hackathon):** perf/load validation (<5 s cached, <20 s fresh); k8s /
Helm manifests for MeghRaj + CI pipeline; installing `hin.traineddata` for real
Devanagari OCR; full ui-ux-pro-max design-system pass across all screens.

---

## ✅ Hardening — extraction-accuracy benchmark

- `scripts/eval_extraction.py` (+ `dev.py eval`) scores the sample corpus through the
  real `extract_pages → classify → extract_fields` path with **no database**, so the
  number is a pure function of code + corpus and safe for CI. Split digital vs
  degraded-scan it reports: classification & language accuracy, field **precision /
  recall / F1** over the fields the rules engine targets, **coverage** (share of
  ground-truth fields even attempted), and **effective accuracy after review** —
  `1 − (silent_error + silent_miss) / N`, where a *silent error* is a wrong value
  auto-accepted ≥ threshold and a *silent miss* is a ground-truth field never
  extracted (nothing queues it for a human).
- `GT_ALIASES` maps every ground-truth key to the extractor key(s) that can produce
  it; unmapped keys are counted as coverage gaps, not misses. Value comparison:
  0.5 % numeric tolerance, date-parse-and-compare, and abbrev-aware token-subset for
  text (so "Kusmunda OC" ≡ "Kusmunda Opencast").
- Fixes it surfaced: `mine_name` / `block_name` rules were greedy across column gaps
  — pdfplumber collapses the whitespace so "Mine : Nigahi Opencast Date : 14.11.2023"
  was captured whole → new `_COL_VAL` pattern stops at the line end, a 2-space gap, or
  the next inline `Label :` (same fix applied to the `mention_mine` NER path); the
  degraded-scan ground truth was a paraphrase not the literal subject line and was
  missing `reference_no` / `letter_date` / revised+superseded figures.
- **New rules for every remaining gap** (`extraction/rules.py`): `coal_production_target`
  + `coal_production_achievement_pct` (2nd / 3rd number on the "Coal Production" row),
  `question_topic` (parliamentary), `finding` (first numbered observation on an
  inspection note), `seams_intersected` + a `mine_name` derived from the block name
  ("Talcher Expansion Block-A" → Talcher) for borehole logs, and a prose `mine_name`
  ("… at Wani North is revised …") for correspondence. Low-confidence derivations
  (0.62–0.72) land in the review queue by design.
- `tests/test_extraction_eval.py` gates it: classification ≥ 85 %, digital F1 ≥ 0.90,
  **zero silent errors / misses**, effective accuracy ≥ 0.95, **coverage ≥ 0.95**.
  Current sample-corpus score: **8/8 classification, F1 = 1.00 (digital + degraded),
  coverage 100 %** (46/46 extractable ground-truth fields; annotator meta-notes are
  filtered).

---

## ✅ Hardening — performance & load validation

- `scripts/perf_bench.py` (+ `dev.py perf`): a **latency bench** driving the service
  layer directly (own DB session, warm embedder) and an **in-process load test**
  firing concurrent requests at the FastAPI app through an ASGI transport — no
  network, no external server, so it exercises the real async stack + DB pool.
  Non-zero exit if any PRD target is missed; `tests/test_perf.py` runs the
  deterministic (no-live-LLM) subset as a CI gate.
- **PRD NFR §9 met with wide margin** — cached / verified answer `< 5 s`, fresh RAG
  `< 20 s`:

  | path | p50 | p95 | budget |
  |---|---|---|---|
  | `rag.retrieve` (graph + vector) | 66 ms | 121 ms | 3 s |
  | `rag.ask` fresh, deterministic (no LLM) | 116 ms | 127 ms | 4 s |
  | **`rag.ask` cached / verified hit** | **72 ms** | **120 ms** | **5 s (PRD)** |
  | **`rag.ask` fresh, live LLM (OpenRouter)** | **2.1 s** | **2.9 s** | **20 s (PRD)** |
  | `anomaly.scan` (full KG) · `report.create` · `audit.verify_chain` | ≤ 105 ms | ≤ 192 ms | — |

  Load, 16 concurrent (deterministic answers): `GET /health` p95 ~1 s @ 40 rps,
  `POST /query` p95 ~0.4 s @ 43 rps, **0 errors**.
- **Two real concurrency bugs the load test exposed and fixed:**
  1. `FastEmbedEmbedder` was a global singleton with an unbounded ONNX thread pool —
     16 concurrent `/query` requests thrashed the CPU and `POST /query` p50 hit
     **376 s**. Now: capped ONNX threads (`FASTEMBED_THREADS`, default half the
     cores), an inference lock, and a small thread-safe LRU on single-text embeds
     (the RAG cache lookup re-embeds the same question every call). → p50 **474 ms**.
  2. `record_event` read the hash-chain tip then appended with no serialisation, so
     concurrent writers forked the chain and `verify_chain` reported a break. Now a
     transaction-scoped Postgres **advisory lock** (`pg_advisory_xact_lock`)
     serialises the read-tip → append across all workers. Added `rehash_chain()`
     (+ `dev.py audit-rehash`) to repair a chain that forked before the fix.
- `/health` now memoises its dependency probes for 5 s so a load-balancer poll storm
  collapses to one live LLM/DB/MinIO probe per window (p95 3.8 s → ~1 s under load).
- **80 backend tests green.**
