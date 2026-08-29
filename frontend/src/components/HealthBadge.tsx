import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Check } from "@/lib/types";

const DOT: Record<Check | "loading", string> = {
  ok: "bg-ok",
  down: "bg-danger",
  blocked: "bg-warn",
  skipped: "bg-muted",
  loading: "bg-muted animate-pulse",
};

export function HealthBadge() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 20_000,
  });

  if (isError) {
    return (
      <span className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs">
        <span className="h-2 w-2 rounded-full bg-danger" />
        API unreachable
      </span>
    );
  }

  const checks = data?.checks ?? {};
  const overall: Check | "loading" = isLoading
    ? "loading"
    : data?.status === "ok"
      ? "ok"
      : "blocked";

  return (
    <span
      className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"
      title={Object.entries(checks)
        .map(([k, v]) => `${k}: ${v}`)
        .join("  ·  ")}
    >
      <span className={`h-2 w-2 rounded-full ${DOT[overall]}`} />
      {isLoading ? "checking…" : `backend ${data?.status}`}
      {!isLoading && (
        <span className="flex items-center gap-1 pl-1">
          {Object.entries(checks).map(([k, v]) => (
            <span key={k} className={`h-1.5 w-1.5 rounded-full ${DOT[v]}`} title={`${k}: ${v}`} />
          ))}
        </span>
      )}
    </span>
  );
}
