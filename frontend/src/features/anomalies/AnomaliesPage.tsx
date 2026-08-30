import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AnomalyOut, AnomalySeverityT, AnomalyStatusT } from "@/lib/types";
import { BarList, Panel, SeverityMatrix } from "@/components/charts";
import { SkeletonRows } from "@/components/primitives";
import { Btn, Col, Grid, Kpi, KpiRow, Page, PageHeader, TabBar } from "@/components/layout";

/* ── Constants ───────────────────────────────────────────────────────── */
const SEV_DOT: Record<AnomalySeverityT, string> = {
  high:   "bg-danger",
  medium: "bg-warn",
  low:    "bg-faint",
};

const SEV_BADGE: Record<AnomalySeverityT, string> = {
  high:   "bg-danger-lt text-danger border-danger/20",
  medium: "bg-warn-lt text-warn border-warn/20",
  low:    "bg-surface-2 text-muted border-border",
};

const KIND_LABEL: Record<string, string> = {
  contradiction: "Conflicting figures",
  revision:      "Figure revised",
  sum_mismatch:  "Parts don't add up",
  out_of_range:  "Implausible value",
  trend_break:   "Outlier",
};

const STATUS_TABS: { key: AnomalyStatusT | "all"; label: string }[] = [
  { key: "open",         label: "Open"         },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "resolved",     label: "Resolved"     },
  { key: "dismissed",    label: "Dismissed"    },
  { key: "all",          label: "All"          },
];

/* ── Compare bars ────────────────────────────────────────────────────── */
function CompareBars({ a }: { a: AnomalyOut }) {
  const byField = new Map<string, { old?: number; neu?: number; oldOn?: string; newOn?: string }>();
  for (const e of a.evidence) {
    if (e.field_key == null || e.value == null) continue;
    const g = byField.get(e.field_key) ?? {};
    if (g.old == null) { g.old = e.value; g.oldOn = e.as_on ?? undefined; }
    else if (e.value !== g.old) { g.neu = e.value; g.newOn = e.as_on ?? undefined; }
    byField.set(e.field_key, g);
  }
  const rows = [...byField.entries()].filter(([, g]) => g.old != null && g.neu != null);
  if (!rows.length) return null;
  const hi = Math.max(...rows.flatMap(([, g]) => [g.old ?? 0, g.neu ?? 0]), 1);

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-surface-2/50 p-3">
      {rows.map(([k, g]) => {
        const delta = ((g.neu! - g.old!) / g.old!) * 100;
        const up = delta >= 0;
        return (
          <div key={k}>
            <div className="flex items-baseline justify-between text-[11.5px]">
              <span className="capitalize text-muted">{k.replace(/_/g, " ")}</span>
              <span className={`tabular-nums font-semibold ${up ? "text-ok" : "text-danger"}`}>
                {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="w-20 shrink-0 text-right text-[11px] tabular-nums text-muted">
                {g.old}
                {g.oldOn && <span className="ml-1 text-[10px] text-faint">{g.oldOn}</span>}
              </div>
              <div className="relative h-3.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div className="absolute inset-y-0 left-0 rounded-full bg-faint/30"
                  style={{ width: `${(g.old! / hi) * 100}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
                  style={{
                    width: `${(g.neu! / hi) * 100}%`,
                    background: up ? "rgb(var(--c-ok))" : "rgb(var(--c-danger))",
                    opacity: 0.8,
                  }} />
              </div>
              <div className="w-20 shrink-0 text-[11px] tabular-nums font-semibold">
                {g.neu}
                {g.newOn && <span className="ml-1 text-[10px] text-muted">{g.newOn}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Evidence table ──────────────────────────────────────────────────── */
function EvidenceTable({ a }: { a: AnomalyOut }) {
  if (!a.evidence.length) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[11.5px] text-muted hover:text-fg transition-colors">
        Source rows ({a.evidence.length})
      </summary>
      <div className="mt-1.5 overflow-x-auto rounded border border-border">
        <table className="cm-table">
          <thead>
            <tr>
              <th>Source document</th><th>Figure</th><th>Value</th><th>As of</th>
            </tr>
          </thead>
          <tbody>
            {a.evidence.map((e, i) => (
              <tr key={i}>
                <td>{e.filename ?? "—"}{e.page_no ? <span className="text-faint">, p.{e.page_no}</span> : ""}</td>
                <td className="text-muted">{e.field_key ? e.field_key.replace(/_/g, " ") : "—"}</td>
                <td className="tabular-nums">{e.value ?? "—"}</td>
                <td className="text-muted">{e.as_on ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/* ── Anomaly card ────────────────────────────────────────────────────── */
function AnomalyCard({ a }: { a: AnomalyOut }) {
  const qc = useQueryClient();
  const [note, setNote] = useState(a.note ?? "");
  const review = useMutation({
    mutationFn: (status: AnomalyStatusT) => api.reviewAnomaly(a.id, status, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["anomalies"] }),
  });
  const terminal = a.status === "resolved" || a.status === "dismissed";

  return (
    <div className="cm-card overflow-hidden">
      <div className={`flex items-start gap-3 border-b border-border px-4 py-3 ${
        a.severity === "high" ? "bg-danger-lt/20" : a.severity === "medium" ? "bg-warn-lt/20" : ""
      }`}>
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${SEV_DOT[a.severity]}`} title={`${a.severity} severity`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`pill border text-[10.5px] ${SEV_BADGE[a.severity]}`}>
              {a.severity} severity
            </span>
            <span className="pill bg-surface-2 text-muted border-border text-[10.5px]">
              {KIND_LABEL[a.kind] ?? a.kind}
            </span>
            <span className="text-[11px] capitalize text-faint">{a.status}</span>
          </div>
          <h3 className="mt-1.5 text-[13px] font-semibold">{a.title}</h3>
          <p className="mt-0.5 text-[12px] text-muted leading-relaxed">{a.detail}</p>
        </div>
        {a.reviewed_at && (
          <div className="shrink-0 text-[10.5px] text-faint text-right">
            <div>Reviewed</div>
            <div>{new Date(a.reviewed_at).toLocaleDateString()}</div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        <CompareBars a={a} />
        <EvidenceTable a={a} />

        {!terminal && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)…"
              className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            {a.status !== "acknowledged" && (
              <Btn size="xs" variant="ghost" disabled={review.isPending} onClick={() => review.mutate("acknowledged")}>
                Acknowledge
              </Btn>
            )}
            <Btn size="xs" variant="secondary" disabled={review.isPending} onClick={() => review.mutate("resolved")}
              className="border-ok/40 text-ok hover:bg-ok-lt">
              ✓ Resolve
            </Btn>
            <Btn size="xs" variant="ghost" disabled={review.isPending} onClick={() => review.mutate("dismissed")}>
              Dismiss
            </Btn>
          </div>
        )}
        {terminal && a.note && (
          <div className="flex items-start gap-2 rounded-md bg-surface-2 px-3 py-2 text-[12px] text-muted">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {a.note}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sidebar stats ───────────────────────────────────────────────────── */
function AnomalyStats({ items }: { items: AnomalyOut[] }) {
  const byKind = items.reduce<Record<string, number>>((a, x) => { a[x.kind] = (a[x.kind] ?? 0) + 1; return a; }, {});
  const bySev  = items.reduce<Record<string, number>>((a, x) => { a[x.severity] = (a[x.severity] ?? 0) + 1; return a; }, {});

  const matrixData = Object.entries(byKind).map(([kind]) => ({
    label:  KIND_LABEL[kind] ?? kind,
    high:   items.filter((a) => a.kind === kind && a.severity === "high").length,
    medium: items.filter((a) => a.kind === kind && a.severity === "medium").length,
    low:    items.filter((a) => a.kind === kind && a.severity === "low").length,
  })).filter((r) => r.high + r.medium + r.low > 0);

  return (
    <div className="space-y-4">
      <Panel title="By type" hint="all anomalies ever detected">
        <BarList
          data={Object.entries(byKind).sort((a, b) => b[1] - a[1])
            .map(([k, v]) => ({ label: KIND_LABEL[k] ?? k, value: v }))}
        />
      </Panel>

      <Panel title="By severity">
        <BarList
          data={(["high", "medium", "low"] as const)
            .map((s) => ({
              label: s[0].toUpperCase() + s.slice(1),
              value: bySev[s] ?? 0,
              color: s === "high" ? "rgb(var(--c-danger))" : s === "medium" ? "rgb(var(--c-warn))" : "rgb(var(--c-faint))",
            }))
            .filter((d) => d.value > 0)}
        />
      </Panel>

      {matrixData.length > 0 && (
        <Panel title="Severity matrix" hint="kind × severity heatmap">
          <SeverityMatrix data={matrixData} />
        </Panel>
      )}

      <Panel title="What the kinds mean">
        <ul className="space-y-2">
          {Object.entries(KIND_LABEL).map(([k, v]) => (
            <li key={k} className="text-[12px]">
              <span className="font-semibold text-fg">{v}</span>
              <span className="text-muted"> — </span>
              <span className="text-muted">
                {k === "revision"      && "Same block, later report, different number."}
                {k === "contradiction" && "Two sources, same period, different value."}
                {k === "sum_mismatch"  && "Proved + indicated + inferred ≠ total."}
                {k === "out_of_range"  && "Negative value or percentage over 100."}
                {k === "trend_break"   && "Far outside the entity's own history."}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────── */
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

  const tabs = STATUS_TABS.map((t) => ({
    key: t.key,
    label: t.label,
    count: t.key !== "all" ? count(t.key) : items.length,
  }));

  return (
    <Page>
      <PageHeader
        title="Anomalies"
        actions={
          <Btn variant="secondary" size="sm" onClick={() => scan.mutate()} disabled={scan.isPending}>
            {scan.isPending ? (
              <><svg width="12" height="12" viewBox="0 0 24 24" className="animate-spin" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
              </svg>Checking…</>
            ) : (
              <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>Check again</>
            )}
          </Btn>
        }
      >
        Figures in newer documents that disagree with earlier records for the same mine
        or block — revisions, contradictions, implausible values and outliers. Every row
        links to the source documents.
      </PageHeader>

      <KpiRow>
        <Kpi label="Open" value={count("open")} tone={count("open") ? "warn" : "ok"}
          sub={highOpen > 0 ? `${highOpen} high severity` : "none critical"} onClick={() => setTab("open")} />
        <Kpi label="High severity" value={highOpen} tone={highOpen ? "danger" : "fg"} sub="need immediate attention" />
        <Kpi label="Acknowledged" value={count("acknowledged")} tone="fg" onClick={() => setTab("acknowledged")} />
        <Kpi label="Resolved" value={count("resolved")} tone="ok" sub="closed out" onClick={() => setTab("resolved")} />
        <Kpi label="Dismissed" value={count("dismissed")} tone="fg" onClick={() => setTab("dismissed")} />
        <Kpi label="Total detected" value={items.length} tone="fg" sub="since monitoring began" onClick={() => setTab("all")} />
      </KpiRow>

      {scan.data && (
        <div className="flex items-center gap-2 rounded-lg border border-ok/30 bg-ok-lt/30 px-4 py-2.5 text-[12.5px]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ok shrink-0">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Scan complete — <strong>{scan.data.detected}</strong> found ({<strong>{scan.data.created}</strong>} new),{" "}
          <strong>{scan.data.auto_resolved}</strong> auto-resolved.
        </div>
      )}

      <Grid>
        <Col span={8} className="space-y-3">
          <TabBar tabs={tabs} active={tab} onChange={setTab} />

          {all.isLoading && <SkeletonRows rows={3} />}
          {all.isError && (
            <div className="cm-card p-6 text-center text-[12.5px] text-danger">Couldn't load anomalies.</div>
          )}
          {all.data && shown.length === 0 && (
            <div className="cm-card p-10 text-center">
              <div className="text-[28px] mb-2">{tab === "open" && items.length > 0 ? "✓" : "○"}</div>
              <div className="text-[13px] font-medium">
                {tab === "open" && items.length > 0 ? "Everything reviewed" : "Nothing here yet"}
              </div>
              <div className="text-[12px] text-muted mt-1">
                {tab === "open" && items.length > 0
                  ? "Check other tabs for acknowledged or resolved items."
                  : "Once two or more documents cover the same mine, click Check again."}
              </div>
            </div>
          )}
          {shown.map((a) => <AnomalyCard key={a.id} a={a} />)}
        </Col>

        <Col span={4}>
          {all.data
            ? <AnomalyStats items={items} />
            : <div className="space-y-4">{[1,2,3].map((i) => <div key={i} className="shimmer h-32 rounded-lg" />)}</div>
          }
        </Col>
      </Grid>
    </Page>
  );
}
