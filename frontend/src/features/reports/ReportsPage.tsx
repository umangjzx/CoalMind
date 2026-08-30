import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReportT } from "@/lib/types";
import { reportTemplateLabel, shortDate } from "@/lib/labels";
import { Donut, Panel } from "@/components/charts";
import { Card, CardHeader, EmptyState, SkeletonRows, StatusPill } from "@/components/primitives";
import { Col, Grid, Kpi, KpiRow, Page, PageHeader } from "@/components/layout";
import { NewReportForm } from "./NewReportForm";
import { ReportView } from "./ReportView";

/* ── How it works steps ──────────────────────────────────────────────── */
const HOW_IT_WORKS = [
  {
    n: "1",
    head: "Pick a type and subject",
    body: "e.g. Reserve Status for Jhanjra Block-II, as on a date.",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
    ),
  },
  {
    n: "2",
    head: "Facts are pulled from the graph",
    body: "Every figure comes from a confirmed extraction, with a [n] footnote.",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="12" r="3"/><circle cx="4" cy="7" r="2"/><circle cx="20" cy="7" r="2"/>
        <line x1="6" y1="7" x2="9" y2="10"/><line x1="18" y1="7" x2="15" y2="10"/>
      </svg>
    ),
  },
  {
    n: "3",
    head: "Low-confidence figures block finalising",
    body: "The draft stays editable until all figures are confirmed in review.",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
  },
  {
    n: "4",
    head: "Export",
    body: "PDF or DOCX with the full source list attached.",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    ),
  },
];

/* ── Report list item ─────────────────────────────────────────────────── */
function ReportListItem({
  r,
  active,
  onClick,
}: {
  r: ReportT;
  active: boolean;
  onClick: () => void;
}) {
  const ago = shortDate(r.created_at);

  return (
    <button
      onClick={onClick}
      className={[
        "w-full border-b border-border/60 px-3 py-2.5 text-left last:border-0 transition-colors",
        active ? "bg-brand-lt/50 border-l-2 border-l-brand pl-[10px]" : "hover:bg-surface-2",
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold">{r.title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
            <StatusPill status={r.status} />
            <span className="truncate">{reportTemplateLabel(r.template_key)}</span>
          </div>
        </div>
        <span className="shrink-0 text-[10.5px] text-faint">{ago}</span>
      </div>
    </button>
  );
}

/* ── Status donut ────────────────────────────────────────────────────── */
function StatusDonut({ items }: { items: ReportT[] }) {
  if (items.length === 0) return null;
  const byStatus = items.reduce<Record<string, number>>((a, r) => {
    a[r.status] = (a[r.status] ?? 0) + 1;
    return a;
  }, {});
  const segments = [
    { label: "Draft",     value: byStatus.draft     ?? 0, color: "rgb(var(--c-warn))"  },
    { label: "In review", value: byStatus.in_review  ?? 0, color: "rgb(var(--c-brand))" },
    { label: "Final",     value: byStatus.final      ?? 0, color: "rgb(var(--c-ok))"    },
  ].filter((s) => s.value > 0);

  return (
    <Panel title="Reports by status" className="h-full">
      <Donut
        segments={segments}
        centerValue={String(items.length)}
        centerLabel="total"
        size={110}
      />
    </Panel>
  );
}

/* ── Landing — shown when no report is selected ──────────────────────── */
function Landing({ onPick }: { onPick: (id: string) => void }) {
  const templates = useQuery({ queryKey: ["report-templates"], queryFn: api.reportTemplates });
  const reports   = useQuery({ queryKey: ["reports"],          queryFn: () => api.listReports() });
  const items     = reports.data?.items ?? [];

  const byStatus = items.reduce<Record<string, number>>((a, r) => {
    a[r.status] = (a[r.status] ?? 0) + 1;
    return a;
  }, {});

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <KpiRow cols={4}>
        <Kpi label="Total reports" value={items.length} tone="fg" />
        <Kpi label="Draft"        value={byStatus.draft     ?? 0} tone="warn" />
        <Kpi label="In review"    value={byStatus.in_review  ?? 0} tone="brand" />
        <Kpi label="Finalised"    value={byStatus.final      ?? 0} tone="ok"   />
      </KpiRow>

      <Grid>
        {/* Report types */}
        <Col span={8}>
          <Panel
            title="Report types"
            hint="each template is filled from the confirmed facts in your documents"
          >
            {templates.isLoading && <SkeletonRows rows={3} />}
            <div className="grid gap-2.5 sm:grid-cols-2">
              {templates.data?.map((t) => (
                <div
                  key={t.key}
                  className="rounded-lg border border-border bg-surface-2/50 p-3 hover:border-brand transition-colors cursor-default"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 rounded bg-brand-lt p-1 text-brand">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </span>
                    <div>
                      <div className="text-[12.5px] font-semibold">{t.title}</div>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted">{t.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </Col>

        {/* How it works + status donut */}
        <Col span={4} className="space-y-4">
          {items.length > 0 && <StatusDonut items={items} />}
          <Panel title="How a report is built">
            <ol className="space-y-3">
              {HOW_IT_WORKS.map(({ n, head, body, icon }) => (
                <li key={n} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-lt text-brand">
                    {icon}
                  </span>
                  <span className="text-[12px]">
                    <span className="font-semibold">{head}</span>
                    <span className="text-muted"> — {body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </Col>
      </Grid>

      {/* Recent reports table */}
      {items.length > 0 && (
        <Panel title="Recent reports" hint="click to open">
          <div className="overflow-x-auto">
            <table className="cm-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 10).map((r) => (
                  <tr key={r.id} onClick={() => onPick(r.id)} className="cursor-pointer">
                    <td className="max-w-[260px]">
                      <span className="truncate block text-[12.5px] font-medium">{r.title}</span>
                    </td>
                    <td className="text-muted">{reportTemplateLabel(r.template_key)}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td className="text-muted tabular-nums">{shortDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────── */
export function ReportsPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["reports"],
    queryFn: () => api.listReports(),
    refetchInterval: 8000,
  });

  return (
    <Page>
      <PageHeader title="Report Builder">
        Choose a report type, fill in a few details, and the system drafts it from
        confirmed facts. Every figure is footnoted to its source page. A report can't be
        finalised while any figure it uses is still unconfirmed.
      </PageHeader>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[220px,1fr]">
        {/* ── Left sidebar: create + list ───────────────────── */}
        <div className="space-y-3 lg:sticky lg:top-3 lg:self-start">
          <NewReportForm onCreated={(r) => setSelected(r.id)} />

          <Card padding={false}>
            <CardHeader
              title="Reports"
              subtitle={data ? `${data.total} total` : ""}
            />
            {!data && <SkeletonRows rows={4} />}
            {data && data.items.length === 0 && (
              <EmptyState>No reports yet — create one above.</EmptyState>
            )}
            <ul className="max-h-[calc(100vh-320px)] overflow-y-auto">
              {data?.items.map((r: ReportT) => (
                <ReportListItem
                  key={r.id}
                  r={r}
                  active={selected === r.id}
                  onClick={() => setSelected(r.id)}
                />
              ))}
            </ul>
          </Card>
        </div>

        {/* ── Main content area ─────────────────────────────── */}
        <div className="min-w-0">
          {selected ? (
            <ReportView reportId={selected} />
          ) : (
            <Landing onPick={setSelected} />
          )}
        </div>
      </div>
    </Page>
  );
}
