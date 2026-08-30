import { Link } from "react-router-dom";
import type { AdminOverview } from "@/lib/types";

function sum(rec: Record<string, number> | undefined): number {
  return Object.values(rec ?? {}).reduce((a, b) => a + b, 0);
}

export function PipelineFlow({ o }: { o: AdminOverview | undefined }) {
  const fieldsTotal = sum(o?.fields_by_status);
  const confirmed =
    (o?.fields_by_status?.auto_accepted ?? 0) + (o?.fields_by_status?.verified ?? 0);
  const outputs = sum(o?.reports_by_status) + (o?.qa_by_status?.verified ?? 0);

  const steps = [
    {
      label: "Documents",
      value: sum(o?.documents_by_status) || "—",
      sub: "uploaded",
      color: "rgb(var(--k-1))",
      to: "/ingestion",
    },
    {
      label: "Values found",
      value: fieldsTotal || "—",
      sub: "extracted from text",
      color: "rgb(var(--k-2))",
      to: "/ingestion",
    },
    {
      label: "Confirmed",
      value: confirmed || "—",
      sub: `${o?.review_queue ?? 0} pending review`,
      color: "rgb(var(--k-6))",
      to: "/ingestion",
    },
    {
      label: "In graph",
      value: o?.kg_entities ?? "—",
      sub: `${o?.kg_relations ?? 0} links`,
      color: "rgb(var(--k-4))",
      to: "/knowledge",
    },
    {
      label: "Outputs",
      value: outputs || "—",
      sub: "reports & answers",
      color: "rgb(var(--k-3))",
      to: "/reports",
    },
  ];

  return (
    <div className="cm-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[13px] font-semibold">Document pipeline</h2>
            <p className="mt-0.5 text-[11px] text-muted">
              Every file flows left → right. Nothing uncertain passes Confirmed without a person.
            </p>
          </div>
          <Link to="/ingestion" className="text-[11px] text-brand hover:underline">
            View all →
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
        {steps.map((s) => (
          <Link
            key={s.label}
            to={s.to}
            className="group flex flex-col gap-1 p-3 transition-colors hover:bg-surface-2"
          >
            <span
              className="h-0.5 w-8 rounded-full transition-all duration-150 group-hover:w-full"
              style={{ background: s.color }}
            />
            <span
              className="metric-lg tabular-nums mt-1.5"
              style={{ color: s.color }}
            >
              {s.value}
            </span>
            <span className="text-[12px] font-medium text-fg">{s.label}</span>
            <span className="text-[11px] text-muted">{s.sub}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
