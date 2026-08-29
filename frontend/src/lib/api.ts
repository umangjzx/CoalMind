import { clearSession, getToken } from "./auth";
import type {
  AdminOverview,
  AdminUserRow,
  AnomalyListResponse,
  AnomalyOut,
  AnomalyScanResponse,
  AskResponse,
  AuditListResponse,
  ChainVerifyResponse,
  DiffResponse,
  ExtractionQuality,
  MeResponse,
  SecurityPosture,
  TokenResponse,
  DocumentDetail,
  DocumentListResponse,
  EntityDetail,
  EntityListResponse,
  GraphStats,
  HealthResponse,
  QAListResponse,
  QAOut,
  ReportDetailT,
  TopicDetail,
  TopicListResponse,
  TrendsResponse,
  WordCloudResponse,
  ReportListResponse,
  ReportTemplate,
  ReviewActionKind,
  ReviewQueueResponse,
  ReviewResult,
  SearchResponse,
  SubgraphResponse,
  ValidationSummary,
  VersionResponse,
} from "./types";

// In dev, Vite proxies /api -> backend (see vite.config.ts). In a built
// deployment set VITE_API_BASE_URL to the backend origin.
const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401 && token && !path.startsWith("/auth/")) {
    clearSession(); // stale/expired token — drop it, fall back to dev session
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status} ${res.statusText} for ${path} ${detail}`);
  }
  return (await res.json()) as T;
}

const get = <T>(path: string) => req<T>(path);

export const api = {
  health: () => get<HealthResponse>("/health"),
  version: () => get<VersionResponse>("/version"),
  validation: () => get<ValidationSummary>("/validation/summary"),

  // --- M6: auth + admin ---
  login: (email: string, password: string) =>
    req<TokenResponse>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  me: () => get<MeResponse>("/auth/me"),
  adminOverview: () => get<AdminOverview>("/admin/overview"),
  adminSecurity: () => get<SecurityPosture>("/admin/security"),
  adminAudit: (params: { action?: string; actor?: string; limit?: number } = {}) => {
    const q = new URLSearchParams({ limit: String(params.limit ?? 60) });
    if (params.action) q.set("action", params.action);
    if (params.actor) q.set("actor", params.actor);
    return get<AuditListResponse>(`/admin/audit?${q}`);
  },
  adminVerifyChain: () => get<ChainVerifyResponse>("/admin/audit/verify"),
  adminUsers: () => get<AdminUserRow[]>("/admin/users"),
  adminCreateUser: (body: {
    email: string;
    full_name: string;
    role: string;
    subsidiary_id?: string | null;
    password: string;
  }) =>
    req<AdminUserRow>("/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  adminUpdateUser: (
    id: string,
    body: Partial<{ role: string; subsidiary_id: string | null; is_active: boolean; full_name: string }>,
  ) =>
    req<AdminUserRow>(`/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  adminSetPassword: (id: string, password: string) =>
    req<AdminUserRow>(`/admin/users/${id}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }),
  adminExtractionQuality: () => get<ExtractionQuality>("/admin/extraction-quality"),

  // --- M1 ---
  listDocuments: (params: { status?: string; doc_type?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.status) q.set("status", params.status);
    if (params.doc_type) q.set("doc_type", params.doc_type);
    q.set("limit", String(params.limit ?? 100));
    return get<DocumentListResponse>(`/ingestion/documents?${q}`);
  },
  getDocument: (id: string) => get<DocumentDetail>(`/ingestion/documents/${id}`),
  documentFileUrl: (id: string) => `${BASE}/ingestion/documents/${id}/file`,
  reprocess: (id: string) =>
    req(`/ingestion/documents/${id}/reprocess`, { method: "POST" }),

  uploadDocuments: (files: File[], actor?: string) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    return req(`/ingestion/documents`, {
      method: "POST",
      body: fd,
      headers: actor ? { "X-Actor-Email": actor } : {},
    });
  },

  reviewQueue: (params: { doc_type?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.doc_type) q.set("doc_type", params.doc_type);
    q.set("limit", String(params.limit ?? 200));
    return get<ReviewQueueResponse>(`/review/queue?${q}`);
  },
  reviewField: (
    fieldId: string,
    body: { action: ReviewActionKind; value_text?: string; note?: string },
    actor?: string,
  ) =>
    req<ReviewResult>(`/review/fields/${fieldId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(actor ? { "X-Actor-Email": actor } : {}),
      },
      body: JSON.stringify(body),
    }),

  // --- M3: reports ---
  reportTemplates: () => get<ReportTemplate[]>("/reports/templates"),
  listReports: (status?: string) =>
    get<ReportListResponse>(`/reports${status ? `?status=${status}` : ""}`),
  getReport: (id: string) => get<ReportDetailT>(`/reports/${id}`),
  createReport: (body: {
    template_key: string;
    params: Record<string, unknown>;
    title?: string;
  }) =>
    req<ReportDetailT>("/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  rerenderReport: (id: string) =>
    req<ReportDetailT>(`/reports/${id}/rerender`, { method: "POST" }),
  editReport: (id: string, content_md: string, summary: string) =>
    req<ReportDetailT>(`/reports/${id}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_md, summary }),
    }),
  finalizeReport: (id: string) =>
    req<ReportDetailT>(`/reports/${id}/finalize`, { method: "POST" }),
  reportDiff: (id: string, from: number, to: number) =>
    get<DiffResponse>(`/reports/${id}/diff?from=${from}&to=${to}`),
  reportExportUrl: (id: string, format: "pdf" | "docx" | "html", version?: number) =>
    `${BASE}/reports/${id}/export?format=${format}${version ? `&version=${version}` : ""}`,

  // --- M4: query & response ---
  ask: (question: string, subsidiary_id?: string) =>
    req<AskResponse>("/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, subsidiary_id: subsidiary_id ?? null }),
    }),
  queryHistory: (limit = 50) => get<QAListResponse>(`/query/history?limit=${limit}`),
  queryCache: () => get<QAListResponse>("/query/cache"),
  verifyAnswer: (id: string) => req<QAOut>(`/query/${id}/verify`, { method: "POST" }),
  rejectAnswer: (id: string) => req<QAOut>(`/query/${id}/reject`, { method: "POST" }),

  // --- M5: topics & word cloud ---
  wordCloud: (p: { subsidiary_id?: string; doc_type?: string; since?: string } = {}) => {
    const q = new URLSearchParams({ limit: "70" });
    if (p.subsidiary_id) q.set("subsidiary_id", p.subsidiary_id);
    if (p.doc_type) q.set("doc_type", p.doc_type);
    if (p.since) q.set("since", p.since);
    return get<WordCloudResponse>(`/topics/wordcloud?${q}`);
  },
  topics: () => get<TopicListResponse>("/topics"),
  topicDetail: (id: string) => get<TopicDetail>(`/topics/${id}`),
  topicTrends: (subsidiary_id?: string) =>
    get<TrendsResponse>(`/topics/trends${subsidiary_id ? `?subsidiary_id=${subsidiary_id}` : ""}`),
  rebuildTopics: (nTopics = 5) =>
    req<TopicListResponse>(`/topics/rebuild?n_topics=${nTopics}`, { method: "POST" }),

  // --- M7: anomaly detection ---
  anomalies: (p: { status?: string; kind?: string; severity?: string; limit?: number } = {}) => {
    const q = new URLSearchParams({ limit: String(p.limit ?? 100) });
    if (p.status) q.set("status", p.status);
    if (p.kind) q.set("kind", p.kind);
    if (p.severity) q.set("severity", p.severity);
    return get<AnomalyListResponse>(`/anomalies?${q}`);
  },
  scanAnomalies: () => req<AnomalyScanResponse>("/anomalies/scan", { method: "POST" }),
  reviewAnomaly: (id: string, status: string, note = "") =>
    req<AnomalyOut>(`/anomalies/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note }),
    }),

  // --- M2: knowledge ---
  graphStats: () => get<GraphStats>("/knowledge/stats"),
  knowledgeGraph: () => get<SubgraphResponse>("/knowledge/graph"),
  listEntities: (params: { kind?: string; q?: string; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (params.kind) p.set("kind", params.kind);
    if (params.q) p.set("q", params.q);
    p.set("limit", String(params.limit ?? 100));
    return get<EntityListResponse>(`/knowledge/entities?${p}`);
  },
  entityDetail: (id: string, asOf?: string) =>
    get<EntityDetail>(`/knowledge/entities/${id}${asOf ? `?as_of=${asOf}` : ""}`),
  documentSubgraph: (documentId: string) =>
    get<SubgraphResponse>(`/knowledge/documents/${documentId}/subgraph`),
  semanticSearch: (q: string, k = 8) =>
    get<SearchResponse>(`/knowledge/search?q=${encodeURIComponent(q)}&k=${k}`),
};
