import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { NAV } from "@/app/nav";
import { Link } from "react-router-dom";

function sum(rec: Record<string, number> | undefined): number {
  return Object.values(rec ?? {}).reduce((a, b) => a + b, 0);
}

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
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: api.adminOverview });
  const anomalies = useQuery({
    queryKey: ["anomalies", "open"],
    queryFn: () => api.anomalies({ status: "open", limit: 6 }),
  });

  const o = overview.data;
  const n = (x: number | undefined) => (x === undefined ? "—" : String(x));

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Corpus health, the low-confidence review queue, and inconsistencies flagged
          between historical and newly ingested data.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Documents" value={n(sum(o?.documents_by_status))} hint="ingested" />
        <Stat label="Needs review" value={n(o?.review_queue)} hint="low-confidence fields" />
        <Stat label="Reports drafted" value={n(sum(o?.reports_by_status))} hint="all statuses" />
        <Stat
          label="Verified answers"
          value={o ? String(o.qa_by_status?.verified ?? 0) : "—"}
          hint="promoted Q&A"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="KG entities" value={n(o?.kg_entities)} />
        <Stat label="KG relations" value={n(o?.kg_relations)} />
        <Stat label="Topics" value={n(o?.topics)} />
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Open anomalies</h2>
          <Link to="/anomalies" className="text-xs text-brand hover:underline">
            {anomalies.data ? `${anomalies.data.open_count} open →` : "view all →"}
          </Link>
        </div>
        <div className="mt-3 space-y-2">
          {anomalies.isLoading && <div className="text-sm text-muted">checking…</div>}
          {anomalies.data && anomalies.data.items.length === 0 && (
            <div className="text-sm text-muted">
              None open. New inconsistencies appear here after ingestion.
            </div>
          )}
          {anomalies.data?.items.map((a) => (
            <Link
              key={a.id}
              to="/anomalies"
              className="flex items-start gap-2 rounded bg-surface-2 px-3 py-2 text-sm hover:bg-surface-2/70"
            >
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  a.severity === "high"
                    ? "bg-danger"
                    : a.severity === "medium"
                      ? "bg-warn"
                      : "bg-muted"
                }`}
              />
              <span className="min-w-0">
                <span className="font-medium">{a.title}</span>
                <span className="ml-2 text-xs text-muted">{a.kind.replace(/_/g, " ")}</span>
              </span>
            </Link>
          ))}
        </div>
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
          {NAV.filter((x) => x.to !== "/").map((x) => (
            <Link
              key={x.to}
              to={x.to}
              className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-brand"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{x.label}</span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
                  {x.milestone}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">{x.blurb}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
