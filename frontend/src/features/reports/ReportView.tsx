import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReportVersionT } from "@/lib/types";
import { authorKindLabel, relativeTime, reportTemplateLabel, shortDateTime } from "@/lib/labels";
import { Card, CardHeader, SkeletonRows, StatusPill } from "@/components/primitives";
import { Btn, TabBar } from "@/components/layout";
import { BlockRenderer } from "./BlockRenderer";
import { SourcesPanel } from "./SourcesPanel";
import { UnresolvedBanner } from "./UnresolvedBanner";
import { VersionTimeline } from "./VersionTimeline";
import { VersionDiff } from "./VersionDiff";
import { mdToBlocks } from "./mdPreview";

type RailTab = "sources" | "history" | "changes" | "info";

/* ── Export menu ─────────────────────────────────────────────────────── */
function ExportMenu({ reportId, versionNo }: { reportId: string; versionNo?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const link = (fmt: "pdf" | "docx" | "html") => api.reportExportUrl(reportId, fmt, versionNo);

  return (
    <div ref={ref} className="relative">
      <Btn size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </Btn>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg">
          {(["pdf", "docx", "html"] as const).map((f) => (
            <a
              key={f}
              href={link(f)}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-3 py-1.5 text-[12px] hover:bg-surface-2"
            >
              <span className="uppercase">{f}</span>
              <span className="text-[10px] text-faint">
                {f === "pdf" ? "print-ready" : f === "docx" ? "Word" : "web"}
              </span>
            </a>
          ))}
          <button
            onClick={() => {
              setOpen(false);
              window.print();
            }}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-1.5 text-left text-[12px] hover:bg-surface-2"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print…
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────── */
export function ReportView({ reportId }: { reportId: string }) {
  const qc = useQueryClient();
  const { data: report, isLoading } = useQuery({
    queryKey: ["report", reportId],
    queryFn: () => api.getReport(reportId),
    refetchInterval: 6000,
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [viewNo, setViewNo] = useState<number | null>(null); // null = current version
  const [rail, setRail] = useState<RailTab>("sources");
  const [flash, setFlash] = useState<string | null>(null);

  // reset transient UI when switching reports
  useEffect(() => {
    setEditing(false);
    setViewNo(null);
    setRail("sources");
    setFlash(null);
  }, [reportId]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(t);
  }, [flash]);

  const invalidate = (msg?: string) => {
    qc.invalidateQueries({ queryKey: ["report", reportId] });
    qc.invalidateQueries({ queryKey: ["reports"] });
    setEditing(false);
    if (msg) setFlash(msg);
  };
  const rerender = useMutation({
    mutationFn: () => api.rerenderReport(reportId),
    onSuccess: () => invalidate("Regenerated from the latest confirmed figures."),
  });
  const finalize = useMutation({
    mutationFn: () => api.finalizeReport(reportId),
    onSuccess: () => invalidate("Report finalised and locked."),
  });
  const saveEdit = useMutation({
    mutationFn: () => api.editReport(reportId, draft, "officer edit"),
    onSuccess: () => invalidate("Saved as a new version."),
  });

  // historical version (only fetched when the reader opens one)
  const histVersion = useQuery({
    queryKey: ["report-version", reportId, viewNo],
    queryFn: () => api.getReportVersion(reportId, viewNo as number),
    enabled: viewNo != null,
  });

  const previewBlocks = useMemo(
    () => (editing ? mdToBlocks(draft) : []),
    [editing, draft],
  );

  if (isLoading) {
    return (
      <Card padding={false}>
        <CardHeader title="Loading report…" />
        <SkeletonRows rows={8} />
      </Card>
    );
  }
  if (!report) {
    return <Card className="p-6 text-[13px] text-danger">Report not found.</Card>;
  }

  const live = report.current_version;
  const isFinal = report.status === "final";
  const unresolved = live?.unresolved ?? [];
  const currentNo = live?.version_no ?? 1;

  // which version's content is on the paper right now
  const shown: ReportVersionT | null =
    viewNo != null ? (histVersion.data ?? null) : (live as ReportVersionT | null);
  const viewingHistorical = viewNo != null && viewNo !== currentNo;

  return (
    <div className="space-y-3">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="no-print sticky top-2 z-20 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold">{report.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
              <StatusPill status={report.status} />
              <span>{reportTemplateLabel(report.template_key)}</span>
              <span className="text-border">·</span>
              <span>
                {report.versions.length} version{report.versions.length === 1 ? "" : "s"}
              </span>
              <span className="text-border">·</span>
              <span title={shortDateTime(report.created_at)}>
                created {relativeTime(report.created_at)}
              </span>
              {isFinal && report.finalized_at && (
                <>
                  <span className="text-border">·</span>
                  <span className="text-ok">finalised {relativeTime(report.finalized_at)}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isFinal && !editing && (
              <>
                <Btn
                  size="sm"
                  variant="secondary"
                  disabled={rerender.isPending}
                  onClick={() => rerender.mutate()}
                  title="Rebuild the draft from the latest confirmed figures (discards manual edits)"
                >
                  {rerender.isPending ? "Regenerating…" : "Regenerate"}
                </Btn>
                <Btn
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setDraft(live?.content_md ?? "");
                    setViewNo(null);
                    setEditing(true);
                  }}
                >
                  Edit
                </Btn>
                <Btn
                  size="sm"
                  variant="primary"
                  disabled={finalize.isPending || unresolved.length > 0}
                  onClick={() => finalize.mutate()}
                  title={unresolved.length > 0 ? "Confirm the unconfirmed figures first" : "Lock this report"}
                >
                  {finalize.isPending ? "Finalising…" : "Finalise"}
                </Btn>
              </>
            )}
            <ExportMenu reportId={reportId} versionNo={viewNo ?? undefined} />
          </div>
        </div>

        {flash && (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-ok-lt px-3 py-1.5 text-[12px] text-ok">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {flash}
          </div>
        )}
        {finalize.isError && (
          <div className="mt-2 rounded-md bg-danger-lt px-3 py-1.5 text-[12px] text-danger">
            {(finalize.error as Error).message}
          </div>
        )}
        {rerender.isError && (
          <div className="mt-2 rounded-md bg-danger-lt px-3 py-1.5 text-[12px] text-danger">
            {(rerender.error as Error).message}
          </div>
        )}
      </div>

      {!editing && <UnresolvedBanner items={unresolved} />}

      {viewingHistorical && (
        <div className="no-print flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand-lt/40 px-3 py-2 text-[12px]">
          <span className="font-medium">
            Viewing v{viewNo} ({authorKindLabel(shown?.author_kind)}) — a past version.
          </span>
          <button
            onClick={() => setViewNo(null)}
            className="font-medium text-brand hover:underline"
          >
            Back to current (v{currentNo})
          </button>
        </div>
      )}

      {/* ── Body: paper + rail ──────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-[1fr_310px]">
        {/* Paper */}
        <div className="min-w-0">
          {editing ? (
            <div className="grid gap-3 xl:grid-cols-2">
              <div className="cm-card flex min-w-0 flex-col p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Markdown
                  </span>
                  <div className="flex gap-2">
                    <Btn
                      size="xs"
                      variant="primary"
                      disabled={saveEdit.isPending || !draft.trim()}
                      onClick={() => saveEdit.mutate()}
                    >
                      {saveEdit.isPending ? "Saving…" : "Save as new version"}
                    </Btn>
                    <Btn size="xs" variant="ghost" onClick={() => setEditing(false)}>
                      Cancel
                    </Btn>
                  </div>
                </div>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={22}
                  spellCheck
                  className="w-full flex-1 resize-none rounded-md border border-border bg-bg p-2.5 font-mono text-[12px] leading-relaxed focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
                <p className="mt-1.5 text-[10.5px] text-faint">
                  Keep the <code className="font-mono">[[c:n]]</code> markers to preserve
                  citations. Headings with <code className="font-mono">#</code>, tables with{" "}
                  <code className="font-mono">|</code>.
                </p>
                {saveEdit.isError && (
                  <p className="mt-1 text-[11px] text-danger">
                    {(saveEdit.error as Error).message}
                  </p>
                )}
              </div>
              <div className="cm-card min-w-0 p-4">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Preview
                </span>
                <BlockRenderer blocks={previewBlocks} citations={live?.citations ?? []} />
              </div>
            </div>
          ) : shown ? (
            <article className="report-paper print-area cm-card mx-auto max-w-[820px] px-8 py-8 sm:px-10">
              <header className="mb-6 border-b border-border pb-4">
                <div className="text-[10.5px] font-semibold uppercase tracking-widest text-muted">
                  {reportTemplateLabel(report.template_key)}
                </div>
                <div className="mt-1 text-[10.5px] text-faint">
                  Generated {shortDateTime(shown.created_at)} · v{shown.version_no} ·{" "}
                  {authorKindLabel(shown.author_kind)}
                  {" · "}CoalMind AI — CMPDI / Coal India Limited
                </div>
              </header>

              <BlockRenderer blocks={shown.blocks} citations={shown.citations} />

              {shown.citations.length > 0 && (
                <footer className="mt-8 border-t border-border pt-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                    Sources
                  </h3>
                  <ol className="mt-2 space-y-1 text-[11px] text-muted">
                    {shown.citations.map((c) => (
                      <li key={c.marker}>
                        <span className="font-semibold text-faint">[{c.marker}]</span>{" "}
                        {c.document_filename ?? c.document_id}
                        {c.page_no ? `, page ${c.page_no}` : ""} — &ldquo;{c.snippet}&rdquo; ·{" "}
                        {Math.round(c.confidence * 100)}% confidence
                      </li>
                    ))}
                  </ol>
                </footer>
              )}
            </article>
          ) : (
            <Card className="p-6 text-[13px] text-muted">This version has no content.</Card>
          )}
        </div>

        {/* Rail */}
        <aside className="no-print min-w-0 space-y-3 lg:sticky lg:top-24 lg:self-start">
          <Card padding={false}>
            <div className="border-b border-border p-1.5">
              <TabBar
                tabs={[
                  { key: "sources", label: "Sources", count: (shown ?? live)?.citations.length },
                  { key: "history", label: "History", count: report.versions.length },
                  { key: "changes", label: "Changes" },
                  { key: "info", label: "Info" },
                ]}
                active={rail}
                onChange={setRail}
              />
            </div>

            {rail === "sources" && (
              <SourcesPanel citations={(shown ?? live)?.citations ?? []} />
            )}
            {rail === "history" && (
              <VersionTimeline
                versions={report.versions}
                currentNo={currentNo}
                viewingNo={viewNo ?? currentNo}
                onView={setViewNo}
              />
            )}
            {rail === "changes" && (
              <VersionDiff reportId={reportId} versions={report.versions} />
            )}
            {rail === "info" && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 p-4 text-[12px]">
                <dt className="text-muted">Template</dt>
                <dd className="font-medium">{reportTemplateLabel(report.template_key)}</dd>
                <dt className="text-muted">Status</dt>
                <dd><StatusPill status={report.status} /></dd>
                <dt className="text-muted">Created</dt>
                <dd className="font-medium">{shortDateTime(report.created_at)}</dd>
                <dt className="text-muted">Current version</dt>
                <dd className="font-medium">
                  v{currentNo} · {authorKindLabel(live?.author_kind)}
                </dd>
                {report.finalized_at && (
                  <>
                    <dt className="text-muted">Finalised</dt>
                    <dd className="font-medium text-ok">{shortDateTime(report.finalized_at)}</dd>
                  </>
                )}
                {Object.entries(report.params).filter(([, v]) => v).length > 0 && (
                  <>
                    <dt className="col-span-2 mt-1 border-t border-border pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                      Parameters
                    </dt>
                    {Object.entries(report.params)
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <Fragment key={k}>
                          <dt className="truncate text-muted">{k.replace(/_/g, " ")}</dt>
                          <dd className="truncate font-mono text-[11px]">{String(v)}</dd>
                        </Fragment>
                      ))}
                  </>
                )}
              </dl>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
