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
