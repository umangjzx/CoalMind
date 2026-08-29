import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AnomalyOut, AnomalySeverityT, AnomalyStatusT } from "@/lib/types";
import { Card, EmptyState } from "@/components/primitives";

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
          <EvidenceTable a={a} />

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

export function AnomaliesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<AnomalyStatusT | "all">("open");

  const list = useQuery({
    queryKey: ["anomalies", tab],
    queryFn: () => api.anomalies(tab === "all" ? {} : { status: tab }),
  });

  const scan = useMutation({
    mutationFn: () => api.scanAnomalies(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["anomalies"] }),
  });

  return (
    <div className="mx-auto min-w-0 max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Anomalies</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Where a figure in a newer document disagrees with what earlier documents said
            about the same mine or block &mdash; a reserve revised between reports, parts
            that don&rsquo;t add up to their stated total, an impossible value, or a number
            far outside the usual range. Every row links to the documents it came from.
          </p>
        </div>
        <button
          onClick={() => scan.mutate()}
          disabled={scan.isPending}
          className="rounded border border-border px-3 py-1.5 text-xs hover:bg-surface-2 disabled:opacity-50"
        >
          {scan.isPending ? "Checking…" : "Check again"}
        </button>
      </header>

      {scan.data && (
        <div className="rounded border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          Checked — {scan.data.detected} found ({scan.data.created} new),{" "}
          {scan.data.auto_resolved} no longer an issue.
        </div>
      )}

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
          </button>
        ))}
        {list.data && (
          <span className="ml-auto text-xs text-muted">
            {list.data.open_count} open · {list.data.total} total
          </span>
        )}
      </div>

      {list.isLoading && <div className="text-sm text-muted">Loading…</div>}
      {list.isError && (
        <div className="text-sm text-danger">Couldn&rsquo;t load anomalies.</div>
      )}
      {list.data && list.data.items.length === 0 && (
        <EmptyState>
          Nothing here. Once two or more documents cover the same mine or block,
          click <b>Check again</b> to compare their figures.
        </EmptyState>
      )}

      <div className="space-y-3">
        {list.data?.items.map((a) => (
          <AnomalyCard key={a.id} a={a} />
        ))}
      </div>
    </div>
  );
}
