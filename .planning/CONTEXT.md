# CONTEXT — decisions & environment

Standing decisions the roadmap assumes. Update when a decision changes; don't re-litigate.

## Product decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Full PRD vision, delivered in phases** (M0–M7), not just the 36h slice | user directive |
| D2 | **Traceability first, generation second** — extractive-first answers, citation-mandatory, low-confidence → human review | PRD core bet; government accountability |
| D3 | **Sovereign by default** — on-prem open-weight LLM; hosted API refused unless `ALLOW_THIRD_PARTY_API=true` | PRD NFR; data sensitivity |
| D4 | **Knowledge graph in Postgres tables** (`kg_entity`/`kg_relation`), not Neo4j, for this build | one datastore; adequate at subsidiary scale; revisit at national scale |
| D5 | Human approves/signs every report; AI drafts only | PRD non-goal; adoption |

## Technical stack

| Concern | Choice |
|---|---|
| Backend | FastAPI + SQLAlchemy 2 + Alembic, `uv`-managed, Python 3.12 |
| DB | Postgres 16 + `pgvector` + `pg_trgm` (structured data, audit, embeddings, KG) |
| Object store | MinIO (S3-compatible), content-addressed by SHA-256 |
| LLM | `LLMProvider` protocol → `OllamaProvider` (`mistral`, default; `keep_alive`, ngrok-safe headers) / `AnthropicProvider` / `OpenRouterProvider` (`openai/gpt-4o-mini`) — hosted ones gated by `ALLOW_THIRD_PARTY_API`. `.env` overrides `.env.example` (env_file order fixed). |
| Embeddings | `Embedder` protocol → `FastEmbedEmbedder` (`BAAI/bge-small-en-v1.5`, 384-d, default) / `OllamaEmbedder` |
| Knowledge graph | `kg_entity` + `kg_relation` in Postgres (M2); vector store = `doc_chunk` `vector(384)` + HNSW cosine index; built only from `auto_accepted`+`verified` fields |
| RAG (M4) | `app/services/rag/` — entity→fact retrieval + pgvector passages, role-scoped; extractive-first cited answers, declines below evidence floor (FR-8), search-only if LLM down; `qa_pair` verified-answer cache (embedding cosine ≥0.90 → reuse). `COALMIND_NARRATIVE_LLM=0` forces deterministic composition (tests) |
| Background jobs | FastAPI `BackgroundTasks` running `run_pipeline()` → also builds the KG (M1/M2); arq + Redis is the scale swap-in, not yet added |
| OCR / parse | Tesseract 5.5 + `pytesseract` (fallback), `pdfplumber` text + word bboxes (M1); `camelot` deferred |
| NER | spaCy `en_core_web_sm` + mining gazetteer, keyword-gated ORG mentions (M1); fine-tuned transformer later |
| Topic modeling | scikit-learn **NMF** over TF-IDF of normalised text (M5); BERTopic path import-guarded (not installed — heavy C builds on Windows). `topic`/`topic_doc` tables, latest `run_id` served |
| Term normalisation (M5) | `topics/normalize.py` — variant→canonical (khadan/colliery→mine, bhandar→reserve, roman-Hindi) + domain stoplist; Devanagari retained |
| Report engine | 4 templates bind KG structure + live `ExtractionField` values; per-figure citations; extractive-first LLM narrative (`get_llm`) w/ deterministic fallback (`COALMIND_NARRATIVE_LLM=0`); confidence gate blocks finalize; append-only `report_version` ai/human + diff (M3) |
| Report export | **xhtml2pdf** (PDF — pure-python, no GTK) + `python-docx` (DOCX) + HTML (M3); WeasyPrint is the production fidelity upgrade |
| Faster LLM | point `OLLAMA_BASE_URL` at a GPU-hosted Ollama (e.g. Colab T4 + ngrok/cloudflared tunnel) — config only, no code change |
| Frontend | React 18 + Vite 6 + TS + Tailwind 3, TanStack Query, React Router |
| Design | tokens are a neutral baseline; full **ui-ux-pro-max** design pass deferred (post-M7); per-screen styling done as milestones build UI |
| Auth/RBAC (M6) | bcrypt + HS256 JWT (access/refresh); `Principal` dependency, `AUTH_REQUIRED` flag (dev=false → acts as seeded `data_admin`); `require_roles()`; per-subsidiary row-scoping on documents/review/query; audit hash-chain `verify_chain()`; `/admin/*` console API |
| Anomaly detection (M7) | `app/services/anomaly/detect.py` — compares KG fact nodes for one anchor+category across documents → `revision` / `contradiction` / `sum_mismatch` / `out_of_range` / `trend_break` (FR-14); `_diff` tolerance 2% / 0.01; revision+contradiction collapsed to one row per anchor; `scan_anomalies()` upserts by `signature`, auto-resolves gone ones, audits `anomaly.scan`. `anomaly` table (migration `0008`). `/anomalies` API (list / scan / review), RBAC-scoped. `dev.py anomalies` |
| Hindi / bilingual (M7, FR-11) | `ocr_languages="eng+hin"` + `page_extract._ocr_lang()` probes Tesseract and degrades to the installed subset, per-call fallback to `eng` on load error (this host has `eng`/`osd` only); `classifier._RULES` carry Devanagari + roman-Hindi aliases; RAG `_SYSTEM` answers in the question's language; Hindi sample = UTF-8 `.txt` (no Devanagari font / `hin` pack needed to demo) |
| Retrieval precision (M7) | `rag/retrieve.match_entities` filters generic name tokens (`block`, `mine`, `reserve`, …) so an entity only matches a question on distinctive tokens |
| Extraction benchmark | `scripts/eval_extraction.py` (`dev.py eval`, pytest gate `tests/test_extraction_eval.py`) — DB-free: runs corpus through `extract_pages→classify→extract_fields`, scores classification/language, field P/R/F1 (digital vs degraded), coverage vs `GT_ALIASES`, and *effective accuracy after review* = 1−(silent_error+silent_miss)/N. Gate: class ≥85%, digital F1 ≥0.90, zero silent errors/misses |
| Extraction rules | table-driven regex `Spec`s per doc_type (`extraction/rules.py`); `_COL_VAL` value pattern stops at line end / 2-space gap / next inline `Label :` (pdfplumber collapses column whitespace); benchmark-driven coverage of every extractable ground-truth field incl. `coal_production_target`/`_achievement_pct`, `finding` (1st observation), `seams_intersected`, block-derived + prose-derived `mine_name` |
| Deploy | docker-compose (dev); k8s/Helm for on-prem / MeghRaj (deferred, post-M7) |

## Heavy-dependency policy

`torch`, `transformers`, `bertopic`, spaCy models, `weasyprint` are added **in the
milestone that needs them**, never earlier — keeps the base install and CI fast.

## Local environment (as probed 2026-08-29, dev machine)

- Node 24 / npm 11 (no pnpm) · Python 3.13 available, backend venv pinned to **3.12** ·
  `uv` 0.11 · git 2.55 · Docker + Compose v5 · Tesseract 5.5 (`eng` + `osd` only — **no
  `hin` pack**; M7 OCR-language probe degrades to `eng` automatically).
- **Ollama** installed with `mistral:latest` and `qwen2.5-coder:7b` pulled. No embedding
  model pulled → embeddings default to fastembed (no Ollama needed). Optional:
  `ollama pull nomic-embed-text` then set `EMBED_PROVIDER=ollama`.
- Host Postgres already occupies **5432** → compose maps Postgres to **5433**
  (`POSTGRES_PORT=5433` in `.env`).
- Project lives under **OneDrive** → `npm install` can hit `EPERM`/`ERR_INVALID_ARG_TYPE`
  during lifecycle scripts in some shells. Workaround used: `npm install --ignore-scripts`
  (esbuild's platform binary still resolves). Moving the repo outside OneDrive removes this.

## Tooling installed into `.claude/`

- **gsd-core** (spec-driven workflow; `/gsd-*` commands) — drives M1+ via
  `/gsd-plan-phase` → `/gsd-execute-phase` → `/gsd-verify-work`.
- **ui-ux-pro-max** skill — design-system generation for frontend milestones.
- Both require a Claude Code restart to expose their slash commands.
