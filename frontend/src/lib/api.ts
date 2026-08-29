import type {
  AskResponse,
  DiffResponse,
  DocumentDetail,
  DocumentListResponse,
  EntityDetail,
  EntityListResponse,
  GraphStats,
  HealthResponse,
  QAListResponse,
  QAOut,
  ReportDetailT,
  ReportListResponse,
  ReportTemplate,
  ReviewActionKind,
  ReviewQueueResponse,
  ReviewResult,
  SearchResponse,
  SubgraphResponse,
  VersionResponse,
} from "./types";

// In dev, Vite proxies /api -> backend (see vite.config.ts). In a built
// deployment set VITE_API_BASE_URL to the backend origin.
const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
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

  // --- M2: knowledge ---
  graphStats: () => get<GraphStats>("/knowledge/stats"),
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
