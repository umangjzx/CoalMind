# CoalMind AI — Domain Entity Schema

The knowledge graph the query engine reasons over (PRD §6.3). Physical tables
`kg_entity` and `kg_relation` land in **M2**; this is the target model. Validate against
real CIL report templates before freezing (PRD closing note).

## Entities

| Entity | Meaning | Key attributes | Example |
|---|---|---|---|
| **Subsidiary** | A CIL company or the national scope | `code` (BCCL, CCL, ECL, MCL, NCL, SECL, WCL, NEC, CIL), `name`, `is_national` | ECL |
| **Mine** | A mine / colliery / project | `name`, `mine_type` (opencast / underground / mixed), `subsidiary` | Jhanjra Underground Project |
| **Block** | A demarcated coal block within a mine/region | `name`, `mine`, `status` (exploratory / allocated / operational) | Jhanjra Block-II |
| **Seam** | A coal seam | `name` (e.g. R-VII, Seam-IV Bottom), `avg_thickness_m`, `avg_grade` | R-VII |
| **Mineral** | Mineral/commodity a figure refers to | `name` (coal, manganiferous horizon, …) | coal |
| **Reserve** | A reserve estimate as of a date | `category` (proved/indicated/inferred), `quantity`, `unit`, `as_on`, `mineral`, `block`/`seam` | Proved 182.40 MT as on 2021-04-01 |
| **ProductionFigure** | A production/OB/target datum for a period | `metric`, `value`, `unit`, `period` (month/FY), `mine` | Coal production 18.63 lakh Te, Aug 2023 |
| **Report** | A source document / compiled report | `doc_type`, `title`, `date`, `subsidiary`, `document_id` (→ `document` table) | Starred Question No. 312 draft reply |
| **Officer** | A person referenced as author/approver/signatory | `name`, `designation`, `subsidiary` | Chief Geologist, WCL |
| **Inquiry** | A parliamentary / administrative question being answered | `reference`, `date`, `topic`, `house` | Lok Sabha Starred Q. 312 |
| **Topic** | A cluster from the topic-modeling pipeline (M5) | `label`, `keywords`, `first_seen`, `last_seen` | "belt conveyor damage" |
| **Date** | Normalized temporal anchor for `as_on` / period / event | ISO date or (year, month) | 2019 revision |

## Relationships

| Relationship | From → To | Notes |
|---|---|---|
| `located_in` | Mine → Subsidiary; Block → Mine; Seam → Block | geography / ownership |
| `contains` | Block → Seam; Seam → Mineral | |
| `has_reserve` | Block \| Seam → Reserve | a Reserve also `for_mineral` → Mineral |
| `produces` | Mine → ProductionFigure | period-stamped |
| `reported_in` | Reserve \| ProductionFigure \| Finding → Report | **the traceability edge** — carries `{page_no, bbox, extraction_field_id}` |
| `responds_to` | Report → Inquiry | draft replies ↔ questions |
| `authored_by` / `approved_by` | Report → Officer | provenance |
| `supersedes` | Reserve → Reserve; Report → Report | temporal revision chains ("before/after the 2019 revision") |
| `mentions` | Report → Topic (M5); Report → Mine/Block/Seam | powers drill-down and trends |
| `valid_from` / `valid_to` | attributes on any edge | temporal validity for as-of queries |

## Why a graph and not flat chunks

The queries CIL actually asks are relational and temporal:

- *"Manganese reserve estimates for Wani North block before and after the 2019 revision"*
  → follow `has_reserve` + `supersedes` + `valid_from`, not keyword match.
- *"Which subsidiaries reported belt-conveyor issues in 2023?"*
  → `Topic("belt conveyor…") ← mentions ← Report → located_in → Subsidiary`, filtered by date.
- *"Total proved reserves across ECL underground mines"*
  → aggregate `Reserve.quantity` where `category=proved` over `Block located_in Mine
  (mine_type=underground) located_in Subsidiary(ECL)`.

Every node/edge that yields a number in an answer or report keeps a `reported_in` edge to
a `Report`, which resolves to `{document, page, bounding box}` — satisfying the ≤2-click
traceability NFR.

## Mapping from M0 tables

| M0 table | Becomes / feeds |
|---|---|
| `document` | `Report` nodes (source of truth stays in MinIO) |
| `extraction_field` | the payload of `Reserve` / `ProductionFigure` / `Finding` nodes + the `reported_in` edge metadata |
| `subsidiary` | `Subsidiary` nodes |
| `app_user` | `Officer` nodes (platform users) + RBAC subject |
| `audit_event` | not a graph entity — immutable provenance of every mutation |
