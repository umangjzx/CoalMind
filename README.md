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

## Status — M0 + M1 + M2 + M3 complete

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

**Next: M4 — Query & Response System (graph-aware RAG).**

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
python scripts/dev.py ingest-samples   # run the 6 sample docs through the M1 pipeline
python scripts/dev.py build-kg         # (re)build the M2 knowledge graph + vector index
python scripts/dev.py api               # FastAPI on http://localhost:8000  (/docs, /health)
python scripts/dev.py web               # Vite on   http://localhost:5173   (another shell)
```

Walk the pipeline in the app: **Ingestion & Review** (classify → extract → verify
low-confidence fields) → **Knowledge Graph** (browse the mines/blocks/reserves the
verified facts produced, semantic search) → **Report Builder** (generate a cited,
confidence-gated Reserve Status / Parliamentary Q&A draft and export it to PDF/DOCX).

Then open <http://localhost:5173> — the header health badge should read **backend ok**
with db / storage / llm / embeddings all green.

### Individual tasks

```bash
python scripts/dev.py up | down | migrate | seed | corpus | api | web | test | lint
```

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
