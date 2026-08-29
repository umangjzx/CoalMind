import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import type { ReportDetailT } from "@/lib/types";
import { Card, StatusPill } from "@/components/primitives";
import { BlockRenderer } from "./BlockRenderer";

function UnresolvedBanner({ report }: { report: ReportDetailT }) {
  const u = report.current_version?.unresolved ?? [];
  if (!u.length) return null;
  return (
    <div className="rounded border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
      <b>{u.length} bound field(s) still need verification</b> — finalisation is blocked
      until an officer confirms these in the{" "}
      <Link to="/ingestion" className="underline">
        review queue
      </Link>
      .
      <ul className="mt-1 list-disc pl-5">
        {u.map((x) => (
          <li key={x.extraction_field_id}>
            {x.label} — {x.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DiffView({ reportId, versions }: { reportId: string; versions: ReportDetailT["versions"] }) {
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(versions.length);
  const { data } = useQuery({
    queryKey: ["report-diff", reportId, from, to],
    queryFn: () => api.reportDiff(reportId, from, to),
    enabled: from !== to,
  });
  if (versions.length < 2) return null;
  return (
    <details className="rounded border border-border p-2 text-xs">
      <summary className="cursor-pointer font-medium">Compare versions (AI vs human)</summary>
      <div className="mt-2 flex items-center gap-2">
        <select value={from} onChange={(e) => setFrom(Number(e.target.value))} className="rounded border border-border bg-bg px-1">
          {versions.map((v) => (
            <option key={v.id} value={v.version_no}>
              v{v.version_no} ({v.author_kind})
            </option>
          ))}
        </select>
        <span>→</span>
        <select value={to} onChange={(e) => setTo(Number(e.target.value))} className="rounded border border-border bg-bg px-1">
          {versions.map((v) => (
            <option key={v.id} value={v.version_no}>
              v{v.version_no} ({v.author_kind})
            </option>
          ))}
        </select>
      </div>
      {data && (
        <pre className="mt-2 max-h-64 overflow-auto rounded bg-surface-2 p-2 font-mono text-[11px]">
          {data.unified.split("\n").map((line, i) => (
            <div
              key={i}
              className={
                line.startsWith("+") && !line.startsWith("+++")
                  ? "text-ok"
                  : line.startsWith("-") && !line.startsWith("---")
                    ? "text-danger"
                    : ""
              }
            >
              {line || " "}
            </div>
          ))}
        </pre>
      )}
    </details>
  );
}

export function ReportView({ reportId }: { reportId: string }) {
  const qc = useQueryClient();
  const { data: report, isLoading } = useQuery({
    queryKey: ["report", reportId],
    queryFn: () => api.getReport(reportId),
    refetchInterval: 6000,
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["report", reportId] });
    qc.invalidateQueries({ queryKey: ["reports"] });
    setEditing(false);
  };
  const rerender = useMutation({ mutationFn: () => api.rerenderReport(reportId), onSuccess: invalidate });
  const finalize = useMutation({ mutationFn: () => api.finalizeReport(reportId), onSuccess: invalidate });
  const saveEdit = useMutation({
    mutationFn: () => api.editReport(reportId, draft, "officer edit"),
    onSuccess: invalidate,
  });

  if (isLoading) return <Card className="p-6 text-sm text-muted">Loading…</Card>;
  if (!report) return <Card className="p-6 text-sm text-danger">Report not found.</Card>;

  const v = report.current_version;
  const isFinal = report.status === "final";

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{report.title}</h2>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            <StatusPill status={report.status} />
            <span>{report.template_key.replace(/_/g, " ")}</span>
            {v && <span>· v{v.version_no} ({v.author_kind})</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isFinal && (
            <>
              <button
                onClick={() => rerender.mutate()}
                disabled={rerender.isPending}
                className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2"
              >
                Re-render
              </button>
              <button
                onClick={() => {
                  setDraft(v?.content_md ?? "");
                  setEditing(true);
                }}
                className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2"
              >
                Edit
              </button>
              <button
                onClick={() => finalize.mutate()}
                disabled={finalize.isPending || (v?.unresolved.length ?? 0) > 0}
                className="rounded bg-brand px-2 py-1 text-xs text-brand-fg disabled:opacity-50"
                title={(v?.unresolved.length ?? 0) > 0 ? "resolve flagged fields first" : ""}
              >
                Finalise
              </button>
            </>
          )}
          <a className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2"
             href={api.reportExportUrl(reportId, "pdf")} target="_blank" rel="noreferrer">PDF</a>
          <a className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2"
             href={api.reportExportUrl(reportId, "docx")} target="_blank" rel="noreferrer">DOCX</a>
        </div>
      </div>

      {finalize.isError && (
        <div className="mt-3 rounded bg-danger/10 p-2 text-xs text-danger">
          {(finalize.error as Error).message}
        </div>
      )}

      <div className="mt-4 space-y-3">
        <UnresolvedBanner report={report} />

        {editing ? (
          <div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={18}
              className="w-full rounded border border-border bg-bg p-2 font-mono text-xs"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => saveEdit.mutate()}
                disabled={saveEdit.isPending}
                className="rounded bg-brand px-3 py-1 text-xs text-brand-fg disabled:opacity-50"
              >
                Save as new version
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded border border-border px-3 py-1 text-xs hover:bg-surface-2"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          v && (
            <article className="rounded border border-border bg-surface p-4">
              <BlockRenderer blocks={v.blocks} citations={v.citations} />
              {v.citations.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Sources
                  </h3>
                  <ol className="mt-1 space-y-0.5 text-xs text-muted">
                    {v.citations.map((c) => (
                      <li key={c.marker}>
                        [{c.marker}] {c.document_filename ?? c.document_id}
                        {c.page_no ? `, p.${c.page_no}` : ""} — “{c.snippet}” · confidence{" "}
                        {Math.round(c.confidence * 100)}%
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </article>
          )
        )}

        <DiffView reportId={reportId} versions={report.versions} />
      </div>
    </Card>
  );
}
