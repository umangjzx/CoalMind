import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { DEPENDENCY_LABELS, healthWord } from "@/lib/labels";

function sum(rec: Record<string, number> | undefined): number {
  return Object.values(rec ?? {}).reduce((a, b) => a + b, 0);
}

/** A labelled number. Becomes a link when `to` is set. */
function Stat({
  label,
  value,
  hint,
  to,
}: {
  label: string;
  value: string;
  hint?: string;
  to?: string;
}) {
  const inner = (
    <>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </>
  );
  const base = "block rounded-lg border border-border bg-surface p-4";
  return to ? (
    <Link to={to} className={`${base} transition-colors hover:border-brand`}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
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
  const reviewCount = o?.review_queue ?? 0;
  const openAnomalies = anomalies.data?.open_count ?? 0;
  const allClear = !overview.isLoading && reviewCount === 0 && openAnomalies === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          A snapshot of the document collection and anything that needs your attention.
        </p>
      </header>

      {/* --- needs your attention: the actionable stuff, first --- */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">Needs your attention</h2>
        {allClear ? (
          <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
            You&rsquo;re all caught up — nothing is waiting for review.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              to="/ingestion"
              className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-brand"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">Values to review</span>
                <span className="text-2xl font-semibold tabular-nums text-warn">
                  {n(o?.review_queue)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Extracted with low confidence — confirm, correct, or reject them before
                they&rsquo;re used in reports or answers.
              </p>
            </Link>

            <Link
              to="/anomalies"
              className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-brand"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">Open anomalies</span>
                <span className="text-2xl font-semibold tabular-nums">
                  {anomalies.data ? openAnomalies : "—"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Figures in new documents that disagree with earlier records for the same
                mine or block.
              </p>
              {anomalies.data && anomalies.data.items.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {anomalies.data.items.slice(0, 3).map((a) => (
                    <li key={a.id} className="flex items-start gap-2 text-xs">
                      <span
                        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                          a.severity === "high"
                            ? "bg-danger"
                            : a.severity === "medium"
                              ? "bg-warn"
                              : "bg-muted"
                        }`}
                      />
                      <span className="min-w-0 truncate">{a.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Link>
          </div>
        )}
      </section>

      {/* --- the collection --- */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">The document collection</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Documents"
            value={n(sum(o?.documents_by_status))}
            hint="uploaded & processed"
            to="/ingestion"
          />
          <Stat
            label="Facts extracted"
            value={n(o?.kg_entities)}
            hint={`${n(o?.kg_relations)} links between them`}
            to="/knowledge"
          />
          <Stat
            label="Reports"
            value={n(sum(o?.reports_by_status))}
            hint="drafts & finalised"
            to="/reports"
          />
          <Stat
            label="Saved answers"
            value={o ? String(o.qa_by_status?.verified ?? 0) : "—"}
            hint="officer-verified Q&A"
            to="/query"
          />
        </div>
      </section>

      {/* --- system status, in plain words --- */}
      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">System status</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(health.data?.checks ?? {}).map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between rounded bg-surface-2 px-3 py-2"
            >
              <span>{DEPENDENCY_LABELS[k] ?? k}</span>
              <span
                className={
                  v === "ok"
                    ? "text-ok"
                    : v === "blocked"
                      ? "text-muted"
                      : v === "down"
                        ? "text-danger"
                        : "text-warn"
                }
              >
                {healthWord(v)}
              </span>
            </div>
          ))}
          {health.isLoading && <div className="text-muted">Checking…</div>}
          {health.isError && (
            <div className="text-danger">
              Can&rsquo;t reach the backend — start it with{" "}
              <code className="font-mono text-xs">python scripts/dev.py api</code>.
            </div>
          )}
        </div>
        {version.data && (
          <p className="mt-3 text-xs text-muted">
            {version.data.allow_third_party_api
              ? `Answers may use a hosted AI model (${version.data.llm_provider}). `
              : "Runs fully on-premises — no document data leaves this deployment. "}
            Version {version.data.version}.
          </p>
        )}
      </section>
    </div>
  );
}
