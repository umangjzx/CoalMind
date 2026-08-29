import { Link } from "react-router-dom";
import type { AdminOverview } from "@/lib/types";

function sum(rec: Record<string, number> | undefined): number {
  return Object.values(rec ?? {}).reduce((a, b) => a + b, 0);
}

interface Stage {
  label: string;
  value: number;
  sub: string;
  to: string;
  color: string;
}

function StageCard({ s }: { s: Stage }) {
  return (
    <Link
      to={s.to}
      className="group flex min-w-[8.5rem] flex-1 flex-col rounded-xl border border-border bg-surface p-3 transition-colors hover:border-brand"
    >
      <span className="h-1 w-8 rounded-full" style={{ background: s.color }} />
      <span className="mt-2 text-2xl font-semibold tabular-nums leading-none">{s.value}</span>
      <span className="mt-1 text-xs font-medium">{s.label}</span>
      <span className="mt-0.5 text-[11px] text-muted">{s.sub}</span>
    </Link>
  );
}

function Arrow() {
  return (
    <span className="hidden shrink-0 self-center text-border sm:block" aria-hidden>
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path
          d="M4 11h13M12 6l5 5-5 5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** The whole platform in one line: documents flow left-to-right into facts,
 *  reports and answers. Every stage links to the screen that owns it. */
export function PipelineFlow({ o }: { o: AdminOverview | undefined }) {
  const fieldsTotal = sum(o?.fields_by_status);
  const confirmed =
    (o?.fields_by_status?.auto_accepted ?? 0) + (o?.fields_by_status?.verified ?? 0);
  const outputs = sum(o?.reports_by_status) + (o?.qa_by_status?.verified ?? 0);

  const stages: Stage[] = [
    {
      label: "Documents",
      value: sum(o?.documents_by_status),
      sub: "uploaded",
      to: "/ingestion",
      color: "rgb(var(--k-1))",
    },
    {
      label: "Values found",
      value: fieldsTotal,
      sub: "pulled from the text",
      to: "/ingestion",
      color: "rgb(var(--k-2))",
    },
    {
      label: "Confirmed",
      value: confirmed,
      sub: `${o?.review_queue ?? 0} still to review`,
      to: "/ingestion",
      color: "rgb(var(--k-6))",
    },
    {
      label: "In the graph",
      value: o?.kg_entities ?? 0,
      sub: `${o?.kg_relations ?? 0} links`,
      to: "/knowledge",
      color: "rgb(var(--k-4))",
    },
    {
      label: "Used in",
      value: outputs,
      sub: "reports & saved answers",
      to: "/reports",
      color: "rgb(var(--k-3))",
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface-2/50 p-4">
      <h2 className="text-sm font-semibold">How a document becomes an answer</h2>
      <p className="mt-0.5 text-xs text-muted">
        Every file moves left to right. Nothing uncertain passes the “Confirmed” step
        without a person.
      </p>
      <div className="mt-3 flex flex-col gap-2 overflow-x-auto sm:flex-row sm:items-stretch">
        {stages.map((s, i) => (
          <div key={s.label} className="flex flex-1 gap-2">
            <StageCard s={s} />
            {i < stages.length - 1 && <Arrow />}
          </div>
        ))}
      </div>
    </div>
  );
}
