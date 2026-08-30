import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReportT } from "@/lib/types";
import { reportTemplateLabel, shortDate } from "@/lib/labels";
import { EmptyState, SkeletonRows, StatusPill } from "@/components/primitives";
import { Page, PageHeader } from "@/components/layout";
import { NewReportForm } from "./NewReportForm";
import { ReportView } from "./ReportView";

/* ── How a report is built — slim horizontal strip ──────────────────── */
const STEPS = [
  { head: "Pick a type", body: "Reserve status, MIS, Parliament Q&A, ad-hoc." },
  { head: "Facts from the graph", body: "Every figure comes from a confirmed extraction, footnoted [n]." },
  { head: "Confirm to finalise", body: "Low-confidence figures keep the draft open until checked." },
  { head: "Export", body: "PDF / DOCX / HTML with the full source list." },
];

function HowItWorks() {
  return (
    <div className="cm-card grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
      {STEPS.map((s, i) => (
        <div key={s.head} className="p-3">
          <div className="flex items-center gap-2">
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand-lt text-[9px] font-bold text-brand">
              {i + 1}
            </span>
            <span className="text-[12px] font-semibold">{s.head}</span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted">{s.body}</p>
        </div>
      ))}
    </div>
  );
}

/* ── Template tile ─────────────────────────────────────────────────── */
function TemplateTile({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-start gap-3 rounded-lg border border-border bg-surface p-3.5 text-left transition-all hover:border-brand hover:shadow-sm"
    >
      <span className="mt-0.5 shrink-0 rounded-md bg-brand-lt p-1.5 text-brand">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold group-hover:text-brand">{title}</span>
        <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{description}</span>
      </span>
      <svg
        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        className="mt-1 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}

/* ── Reports table ─────────────────────────────────────────────────── */
function ReportsTable({ items, onOpen }: { items: ReportT[]; onOpen: (id: string) => void }) {
  return (
    <div className="cm-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="cm-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Status</th>
              <th className="text-right">Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r.id)} className="cursor-pointer">
                <td className="max-w-[320px]">
                  <span className="block truncate text-[12.5px] font-medium">{r.title}</span>
                </td>
                <td className="text-muted">{reportTemplateLabel(r.template_key)}</td>
                <td><StatusPill status={r.status} /></td>
                <td className="text-right tabular-nums text-muted">{shortDate(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Landing (no report selected) ──────────────────────────────────── */
function Landing({ onOpen }: { onOpen: (id: string) => void }) {
  const templates = useQuery({ queryKey: ["report-templates"], queryFn: api.reportTemplates });
  const reports = useQuery({ queryKey: ["reports"], queryFn: () => api.listReports() });
  const items = reports.data?.items ?? [];
  const [chosen, setChosen] = useState<string | null>(null);

  const byStatus = items.reduce<Record<string, number>>((a, r) => {
    a[r.status] = (a[r.status] ?? 0) + 1;
    return a;
  }, {});
  const stats = [
    { label: "Total", value: items.length, tone: "text-fg" },
    { label: "Draft", value: byStatus.draft ?? 0, tone: "text-warn" },
    { label: "In review", value: byStatus.in_review ?? 0, tone: "text-brand" },
    { label: "Finalised", value: byStatus.final ?? 0, tone: "text-ok" },
  ];

  return (
    <div className="space-y-5">
      {/* compact stat strip */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-lg border border-border bg-surface px-4 py-2.5">
        {stats.map((s) => (
          <div key={s.label} className="flex items-baseline gap-1.5">
            <span className={`text-[16px] font-bold tabular-nums ${s.tone}`}>{s.value}</span>
            <span className="text-[11px] text-muted">{s.label}</span>
          </div>
        ))}
      </div>

      {/* start a new report */}
      <section className="space-y-2.5">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-muted">
          Start a new report
        </h2>
        {chosen ? (
          <NewReportForm
            templateKey={chosen}
            onBack={() => setChosen(null)}
            onCreated={(r) => onOpen(r.id)}
          />
        ) : templates.isLoading ? (
          <div className="cm-card p-3">
            <SkeletonRows rows={2} />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.data?.map((t) => (
              <TemplateTile
                key={t.key}
                title={t.title}
                description={t.description}
                onClick={() => setChosen(t.key)}
              />
            ))}
          </div>
        )}
      </section>

      {/* your reports */}
      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-muted">
            Your reports
          </h2>
          {items.length > 0 && (
            <span className="text-[11px] text-faint">click a row to open</span>
          )}
        </div>
        {!reports.data ? (
          <div className="cm-card p-3">
            <SkeletonRows rows={3} />
          </div>
        ) : items.length === 0 ? (
          <div className="cm-card">
            <EmptyState
              icon={
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              }
            >
              No reports yet — pick a type above to draft your first one.
            </EmptyState>
          </div>
        ) : (
          <ReportsTable items={items} onOpen={onOpen} />
        )}
      </section>

      {/* how it works */}
      <section className="space-y-2.5">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-muted">
          How a report is built
        </h2>
        <HowItWorks />
      </section>
    </div>
  );
}

/* ── Main ──────────────────────────────────────────────────────────── */
export function ReportsPage() {
  const [selected, setSelected] = useState<string | null>(null);
  useQuery({ queryKey: ["reports"], queryFn: () => api.listReports(), refetchInterval: 8000 });

  return (
    <Page>
      <PageHeader title="Report Builder">
        Choose a report type, fill in a few details, and the system drafts it from confirmed
        facts. Every figure is footnoted to its source page. A report can&rsquo;t be finalised
        while any figure it uses is still unconfirmed.
      </PageHeader>

      {selected ? (
        <div className="space-y-3">
          <button
            onClick={() => setSelected(null)}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand hover:underline"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            All reports
          </button>
          <ReportView reportId={selected} />
        </div>
      ) : (
        <Landing onOpen={setSelected} />
      )}
    </Page>
  );
}
