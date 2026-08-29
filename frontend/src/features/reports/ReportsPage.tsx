import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReportT } from "@/lib/types";
import { reportTemplateLabel, statusLabel } from "@/lib/labels";
import { BarList, Panel } from "@/components/charts";
import { Card, EmptyState, StatusPill } from "@/components/primitives";
import { Col, Grid, Kpi, KpiRow, Page, PageHeader } from "@/components/layout";
import { NewReportForm } from "./NewReportForm";
import { ReportView } from "./ReportView";

function Landing({ onPick }: { onPick: (id: string) => void }) {
  const templates = useQuery({ queryKey: ["report-templates"], queryFn: api.reportTemplates });
  const reports = useQuery({ queryKey: ["reports"], queryFn: () => api.listReports() });
  const items = reports.data?.items ?? [];
  const byStatus = items.reduce<Record<string, number>>((a, r) => {
    a[r.status] = (a[r.status] ?? 0) + 1;
    return a;
  }, {});

  return (
    <div className="space-y-4">
      <KpiRow>
        <Kpi label="Total reports" value={items.length} />
        <Kpi label="Draft" value={byStatus.draft ?? 0} tone="warn" />
        <Kpi label="In review" value={byStatus.in_review ?? 0} tone="warn" />
        <Kpi label="Finalised" value={byStatus.final ?? 0} tone="ok" />
        <Kpi label="Report types" value={templates.data?.length ?? 0} />
        <Kpi
          label="Cited figures"
          value="every"
          sub="footnoted to a source page"
        />
      </KpiRow>

      <Panel title="Pick a report type" hint="each is filled from the confirmed facts in your documents">
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.data?.map((t) => (
            <div key={t.key} className="rounded-lg border border-border bg-surface p-3">
              <div className="text-sm font-medium">{t.title}</div>
              <p className="mt-1 text-xs text-muted">{t.description}</p>
            </div>
          ))}
        </div>
      </Panel>

      {items.length > 0 && (
        <Grid>
          <Col span={4}>
            <Panel title="Reports by status">
              <BarList
                data={Object.entries(byStatus)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => ({ label: statusLabel(k), value: v }))}
              />
            </Panel>
          </Col>
          <Col span={8}>
            <Panel title="Recent reports">
              <ul className="divide-y divide-border/60">
                {items.slice(0, 8).map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => onPick(r.id)}
                      className="flex w-full items-center gap-3 px-1 py-2 text-left text-sm hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1 truncate">{r.title}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {reportTemplateLabel(r.template_key)}
                      </span>
                      <StatusPill status={r.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          </Col>
        </Grid>
      )}
    </div>
  );
}

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
        Choose a report type, fill in a few details, and the system drafts it from the
        facts already extracted from your documents. Every figure is footnoted to its
        source page. A report can&rsquo;t be finalised while any figure it uses is still
        unconfirmed, and each edit is kept as its own version.
      </PageHeader>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[19rem,1fr]">
        <div className="space-y-4">
          <NewReportForm onCreated={(r) => setSelected(r.id)} />
          <Card>
            <div className="border-b border-border px-4 py-2 text-sm font-semibold">
              Reports {data ? `(${data.total})` : ""}
            </div>
            {data && data.items.length === 0 && (
              <EmptyState>No reports yet — create one above.</EmptyState>
            )}
            <ul className="max-h-[60vh] overflow-auto">
              {data?.items.map((r: ReportT) => (
                <li
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className={`cursor-pointer border-b border-border/60 px-4 py-2 text-sm last:border-0 hover:bg-surface-2 ${
                    selected === r.id ? "bg-surface-2" : ""
                  }`}
                >
                  <div className="truncate font-medium">{r.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                    <StatusPill status={r.status} />
                    <span>{reportTemplateLabel(r.template_key)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="min-w-0">
          {selected ? <ReportView reportId={selected} /> : <Landing onPick={setSelected} />}
        </div>
      </div>
    </Page>
  );
}
