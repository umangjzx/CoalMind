import type { HealthResponse, VersionResponse } from "./types";

// In dev, Vite proxies /api -> backend (see vite.config.ts). In a built
// deployment set VITE_API_BASE_URL to the backend origin.
const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${path}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => get<HealthResponse>("/health"),
  version: () => get<VersionResponse>("/version"),
};
