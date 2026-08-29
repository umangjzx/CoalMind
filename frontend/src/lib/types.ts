export type Check = "ok" | "down" | "blocked" | "skipped";

export interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  checks: Record<string, Check>;
  detail: Record<string, string>;
}

export interface VersionResponse {
  name: string;
  version: string;
  llm_provider: string;
  embed_provider: string;
  allow_third_party_api: boolean;
}

// --- M1: ingestion & extraction ---

export type DocStatus =
  | "received"
  | "processing"
  | "extracted"
  | "needs_review"
  | "ready"
  | "failed";

export type FieldStatus = "auto_accepted" | "needs_review" | "verified" | "rejected";

export interface PipelineMeta {
  pages?: number;
  ocr_pages?: number;
  fields_extracted?: number;
  fields_needs_review?: number;
  threshold?: number;
  doc_notes?: string[];
  classified_as?: string;
}

export interface DocumentOut {
  id: string;
  original_filename: string;
  content_type: string;
  sha256: string;
  size_bytes: number;
  page_count: number | null;
  doc_type: string | null;
  language: string | null;
  doc_date: string | null;
  status: DocStatus;
  error: string;
  processed_at: string | null;
  meta: { pipeline?: PipelineMeta } & Record<string, unknown>;
  subsidiary_id: string | null;
  created_at: string;
}

export interface FieldOut {
  id: string;
  field_key: string;
  label: string;
  value_text: string;
  original_value_text: string;
  value_json: Record<string, unknown> | null;
  entity_type: string | null;
  extractor: string;
  source_kind: string;
  page_no: number | null;
  bbox: Record<string, number> | null;
  source_snippet: string;
  confidence: number;
  status: FieldStatus;
  review_note: string;
  reviewed_at: string | null;
}

export interface DocumentDetail extends DocumentOut {
  fields: FieldOut[];
}

export interface DocumentListResponse {
  items: DocumentOut[];
  total: number;
}

export interface ReviewQueueItem {
  id: string;
  document_id: string;
  document_filename: string;
  doc_type: string | null;
  field_key: string;
  label: string;
  value_text: string;
  value_json: Record<string, unknown> | null;
  entity_type: string | null;
  source_kind: string;
  page_no: number | null;
  bbox: Record<string, number> | null;
  source_snippet: string;
  confidence: number;
  review_note: string;
  status: FieldStatus;
}

export interface ReviewQueueResponse {
  items: ReviewQueueItem[];
  total: number;
}

export type ReviewActionKind = "confirm" | "correct" | "reject";

export interface ReviewResult {
  id: string;
  status: FieldStatus;
  value_text: string;
  document_id: string;
  document_status: DocStatus;
  reviewed_at: string | null;
}

// --- M2: knowledge layer ---

export interface KGEntity {
  id: string;
  kind: string;
  name: string;
  normalized_key: string;
  attrs: Record<string, unknown>;
  subsidiary_id: string | null;
  document_id: string | null;
  source_field_id: string | null;
  confidence: number;
  created_at: string;
}

export interface KGRelation {
  id: string;
  src_id: string;
  dst_id: string;
  predicate: string;
  valid_from: string | null;
  valid_to: string | null;
  attrs: Record<string, unknown>;
  document_id: string | null;
  source_field_id: string | null;
  confidence: number;
}

export interface KGNeighbor {
  direction: "in" | "out";
  predicate: string;
  valid_from: string | null;
  entity: KGEntity;
  relation_id: string;
  source_field_id: string | null;
}

export interface EntityListResponse {
  items: KGEntity[];
  total: number;
}

export interface EntityDetail {
  entity: KGEntity;
  neighbors: KGNeighbor[];
}

export interface SubgraphResponse {
  entities: KGEntity[];
  relations: KGRelation[];
}

export interface ChunkHit {
  chunk_id: string;
  document_id: string;
  document_filename: string;
  doc_type: string | null;
  page_no: number | null;
  text: string;
  score: number;
}

export interface SearchResponse {
  query: string;
  hits: ChunkHit[];
}

export interface GraphStats {
  entities: number;
  entities_by_kind: Record<string, number>;
  relations: number;
  relations_by_predicate: Record<string, number>;
  chunks: number;
}

// --- M3: report generation ---

export interface TemplateParam {
  name: string;
  label: string;
  type: "text" | "date" | "select";
  required: boolean;
  options?: { value: string; label: string }[];
  help?: string;
}

export interface ReportTemplate {
  key: string;
  title: string;
  description: string;
  param_schema: TemplateParam[];
}

export type ReportStatusT = "draft" | "in_review" | "final";

export interface ReportBlock {
  type: "heading" | "paragraph" | "table" | "kv";
  text?: string;
  level?: number;
  columns?: string[];
  rows?: string[][];
  items?: { label: string; value: string }[];
  editable?: boolean;
}

export interface ReportCitation {
  marker: number;
  extraction_field_id: string | null;
  document_id: string | null;
  document_filename: string | null;
  page_no: number | null;
  field_key: string;
  value: string;
  snippet: string;
  confidence: number;
}

export interface ReportUnresolved {
  extraction_field_id: string;
  field_key: string;
  label: string;
  document_id: string;
  reason: string;
}

export interface ReportVersionT {
  id: string;
  version_no: number;
  author_kind: "ai" | "human";
  author_id: string | null;
  summary: string;
  blocks: ReportBlock[];
  content_md: string;
  citations: ReportCitation[];
  unresolved: ReportUnresolved[];
  created_at: string;
}

export interface ReportVersionSummary {
  id: string;
  version_no: number;
  author_kind: "ai" | "human";
  summary: string;
  created_at: string;
  unresolved_count: number;
}

export interface ReportT {
  id: string;
  title: string;
  template_key: string;
  status: ReportStatusT;
  params: Record<string, unknown>;
  subsidiary_id: string | null;
  current_version_id: string | null;
  finalized_at: string | null;
  created_at: string;
}

export interface ReportDetailT extends ReportT {
  current_version: ReportVersionT | null;
  versions: ReportVersionSummary[];
}

export interface ReportListResponse {
  items: ReportT[];
  total: number;
}

export interface DiffResponse {
  from_: { version_no: number; author_kind: string };
  to: { version_no: number; author_kind: string };
  unified: string;
}

// --- M4: query & response ---

export type QAStatusT = "answered" | "verified" | "insufficient" | "rejected";

export interface QAEvidence {
  kind: "fact" | "passage";
  text: string;
  score: number;
  document_id: string | null;
  document_filename: string | null;
  page_no: number | null;
  source_field_id: string | null;
  entity: string | null;
}

export interface QAOut {
  id: string;
  question: string;
  answer_md: string;
  citations: ReportCitation[];
  evidence: QAEvidence[];
  confidence: number;
  status: QAStatusT;
  answer_mode: "rag" | "search_only" | "cache";
  subsidiary_id: string | null;
  verified_at: string | null;
  hit_count: number;
  created_at: string;
}

export interface AskResponse extends QAOut {
  confidence_threshold: number;
  from_cache: boolean;
}

export interface QAListResponse {
  items: QAOut[];
  total: number;
}

// --- M5: topics & word cloud ---

export interface WordItem {
  term: string;
  count: number;
  weight: number;
}

export interface WordCloudResponse {
  items: WordItem[];
  filters: Record<string, string | null>;
}

export interface TopicOut {
  id: string;
  topic_index: number;
  engine: string;
  label: string;
  terms: { term: string; weight: number }[];
  doc_count: number;
  summary: string;
  first_seen: string | null;
  last_seen: string | null;
  created_at: string;
}

export interface TopicDocOut {
  document_id: string;
  filename: string;
  doc_type: string | null;
  doc_date: string | null;
  subsidiary_id: string | null;
  weight: number;
}

export interface TopicDetail extends TopicOut {
  documents: TopicDocOut[];
}

export interface TopicListResponse {
  items: TopicOut[];
  engine: string | null;
  run_id: string | null;
}

export interface TrendsResponse {
  buckets: string[];
  series: { topic_index: number; label: string; counts: number[] }[];
}

// --- M6: security / admin ---

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  subsidiary_id: string | null;
  last_login_at: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  user: AuthUser;
}

export interface MeResponse extends AuthUser {
  is_authenticated: boolean;
  scoped: boolean;
}

export interface SecurityPosture {
  auth_required: boolean;
  llm_provider: string;
  allow_third_party_api: boolean;
  llm_is_hosted: boolean;
  llm_effective: string;
  embeddings_provider: string;
  embeddings_on_prem: boolean;
  audit_chain_ok: boolean;
  audit_events: number;
}

export interface AdminOverview {
  documents_by_status: Record<string, number>;
  fields_by_status: Record<string, number>;
  review_queue: number;
  kg_entities: number;
  kg_relations: number;
  doc_chunks: number;
  reports_by_status: Record<string, number>;
  qa_by_status: Record<string, number>;
  topics: number;
  subsidiaries: number;
  users: number;
  security: SecurityPosture;
}

export interface AuditRow {
  seq: number;
  at: string;
  actor: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  meta: Record<string, unknown>;
  entry_hash: string | null;
}

export interface AuditListResponse {
  items: AuditRow[];
  total: number;
}

export interface ChainVerifyResponse {
  ok: boolean;
  checked: number;
  first_broken_seq: number | null;
  detail: string;
}

export interface AdminUserRow extends AuthUser {
  created_at: string;
  has_password: boolean;
}

export interface ExtractionQuality {
  total_fields: number;
  auto_accept_rate: number;
  mean_confidence: number;
  review_outcomes: Record<string, number>;
  ocr_page_ratio: number;
  by_doc_type: Record<string, { fields: number; mean_confidence: number }>;
}

// --- M7: anomaly detection ---

export type AnomalyKindT =
  | "contradiction"
  | "revision"
  | "sum_mismatch"
  | "out_of_range"
  | "trend_break";
export type AnomalySeverityT = "low" | "medium" | "high";
export type AnomalyStatusT = "open" | "acknowledged" | "resolved" | "dismissed";

export interface AnomalyEvidenceT {
  document_id: string | null;
  filename: string | null;
  page_no: number | null;
  field_key: string | null;
  value: number | null;
  as_on: string | null;
}

export interface AnomalyOut {
  id: string;
  signature: string;
  kind: AnomalyKindT;
  severity: AnomalySeverityT;
  status: AnomalyStatusT;
  title: string;
  detail: string;
  entity_id: string | null;
  subsidiary_id: string | null;
  evidence: AnomalyEvidenceT[];
  reviewed_by_id: string | null;
  reviewed_at: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface AnomalyListResponse {
  items: AnomalyOut[];
  total: number;
  open_count: number;
  by_kind: Record<string, number>;
  by_severity: Record<string, number>;
}

export interface AnomalyScanResponse {
  detected: number;
  created: number;
  updated: number;
  auto_resolved: number;
  by_kind: Record<string, number>;
}
