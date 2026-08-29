# Product Requirements Document — CoalMind AI

**CoalMind AI — Intelligent Geological, Mining & Reporting Platform for CMPDI / CIL**

- **Problem Statement:** SIH 26023 — AI-Powered Geological, Mining and other Reporting Solution for CMPDI/CIL subsidiaries
- **Organization:** Ministry of Coal | Coal India Limited (CIL) / CMPDI
- **Theme:** Miscellaneous (Software)
- **Document version:** 1.0 (converted from `PRD_SIH26023_CoalMind.pdf`) · Prepared for Smart India Hackathon 2026

> This is the authoritative product spec. Engineering roadmap lives in
> [`.planning/ROADMAP.md`](../.planning/ROADMAP.md); architecture detail in
> [`architecture.md`](architecture.md); domain model in [`entity-schema.md`](entity-schema.md).

---

## 1. Executive Summary

CMPDI and CIL's eight subsidiaries (BCCL, CCL, ECL, MCL, NCL, SECL, WCL, NEC) sit on
decades of geological survey reports, mine production registers, exploration data and
correspondence — most of it locked in scanned PDFs, spreadsheets, images and paper
archives. When the Ministry of Coal or Parliament asks a question, someone manually digs
through this to compile an answer: slow, inconsistent, and dependent on which officer
knows where the data lives.

CoalMind AI is a document-intelligence and knowledge-management platform purpose-built
for this workflow. It ingests heterogeneous mining documents, extracts and validates
structured facts with confidence scoring, builds a queryable knowledge graph of
mines/blocks/reserves/production figures, and lets officers generate parliament-ready
reports or ask natural-language questions — with every answer traceable to its exact
source document and page.

**The differentiating bet:** in a government-accountability context, an untraceable AI
answer is worse than no answer. The product is designed around **auditable extraction
first, generative convenience second**.

## 2. Problem Statement (official summary)

CMPDI/CIL subsidiaries provide geological and mining information to the Ministry of Coal
and respond to parliamentary and high-priority administrative inquiries. Reports require
compiling data from scanned PDFs, digital documents, spreadsheets, images and historical
archives. The current workflow is largely manual — high dependence on individual
expertise, delays in generating reports/analytics, higher probability of manual errors,
and limited ability to quickly retrieve insights.

### Required objectives

- Deploy an automated platform for AI-assisted geological, mining and production-figures
  document processing and reporting.
- Enhance data validation, consistency and traceability across historical and
  contemporary datasets.
- Build a scalable foundation for future digital transformation across CIL subsidiaries
  and the Ministry.

### Mandated deliverables

1. **Automated Report Generation Platform**
2. **Automated Word Cloud and Topic Identification Module**
3. **AI-Based Query and Response System**

### Expected benefit metrics (must be quantified in the pitch/demo)

- % reduction in report preparation time
- % accuracy in structured extraction and report generation
- % automation of repetitive reporting/response workflows
- Faster turnaround on high-level/parliamentary inquiries
- Improved data accessibility, transparency, standardization

## 3. Research Context — what exists, and the gap

| Adjacent space | What's out there | Why it's not "solved" for CIL |
|---|---|---|
| Enterprise RAG chatbots (generic) | Mature — LangChain/LlamaIndex-style Q&A over PDFs | No domain grounding in mining/geology terminology, no confidence-based routing, no audit trail suitable for parliament-grade answers |
| OCR for scanned documents | Mature for clean English print (Tesseract, cloud OCR) | Legacy Indian mining archives include degraded scans, tables, hand-annotated maps, mixed Hindi/English, and domain jargon (seam names, borehole IDs, RoM grades) that generic OCR mis-reads |
| BI dashboards on production data | Common in mining ops (SAP, custom MIS) | Structured-data only; doesn't touch the ~80% of institutional knowledge trapped in unstructured reports and correspondence |
| Government sovereign-AI initiatives | Growing push toward open-weight, on-prem LLMs for confidential industrial data | Confirms judges/sponsors reward an on-prem / data-sovereign architecture over a "call a hosted API" demo for this kind of government data |

**Conclusion:** the building blocks (OCR, embeddings, RAG, topic modeling) are commodity.
Judged differentiation comes from (a) domain-specific extraction accuracy and
traceability, (b) an auto-report generator tailored to how CIL actually reports, and
(c) a deployment story that respects that this is sensitive government infrastructure data.

## 4. Goals & Non-Goals

**Goals**

- Cut manual compilation time for parliamentary/administrative reports by a demonstrable margin.
- Make every AI-generated fact traceable to source (document, page, bounding box).
- Surface emerging themes/risks proactively (word cloud + topic module), not only on request.
- Provide a natural-language query interface usable by non-technical officers.
- Ship an architecture CIL's IT team could realistically deploy on-premise across 8 subsidiaries.

**Non-Goals (hackathon scope — state explicitly in the pitch)**

- Real-time IoT/sensor integration from live mine operations (this is a document-intelligence PS, not SCADA/telemetry).
- Replacing statutory/legal sign-off — the system assists drafting; a human officer approves and signs every report.
- Full national-scale rollout in the hackathon build — build one working subsidiary-scale pipeline, architect for scale.

## 5. Users & Personas

| Persona | Need | How CoalMind helps |
|---|---|---|
| CMPDI Reporting Officer | Compile a report answering a parliamentary question within hours | Ask in natural language → draft report with cited sources, ready to review and sign |
| Subsidiary Geologist / Surveyor | Retrieve historical geological data for a specific block/seam | Semantic search across decades of archives, filterable by mine, block, mineral, year |
| Ministry of Coal Official | Track trending issues (safety, environment, production shortfalls) across subsidiaries | Word cloud & topic dashboard surfaces recurring/emerging themes automatically |
| CIL Data / IT Admin | Ensure data integrity, control access, manage ingestion | Admin console: RBAC, audit logs, ingestion monitoring, low-confidence review queue |
| Field / Records Clerk | Digitize legacy paper/scanned archives without being a data-entry expert | Bulk upload + AI pre-fill + simple human verification UI |

## 6. Product Scope — the three mandated modules

### 6.1 Module 1 — Automated Report Generation Platform

- **Template-driven report engine** for the report types CIL actually produces:
  Parliamentary Q&A response, Geological Reserve Status Report, Monthly Production / MIS
  Report, Ad-hoc Administrative Inquiry Response.
- **Fact assembly with inline citations** — every generated sentence/figure carries a
  footnote linking to `{document_id, page_no, extracted_field}`. Officers click any
  number and see the original scan highlighted.
- **Confidence-aware drafting** — fields extracted below a confidence threshold are
  flagged (not silently included) and routed to a "needs verification" queue before the
  report can be finalized.
- **Version-controlled drafts** — draft history; officer edits tracked separately from
  AI-generated content (auditors can see what the AI wrote vs. what a human changed).
- **One-click export** to PDF/Word in CIL's existing report formats.

### 6.2 Module 2 — Automated Word Cloud & Topic Identification

- **Topic modeling pipeline** (BERTopic / LDA over domain-tuned embeddings) across
  ingested correspondence, inspection reports and inquiry logs — surfaces emerging
  clusters (e.g. a spike in "belt conveyor damage" mentions across subsidiaries).
- **Trend-over-time view** — a timeline of which topics are rising/falling by subsidiary,
  so the Ministry can spot brewing issues before they become a parliamentary question.
- **Drill-down** — click a topic → underlying documents + an AI-generated one-paragraph
  synthesis of what's driving the trend.
- **Multilingual term normalization** — merges Hindi/English/transliterated variants of
  the same term (e.g. "khadan", "mine", "colliery").

### 6.3 Module 3 — AI-Based Query and Response System

- **Domain knowledge graph**, not flat vector search: entities = Mine, Block, Seam,
  Mineral, Subsidiary, Report, Officer, Date; relationships = produces, located_in,
  reported_in, supersedes. Retrieval is graph-aware, so a query like "what were manganese
  reserve estimates for X block before and after the 2019 revision" resolves correctly.
- **Cited, extractive-first answers** — prefer quoting/paraphrasing exact source spans
  over free generation; every answer shows its source chain. If confidence is low, say so
  rather than hallucinating a number.
- **Role-based query scope** — a subsidiary officer's queries are scoped to their
  subsidiary + shared national data unless elevated access is granted.
- **Query history & reuse** — verified Q&A pairs become a growing verified-answer cache;
  recurring questions get instant, pre-approved answers over time.

## 7. End-to-End Architecture

```
INGESTION LAYER      Scanned PDFs · Spreadsheets · Images · Legacy archives · Emails
                     → Document classifier → OCR (domain-tuned) → Table/Form parser
        ▼
EXTRACTION &         NLP/NER (mining entities) → Confidence scoring → Business-rule
VALIDATION LAYER     validation (cross-check vs historical records) → Human verification
                     queue for low-confidence fields
        ▼
KNOWLEDGE LAYER      Domain Knowledge Graph (mines/blocks/seams/reserves/production)
                     + Vector store (embeddings) + Document store (source of truth)
        ▼
INTELLIGENCE LAYER   Report Generation Engine · Topic Modeling / Word Cloud Engine ·
                     Graph-aware RAG Query Engine · Anomaly / Trend Detector
        ▼
APPLICATION LAYER    Web dashboard (officers/admins) · Report Builder UI · Chat/Query UI
                     · Admin console (RBAC, audit, ingestion monitoring)
```

### Suggested tech stack (from the PS)

| Layer | Technology |
|---|---|
| OCR / document parsing | Tesseract + LayoutLM/Donut for layout-aware extraction; fine-tuned on sample CIL/geological survey formats |
| NLP / NER | spaCy or fine-tuned transformer NER for mining-domain entities (mine, block, seam, mineral, grade, tonnage) |
| Embeddings & vector DB | Open-weight embedding model + FAISS / pgvector (on-prem friendly) |
| Knowledge graph | Neo4j or ArangoDB |
| LLM | Open-weight model (Llama/Mistral-class) hosted on-prem for data sovereignty — hosted-API fallback only for non-sensitive dev/demo |
| Topic modeling | BERTopic / LDA |
| Backend | FastAPI / Node.js microservices |
| Frontend | React + Tailwind, role-based dashboards |
| Storage | Object storage for raw docs (MinIO/S3-compatible) + PostgreSQL for structured/audit data |
| Deployment | Docker/Kubernetes; designed for on-prem or MeghRaj (GI Cloud) deployment |
| Audit trail | Append-only log; optionally hash-anchored for tamper-evidence |

> **This build's choices** (see [`.planning/CONTEXT.md`](../.planning/CONTEXT.md)):
> FastAPI + SQLAlchemy backend, Postgres 16 + pgvector (KG modeled in Postgres tables
> instead of Neo4j for the hackathon), MinIO, Ollama (mistral) with an Anthropic fallback
> behind one interface, fastembed (bge-small) for on-prem embeddings, React + Vite +
> Tailwind frontend.

## 8. Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Ingest PDF, DOCX, XLSX, JPG/PNG, and scanned/handwritten documents | Must |
| FR-2 | OCR and extract structured fields with a confidence score per field | Must |
| FR-3 | Flag any field below a configurable confidence threshold for human review before use in a report | Must |
| FR-4 | Generate reports from templates, populating fields with cited sources | Must |
| FR-5 | Let officers edit AI-drafted content, tracking AI-vs-human provenance | Must |
| FR-6 | Produce a topic-modeled word cloud with time-trend view, filterable by subsidiary/date/document type | Must |
| FR-7 | Answer natural-language queries with cited, source-linked responses | Must |
| FR-8 | Decline/flag uncertainty rather than fabricate an answer when confidence is low | Must |
| FR-9 | Support role-based access control per subsidiary/user role | Must |
| FR-10 | Maintain a full audit trail of ingestion, extraction, edits, and report generation | Must |
| FR-11 | Support Hindi + English documents and queries | Should |
| FR-12 | Provide an admin dashboard for ingestion monitoring and model performance metrics | Should |
| FR-13 | Export reports in PDF/DOCX matching CIL's existing formats | Should |
| FR-14 | Detect anomalies/inconsistencies between historical and new data for the same entity | Could |
| FR-15 | Support offline/batch ingestion for field digitization drives | Could |

## 9. Non-Functional Requirements

- **Security:** on-prem/sovereign deployment option; encryption at rest and in transit;
  RBAC; no sensitive data sent to third-party APIs by default.
- **Traceability:** every generated fact traceable to a source document + location within ≤2 clicks.
- **Accuracy target:** ≥90% field-level extraction accuracy on clean digital documents,
  ≥75% on degraded scans (human-review safety net makes effective accuracy near 99%).
- **Performance:** query response < 5s for cached/verified answers; < 20s for fresh RAG
  queries over the corpus.
- **Scalability:** scale from one subsidiary's corpus to all 8 without redesign.
- **Auditability:** immutable log of who generated/edited/approved each report.
- **Availability:** 99% uptime target; graceful degradation to search-only mode if the
  LLM service is unavailable.

## 10. Success Metrics (mapped to PS KPIs)

| Metric | Baseline (manual) | Target with CoalMind |
|---|---|---|
| Time to compile a standard report | Days | Hours (demo: side-by-side timing) |
| Structured extraction accuracy | N/A (manual) | ≥90% on digital-native docs |
| % of report content auto-drafted | 0% | 70–80%, with human sign-off on 100% |
| Time to respond to parliamentary/high-priority inquiry | Days | Same-day draft availability |
| Traceability of report figures to source | None documented | 100% of AI-generated figures cited |

## 11. Roadmap / Phased Delivery (PS phasing)

| Phase | Scope |
|---|---|
| 1 — Requirement Analysis | Collect sample document sets/report formats from one subsidiary as pilot corpus; define entity schema |
| 2 — Digitization & Pre-processing | Build ingestion + OCR + extraction pipeline; validate against known ground-truth reports |
| 3 — Platform Development | Knowledge graph, RAG query engine, report generator, topic module, dashboards |
| 4 — Testing | Accuracy benchmarking, security review, officer usability testing |
| 5 — Integration | Connect to CIL subsidiary workflows/report formats; SSO if applicable |
| 6 — Training & Rollout | Officer training, feedback-loop instrumentation |
| 7 — Continuous Enhancement | Model retraining from verified corrections; scale to remaining subsidiaries |

**36-hour hackathon slice:** one document corpus, working ingestion + extraction
pipeline, one report template fully automated end-to-end, working topic/word-cloud
module, and a functioning cited-query chat interface. Everything else is the "vision
slide" that shows judges the full product is understood.

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| OCR fails on degraded historical scans | Human-verification queue is a first-class feature; legacy digitization is progressive, not instant |
| LLM hallucination in a government-accountability context | Extractive-first, citation-mandatory design; explicit "low confidence" states instead of guesses |
| Data sensitivity (coal reserves/geological data are strategically sensitive) | On-prem/open-weight LLM; no default third-party API calls on sensitive data |
| Adoption resistance from officers used to manual process | Draft-and-review workflow (AI assists, human approves) lowers the trust barrier |
| Multi-subsidiary format inconsistency | Template + schema-mapping layer per subsidiary rather than one rigid format |

## 13. What Makes This Submission Unique (for the pitch)

1. **Traceability-first, not chatbot-first** — every AI output is source-linked.
2. **Knowledge graph over flat RAG** — enables temporal comparisons and cross-block/cross-subsidiary questions plain vector search gets wrong.
3. **Proactive topic/trend detection**, not just reactive Q&A.
4. **Human-in-the-loop by design** — low-confidence extraction never silently enters a report.
5. **Sovereign/on-prem deployment story** — aligns with Indian government digital-infrastructure direction and addresses data-sensitivity concerns.
6. **AI-vs-human provenance tracking on every report draft** — an audit feature a real CIL deployment would require.

---

*Recommend validating exact CIL report templates and a small real/sample document set
with a mentor or CMPDI contact before finalizing the entity schema and templates, since
the official PS did not attach a dataset.*
