# CoalMind AI

**Intelligent Geological, Mining & Reporting Platform for CMPDI / Coal India Limited**
Smart India Hackathon 2026 · Problem Statement **SIH 26023**

CoalMind AI ingests decades of heterogeneous mining documents (scanned PDFs,
spreadsheets, images, correspondence), extracts structured facts with per-field
confidence scoring, builds a queryable domain knowledge graph, and lets officers
generate **cited, parliament-ready reports** or ask **natural-language questions** — with
every answer traceable to `{document, page, bounding box}` in ≤2 clicks.

> **Design bet:** in a government-accountability context an untraceable AI answer is worse
> than no answer. Auditable extraction first, generative convenience second; humans verify
> low-confidence facts; on-prem open-weight LLM by default.

- Product spec: [`docs/PRD.md`](docs/PRD.md)
- Architecture: [`docs/architecture.md`](docs/architecture.md) · Domain model: [`docs/entity-schema.md`](docs/entity-schema.md)
- Roadmap & status: [`.planning/ROADMAP.md`](.planning/ROADMAP.md) · Decisions: [`.planning/CONTEXT.md`](.planning/CONTEXT.md)

## Status — M0 + M1 + M2 + M3 + M4 + M5 + M6 + M7 complete

- **M0 (scaffold):** monorepo, infra, FastAPI skeleton (`/health`, `/version`), LLM &
  embeddings provider abstractions (Ollama default · Anthropic gated by a sovereignty
  flag · fastembed on-prem), content-addressed MinIO store, hash-chained audit writer,
  baseline migration + seed, synthetic sample corpus, React shell.
- **M1 (ingestion & extraction):** upload API with SHA-256 dedupe → classify → pdfplumber
  text / Tesseract OCR → rule + spaCy-NER field extraction with per-field **confidence**
  and `{page, bbox, snippet}` traceability → threshold routing to a **human review
  queue** → business-rule validation → review API + **Ingestion & Review** screen, all
  audited. `python scripts/dev.py ingest-samples` runs the corpus through it.
- **M2 (knowledge layer):** accepted extractions → a typed, temporally-valid domain
  **knowledge graph** (`kg_entity`/`kg_relation`) with full provenance, plus a `pgvector`
  index over document chunks. `/knowledge/*` API, a **Knowledge Graph** screen with
  entity browser + relation navigation + **semantic search**. Verified review decisions
  flow into the graph. `python scripts/dev.py build-kg` (re)builds it.
- **M3 (report generation):** 4 templates (Reserve Status, Parliamentary Q&A, Monthly
  MIS, Ad-hoc Inquiry) bind to the graph + live `ExtractionField` status. Every figure
  is **cited** to its document/page; **extractive-first LLM narrative** (deterministic
  fallback) keeps the markers. Low-confidence figures put the report *in_review* and
  **block finalisation** until verified. Append-only version history separates **AI vs
  human** edits with a diff. **PDF / DOCX / HTML export**. `/reports/*` API + the
  **Report Builder** screen.
- **M4 (query & response):** natural-language questions answered from the graph
  (entity → fact) + `pgvector` passages, role-scoped. **Extractive-first, cited**;
  **declines** rather than guessing when evidence is weak (FR-8); **search-only** if the
  LLM is down. Officer-**verified answers are cached** (embedding cosine lookup, ~0.2 s
  reuse). `/query/*` API + the **Ask CoalMind** chat screen.
- **M5 (topics & word cloud):** NMF topic modelling (BERTopic-ready) over the corpus,
  **multilingual term normalisation** (khadan / colliery → mine; Hindi variants) + a
  domain stoplist, a **word cloud** filterable by subsidiary / type / date, **trend-
  over-time** buckets, and an LLM one-paragraph "what's driving this" per topic.
  `/topics/*` API + the **Topics & Trends** screen. `python scripts/dev.py topics`.
- **M6 (security, RBAC, admin, audit):** bcrypt + **JWT auth** (`/auth/login|refresh|me`,
  demo accounts, password `coalmind`); a `Principal` with an `AUTH_REQUIRED` flag (dev
  stays open as `data_admin`); **per-subsidiary row-scoping** on documents / review /
  query; **audit hash-chain verification** with tamper detection; an **Admin console**
  (platform counts, security posture, user CRUD, audit log, extraction-quality metrics);
  hard `ALLOW_THIRD_PARTY_API=false` enforcement (LLM → on-prem-only, degrades
  gracefully). Login screen + token store in the frontend.
- **M7 (anomaly detection + Hindi):** cross-document comparison of knowledge-graph
  facts flags **inconsistencies between historical and new data** for the same entity
  (FR-14) — `revision`, `contradiction`, `sum_mismatch`, `out_of_range`, `trend_break`
  — each traceable to its source `{document, page, field, value, as-on}`. Idempotent
  `scan_anomalies` (upsert by signature + auto-resolve), `/anomalies` API (list / scan /
  review), an **Anomalies** review screen (Acknowledge / Resolve / Dismiss) and a real
  **Dashboard**. **Hindi / bilingual** (FR-11): `eng+hin` OCR with automatic fallback to
  the installed subset, Devanagari + roman-Hindi classifier keywords, answers returned
  in the question's language, a Hindi sample MIS. `python scripts/dev.py anomalies`.

- **Hardening:** `scripts/eval_extraction.py` (`dev.py eval`) — a DB-free
  extraction-accuracy benchmark vs `ground_truth/` (classification, field P/R/F1 by
  digital vs degraded-scan, coverage, effective accuracy after review), wired as a
  pytest gate. Drove new extraction rules covering every remaining ground-truth field
  and a `_COL_VAL` fix for values that ran into the next column. Current sample-corpus
  score: 8/8 classification, F1 = 1.00, 100 % field coverage.

**Next: perf/load validation, k8s/Helm for MeghRaj + CI, `hin.traineddata` for real
Devanagari OCR, full ui-ux design pass.**

## Repository layout

```
backend/     FastAPI + SQLAlchemy + Alembic  (uv-managed, Python 3.12)
frontend/    React + Vite + TypeScript + Tailwind
docs/        PRD, architecture, entity schema
.planning/   gsd-core artifacts: PROJECT / ROADMAP / CONTEXT
ml/          sample_corpus/ (+ ground_truth/) and notebooks/
scripts/     dev.py task runner, seed_db.py, gen_sample_corpus.py
infra/       Postgres init SQL
docker-compose.yml   Postgres 16 + pgvector, MinIO
```

## Prerequisites

- **Docker** + Compose · **Python 3.12+** with [`uv`](https://docs.astral.sh/uv/) ·
  **Node 20+** · **Tesseract** (M1+) · **Ollama** running locally with a model pulled
  (`ollama pull mistral`) for the LLM checks to go green.

**Faster LLM (optional).** CPU Ollama makes report-narrative generation slow (~10–20 s).
Point the backend at a GPU-hosted Ollama instead — no code change, just:
`OLLAMA_BASE_URL=https://<your-tunnel>` in `.env`. A Colab **T4** running
`ollama serve` behind an `ngrok` / `cloudflared` tunnel works well for demos.
Set `COALMIND_NARRATIVE_LLM=0` to skip the LLM entirely (deterministic cited prose).

## Quick start

```bash
cp .env.example .env          # host Postgres on 5432? .env already maps container -> 5433

python scripts/dev.py bootstrap        # docker compose up + migrate + seed + sample corpus
python scripts/dev.py ingest-samples   # run the sample docs (PDF + Hindi .txt) through the M1 pipeline
python scripts/dev.py build-kg         # (re)build the M2 knowledge graph + vector index
python scripts/dev.py anomalies        # scan the graph for historical-vs-new inconsistencies (M7)
python scripts/dev.py api               # FastAPI on http://localhost:8000  (/docs, /health)
python scripts/dev.py web               # Vite on   http://localhost:5173   (another shell)
```

Walk the pipeline in the app: **Ingestion & Review** (classify → extract → verify
low-confidence fields) → **Knowledge Graph** (browse the mines/blocks/reserves the
verified facts produced, semantic search) → **Report Builder** (generate a cited,
confidence-gated Reserve Status / Parliamentary Q&A draft and export it to PDF/DOCX)
→ **Ask CoalMind** (cited answers, declines on low confidence) → **Topics & Trends**
→ **Anomalies** (historical-vs-new inconsistencies, traceable to source) → **Admin**.

**Hindi OCR (optional).** `ocr_languages` defaults to `eng+hin`; the pipeline probes
Tesseract and quietly falls back to whatever packs are installed. For real Devanagari
scans install the Hindi data — e.g. `apt-get install tesseract-ocr-hin`, or drop
`hin.traineddata` into the Tesseract `tessdata/` dir. The bundled Hindi sample is plain
UTF-8 text, so it needs neither the pack nor a Devanagari font.

Sign in (top-right) with a demo account — password `coalmind`:
`admin@coalindia.in` (IT admin), `ministry@coal.gov.in`, `officer@cmpdi.co.in`,
`geologist@ccl.co.in` (subsidiary-scoped). Dev mode also works signed-out (acts as
admin); set `AUTH_REQUIRED=true` to lock it down.

Then open <http://localhost:5173> — the header health badge should read **backend ok**
with db / storage / llm / embeddings all green.

### Individual tasks

```bash
python scripts/dev.py up | down | migrate | seed | corpus | api | web | test | lint
python scripts/dev.py ingest-samples | build-kg | anomalies | eval
```

`dev.py eval` scores classification + field extraction against
`ml/sample_corpus/ground_truth/` (no DB) — precision / recall / F1 split by digital vs
degraded-scan, plus "effective accuracy after review". It is also a pytest regression
gate (`tests/test_extraction_eval.py`).

`make` equivalents exist in [`Makefile`](Makefile) for Linux/macOS/WSL.

## Backend dev

```bash
cd backend
uv sync --extra dev
uv run pytest -q
uv run ruff check .
uv run alembic upgrade head
uv run alembic revision --autogenerate -m "your change"
```

## Frontend dev

```bash
cd frontend
npm install            # under OneDrive? use:  npm install --ignore-scripts
npm run dev            # or: build / lint / typecheck
```

## Configuration

All runtime config is environment-driven — see [`.env.example`](.env.example). Notable:

| Var | Meaning |
|---|---|
| `LLM_PROVIDER` | `ollama` (default) or `anthropic` |
| `ALLOW_THIRD_PARTY_API` | `false` refuses any hosted-API call — keep `false` for sensitive corpora |
| `EMBED_PROVIDER` | `fastembed` (default, on-prem) or `ollama` |
| `CONFIDENCE_THRESHOLD` | fields below this go to the human review queue (M1+) |
| `POSTGRES_PORT` | host port for the DB container (defaults to `5433` to dodge a local Postgres) |

## Building with gsd-core

This repo is set up for the **gsd-core** spec-driven workflow (installed under `.claude/`).
After restarting Claude Code, drive each milestone with:

```
/gsd-plan-phase      # plan M1 from .planning/ROADMAP.md
/gsd-execute-phase   # implement
/gsd-verify-work     # UAT against the FR IDs
```

Frontend milestones use the **ui-ux-pro-max** skill for the design system.
