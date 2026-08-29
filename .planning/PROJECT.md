# PROJECT — CoalMind AI

> gsd-core project brief. Full spec: [`docs/PRD.md`](../docs/PRD.md).

## One-liner

A traceability-first document-intelligence and knowledge-management platform for
CMPDI / Coal India Limited that turns decades of geological, mining and production
documents into cited, parliament-ready reports and answerable knowledge.

## Problem

CMPDI/CIL officers answer parliamentary and administrative inquiries by manually digging
through scanned PDFs, spreadsheets, images and paper archives. Slow, inconsistent,
error-prone, and dependent on individual expertise (SIH 26023).

## Outcome we're building toward

- Every AI-produced fact is traceable to `{document, page, bounding box}` in ≤2 clicks.
- Low-confidence extractions never silently enter a report — human verifies first.
- Officers ask in natural language and get cited draft answers/reports the same day.
- Runs on-premise (sovereign): open-weight LLM by default, no hosted API on sensitive data.
- One subsidiary-scale pipeline that architecturally scales to all 8 subsidiaries.

## Mandated deliverables (PS)

1. Automated Report Generation Platform  → milestone **M3**
2. Word Cloud & Topic Identification Module  → milestone **M5**
3. AI-Based Query & Response System  → milestone **M4**

## Personas

Reporting Officer (CMPDI) · Subsidiary Geologist · Ministry of Coal Official ·
CIL Data/IT Admin · Field/Records Clerk. See PRD §5.

## Non-goals (hackathon)

Live IoT/SCADA telemetry · replacing statutory sign-off · full national rollout in the
build (architect for it, don't ship it).

## Success metrics

Report compile time days→hours · ≥90% extraction accuracy (digital) / ≥75% (degraded) ·
70–80% of report content auto-drafted (human signs 100%) · 100% of AI figures cited ·
cached answer <5s, fresh RAG <20s.

## Status

**M0 + M1 + M2 + M3 + M4 complete.**
- M0: monorepo, infra (Postgres+pgvector, MinIO), FastAPI skeleton, LLM + embeddings
  provider abstractions, audit writer, baseline migration + seed, sample corpus, React shell.
- M1: document upload + dedupe, classify → OCR/text extract → rule + NER field extraction
  with per-field confidence + bbox traceability, threshold routing to a human review
  queue, business-rule validation, review API + **Ingestion & Review** UI, full audit trail.
- M2: `kg_entity`/`kg_relation` (typed, temporally valid) + `doc_chunk` pgvector index;
  resolver builds the domain graph from *accepted* extractions with provenance + temporal
  stamps; chunker + embedder; graph + vector query helpers; `/knowledge/*` API; pipeline
  + review integration (verified facts flow in); **Knowledge Graph** UI + semantic search.
- M3: `report`/`report_version` models; 4 templates binding to the KG + live
  `ExtractionField` status; per-figure citations; extractive-first LLM narrative with
  deterministic fallback; confidence-gated finalize; AI-vs-human draft history + diff;
  HTML/PDF (xhtml2pdf)/DOCX export; `/reports/*` API; **Report Builder** UI.
- M4: `qa_pair` model; graph-aware RAG (entity→fact retrieval + pgvector passages,
  role-scoped); extractive-first cited answers that **decline** below the evidence
  floor (FR-8); search-only degradation when the LLM is down; **verified-answer cache**
  (embedding cosine lookup, officer promote, ~0.2s reuse); `/query/*` API; **Ask
  CoalMind** chat UI.

Next: **M5 — Module 2: Topic & Word Cloud** (BERTopic/LDA over domain embeddings,
trend-over-time, drill-down, multilingual term normalization). Roadmap:
[`ROADMAP.md`](ROADMAP.md).
