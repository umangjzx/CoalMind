import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReportT } from "@/lib/types";
import { reportTemplateLabel } from "@/lib/labels";
import { Card, EmptyState, StatusPill } from "@/components/primitives";
import { NewReportForm } from "./NewReportForm";
import { ReportView } from "./ReportView";

export function ReportsPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["reports"],
    queryFn: () => api.listReports(),
    refetchInterval: 8000,
  });

  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Report Builder</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Choose a report type, fill in a few details, and the system drafts it from the
          facts already extracted from your documents. Every figure is footnoted to its
          source page. A report can&rsquo;t be finalised while any figure it uses is still
          unconfirmed, and each edit is kept as its own version.
        </p>
      </header>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[20rem,1fr]">
        <div className="space-y-4">
          <NewReportForm onCreated={(r) => setSelected(r.id)} />
          <Card>
            <div className="border-b border-border px-4 py-2 text-sm font-semibold">
              Reports {data ? `(${data.total})` : ""}
            </div>
            {data && data.items.length === 0 && (
              <EmptyState>No reports yet — create one above.</EmptyState>
            )}
            <ul>
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
          {selected ? (
            <ReportView reportId={selected} />
          ) : (
            <Card className="p-10 text-center text-sm text-muted">
              Choose a report type on the left to draft one, or pick an existing report
              to view it.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
