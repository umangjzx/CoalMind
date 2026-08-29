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

## Status — M0 + M1 complete

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

**Next: M3 — Report Generation Platform.**

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

## Quick start

```bash
cp .env.example .env          # host Postgres on 5432? .env already maps container -> 5433

python scripts/dev.py bootstrap        # docker compose up + migrate + seed + sample corpus
python scripts/dev.py ingest-samples   # run the 6 sample docs through the M1 pipeline
python scripts/dev.py build-kg         # (re)build the M2 knowledge graph + vector index
python scripts/dev.py api               # FastAPI on http://localhost:8000  (/docs, /health)
python scripts/dev.py web               # Vite on   http://localhost:5173   (another shell)
```

Open **Ingestion & Review**: every sample is classified, its reserve / production
figures extracted with a confidence score and source citation, low-confidence fields
queued for verification. Then **Knowledge Graph**: browse the resulting mines / blocks /
reserves and try the semantic search.

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
