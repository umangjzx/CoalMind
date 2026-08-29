import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { NAV } from "@/app/nav";
import { Link } from "react-router-dom";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function DashboardPage() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const version = useQuery({ queryKey: ["version"], queryFn: api.version });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Once ingestion is live (M1) this shows corpus size, the low-confidence
          review queue, and trending topics across subsidiaries. For now it
          confirms the platform is wired up.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Documents" value="—" hint="M1" />
        <Stat label="Needs review" value="—" hint="M1" />
        <Stat label="Reports drafted" value="—" hint="M3" />
        <Stat label="Verified answers" value="—" hint="M4" />
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Platform status</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(health.data?.checks ?? {}).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between rounded bg-surface-2 px-3 py-2">
              <span className="capitalize">{k}</span>
              <span
                className={
                  v === "ok"
                    ? "text-ok"
                    : v === "blocked"
                      ? "text-warn"
                      : v === "down"
                        ? "text-danger"
                        : "text-muted"
                }
              >
                {v}
              </span>
            </div>
          ))}
          {health.isLoading && <div className="text-muted">checking…</div>}
          {health.isError && <div className="text-danger">backend unreachable</div>}
        </div>
        {version.data && (
          <div className="mt-3 text-xs text-muted">
            v{version.data.version} · llm: <b>{version.data.llm_provider}</b> · embeddings:{" "}
            <b>{version.data.embed_provider}</b> · third-party API:{" "}
            <b>{version.data.allow_third_party_api ? "allowed" : "blocked"}</b>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Modules</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NAV.filter((n) => n.to !== "/").map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-brand"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{n.label}</span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
                  {n.milestone}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">{n.blurb}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
