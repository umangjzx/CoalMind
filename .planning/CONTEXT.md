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
| LLM | `LLMProvider` protocol → `OllamaProvider` (`mistral`, default) / `AnthropicProvider` (gated) |
| Embeddings | `Embedder` protocol → `FastEmbedEmbedder` (`BAAI/bge-small-en-v1.5`, 384-d, default) / `OllamaEmbedder` |
| Background jobs | arq + Redis (added M1) |
| OCR / parse | Tesseract 5.5 + `pytesseract`, `pdfplumber`, `camelot` (M1) |
| NER | spaCy + domain gazetteers (M1); fine-tuned transformer later |
| Topic modeling | BERTopic + LDA fallback (M5) |
| Report export | WeasyPrint (PDF), python-docx (DOCX) (M3) |
| Frontend | React 18 + Vite 6 + TS + Tailwind 3, TanStack Query, React Router |
| Design | tokens are a neutral baseline now; full **ui-ux-pro-max** design pass in M7 (and per-screen as milestones build UI) |
| Auth/RBAC | JWT + per-subsidiary row scoping (M6); models stubbed in M0 |
| Deploy | docker-compose (dev); k8s/Helm for on-prem / MeghRaj (M7) |

## Heavy-dependency policy

`torch`, `transformers`, `bertopic`, spaCy models, `weasyprint` are added **in the
milestone that needs them**, never earlier — keeps the base install and CI fast.

## Local environment (as probed 2026-08-29, dev machine)

- Node 24 / npm 11 (no pnpm) · Python 3.13 available, backend venv pinned to **3.12** ·
  `uv` 0.11 · git 2.55 · Docker + Compose v5 · Tesseract 5.5.
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
