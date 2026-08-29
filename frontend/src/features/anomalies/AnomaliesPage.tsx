import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AnomalyOut, AnomalySeverityT, AnomalyStatusT } from "@/lib/types";
import { BarList, Panel } from "@/components/charts";
import { Card, EmptyState } from "@/components/primitives";
import { Col, Grid, Kpi, KpiRow, Page, PageHeader } from "@/components/layout";

const SEV_DOT: Record<AnomalySeverityT, string> = {
  high: "bg-danger",
  medium: "bg-warn",
  low: "bg-muted",
};

const KIND_LABEL: Record<string, string> = {
  contradiction: "Conflicting figures",
  revision: "Figure revised",
  sum_mismatch: "Parts don't add up",
  out_of_range: "Implausible value",
  trend_break: "Outlier",
};

const STATUS_TABS: { key: AnomalyStatusT | "all"; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "resolved", label: "Resolved" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all", label: "All" },
];

/** For a revision/contradiction, show old vs new per figure as a paired bar. */
function CompareBars({ a }: { a: AnomalyOut }) {
  const byField = new Map<string, { old?: number; neu?: number; oldOn?: string; newOn?: string }>();
  for (const e of a.evidence) {
    if (e.field_key == null || e.value == null) continue;
    const g = byField.get(e.field_key) ?? {};
    if (g.old == null) {
      g.old = e.value;
      g.oldOn = e.as_on ?? undefined;
    } else if (e.value !== g.old) {
      g.neu = e.value;
      g.newOn = e.as_on ?? undefined;
    }
    byField.set(e.field_key, g);
  }
  const rows = [...byField.entries()].filter(([, g]) => g.old != null && g.neu != null);
  if (rows.length === 0) return null;
  const hi = Math.max(...rows.flatMap(([, g]) => [g.old ?? 0, g.neu ?? 0]), 1);

  return (
    <div className="mt-3 space-y-2">
      {rows.map(([k, g]) => {
        const delta = ((g.neu! - g.old!) / g.old!) * 100;
        return (
          <div key={k} className="text-xs">
            <div className="flex items-baseline justify-between">
              <span className="capitalize text-muted">{k.replace(/_/g, " ")}</span>
              <span
                className={`tabular-nums font-medium ${
                  delta < 0 ? "text-danger" : "text-ok"
                }`}
              >
                {delta > 0 ? "+" : ""}
                {delta.toFixed(1)}%
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="w-24 shrink-0 text-right tabular-nums text-muted">
                {g.old} <span className="text-[10px]">{g.oldOn}</span>
              </span>
              <span className="relative h-4 flex-1 rounded bg-surface-2">
                <span
                  className="absolute inset-y-0 left-0 rounded bg-muted/40"
                  style={{ width: `${(g.old! / hi) * 100}%` }}
                />
                <span
                  className="absolute inset-y-0 left-0 rounded"
                  style={{
                    width: `${(g.neu! / hi) * 100}%`,
                    background: delta < 0 ? "rgb(var(--c-danger))" : "rgb(var(--c-ok))",
                    opacity: 0.85,
                  }}
                />
              </span>
              <span className="w-24 shrink-0 tabular-nums font-medium">
                {g.neu} <span className="text-[10px] text-muted">{g.newOn}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EvidenceTable({ a }: { a: AnomalyOut }) {
  if (!a.evidence.length) return null;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[32rem] text-xs">
        <thead className="text-muted">
          <tr className="text-left">
            <th className="py-1 pr-3 font-medium">Source document</th>
            <th className="py-1 pr-3 font-medium">Figure</th>
            <th className="py-1 pr-3 font-medium tabular-nums">Value</th>
            <th className="py-1 font-medium">As of</th>
          </tr>
        </thead>
        <tbody>
          {a.evidence.map((e, i) => (
            <tr key={i} className="border-t border-border/50">
              <td className="py-1 pr-3">{e.filename ?? "—"}{e.page_no ? `, p.${e.page_no}` : ""}</td>
              <td className="py-1 pr-3">{e.field_key ? e.field_key.replace(/_/g, " ") : "—"}</td>
              <td className="py-1 pr-3 tabular-nums">{e.value ?? "—"}</td>
              <td className="py-1">{e.as_on ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnomalyCard({ a }: { a: AnomalyOut }) {
  const qc = useQueryClient();
  const [note, setNote] = useState(a.note ?? "");
  const review = useMutation({
    mutationFn: (status: AnomalyStatusT) => api.reviewAnomaly(a.id, status, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["anomalies"] }),
  });
  const terminal = a.status === "resolved" || a.status === "dismissed";

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEV_DOT[a.severity]}`}
          title={`${a.severity} severity`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
              {KIND_LABEL[a.kind] ?? a.kind}
            </span>
            <span className="text-[11px] capitalize text-muted">{a.status}</span>
          </div>
          <h3 className="mt-1 text-sm font-medium">{a.title}</h3>
          <p className="mt-1 text-xs text-muted">{a.detail}</p>
          <CompareBars a={a} />
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted">All source rows</summary>
            <EvidenceTable a={a} />
          </details>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)"
              className="min-w-0 flex-1 rounded border border-border bg-surface-2 px-2 py-1 text-xs"
            />
            {a.status !== "acknowledged" && !terminal && (
              <button
                onClick={() => review.mutate("acknowledged")}
                disabled={review.isPending}
                className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2 disabled:opacity-50"
              >
                Acknowledge
              </button>
            )}
            {!terminal && (
              <>
                <button
                  onClick={() => review.mutate("resolved")}
                  disabled={review.isPending}
                  className="rounded border border-ok/40 px-2 py-1 text-xs text-ok hover:bg-ok/10 disabled:opacity-50"
                >
                  Resolve
                </button>
                <button
                  onClick={() => review.mutate("dismissed")}
                  disabled={review.isPending}
                  className="rounded border border-border px-2 py-1 text-xs text-muted hover:bg-surface-2 disabled:opacity-50"
                >
                  Dismiss
                </button>
              </>
            )}
          </div>
          {a.reviewed_at && (
            <div className="mt-2 text-[11px] text-muted">
              Reviewed {new Date(a.reviewed_at).toLocaleString()}
              {a.note ? ` — ${a.note}` : ""}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

const SEV_COLOR: Record<string, string> = {
  high: "rgb(var(--c-danger))",
  medium: "rgb(var(--c-warn))",
  low: "rgb(var(--c-muted))",
};

export function AnomaliesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<AnomalyStatusT | "all">("open");

  const all = useQuery({ queryKey: ["anomalies", "all"], queryFn: () => api.anomalies({}) });
  const scan = useMutation({
    mutationFn: () => api.scanAnomalies(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["anomalies"] }),
  });

  const items = all.data?.items ?? [];
  const shown = useMemo(
    () => (tab === "all" ? items : items.filter((a) => a.status === tab)),
    [items, tab],
  );
  const count = (s: string) => items.filter((a) => a.status === s).length;
  const highOpen = items.filter((a) => a.status === "open" && a.severity === "high").length;

  return (
    <Page>
      <PageHeader
        title="Anomalies"
        actions={
          <button
            onClick={() => scan.mutate()}
            disabled={scan.isPending}
            className="rounded border border-border px-3 py-1.5 text-xs hover:bg-surface-2 disabled:opacity-50"
          >
            {scan.isPending ? "Checking…" : "Check again"}
          </button>
        }
      >
        Where a figure in a newer document disagrees with what earlier documents said
        about the same mine or block &mdash; a reserve revised between reports, parts that
        don&rsquo;t add up to a stated total, an impossible value, or a number far outside
        the usual range. Every row links to the documents it came from.
      </PageHeader>

      <KpiRow>
        <Kpi label="Open" value={count("open")} tone={count("open") ? "warn" : "ok"}
          onClick={() => setTab("open")} />
        <Kpi label="High severity" value={highOpen} tone={highOpen ? "danger" : "fg"} />
        <Kpi label="Acknowledged" value={count("acknowledged")}
          onClick={() => setTab("acknowledged")} />
        <Kpi label="Resolved" value={count("resolved")} tone="ok"
          onClick={() => setTab("resolved")} />
        <Kpi label="Dismissed" value={count("dismissed")}
          onClick={() => setTab("dismissed")} />
        <Kpi label="Total ever" value={items.length} onClick={() => setTab("all")} />
      </KpiRow>

      {scan.data && (
        <div className="rounded border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          Checked — {scan.data.detected} found ({scan.data.created} new),{" "}
          {scan.data.auto_resolved} no longer an issue.
        </div>
      )}

      <Grid>
        <Col span={8} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-full px-3 py-1 text-xs ${
                  tab === t.key
                    ? "bg-brand text-brand-fg"
                    : "border border-border text-muted hover:bg-surface-2"
                }`}
              >
                {t.label}
                {t.key !== "all" && (
                  <span className="ml-1.5 opacity-70">{count(t.key as string)}</span>
                )}
              </button>
            ))}
          </div>

          {all.isLoading && <Card className="p-6"><EmptyState>Loading…</EmptyState></Card>}
          {all.isError && (
            <Card className="p-6"><EmptyState>Couldn&rsquo;t load anomalies.</EmptyState></Card>
          )}
          {all.data && shown.length === 0 && (
            <Card className="p-6">
              <EmptyState>
                {tab === "open" && items.length > 0 ? (
                  <>Everything is reviewed. See the other tabs.</>
                ) : (
                  <>
                    Nothing here. Once two or more documents cover the same mine or block,
                    click <b>Check again</b> to compare their figures.
                  </>
                )}
              </EmptyState>
            </Card>
          )}
          {shown.map((a) => (
            <AnomalyCard key={a.id} a={a} />
          ))}
        </Col>

        <Col span={4} className="space-y-4">
          <Panel title="By kind" hint="all anomalies ever detected">
            <BarList
              data={Object.entries(all.data?.by_kind ?? {})
                .sort((x, y) => y[1] - x[1])
                .map(([k, v]) => ({ label: KIND_LABEL[k] ?? k, value: v }))}
            />
          </Panel>
          <Panel title="By severity">
            <BarList
              data={(["high", "medium", "low"] as const)
                .map((s) => ({
                  label: s[0].toUpperCase() + s.slice(1),
                  value: all.data?.by_severity?.[s] ?? 0,
                  color: SEV_COLOR[s],
                }))
                .filter((d) => d.value > 0)}
            />
          </Panel>
          <Panel title="What the kinds mean">
            <ul className="space-y-1.5 text-xs text-muted">
              <li><b className="text-fg">Figure revised</b> — same block, later report, different number.</li>
              <li><b className="text-fg">Conflicting figures</b> — two sources, same period, different value.</li>
              <li><b className="text-fg">Parts don&rsquo;t add up</b> — proved + indicated + inferred ≠ total.</li>
              <li><b className="text-fg">Implausible value</b> — negative, or a percentage over 100.</li>
              <li><b className="text-fg">Outlier</b> — far from the entity&rsquo;s own history.</li>
            </ul>
          </Panel>
        </Col>
      </Grid>
    </Page>
  );
}
