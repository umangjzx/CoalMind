import type {
  DocumentDetail,
  DocumentListResponse,
  EntityDetail,
  EntityListResponse,
  GraphStats,
  HealthResponse,
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
