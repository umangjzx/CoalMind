import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReportVersionSummary } from "@/lib/types";
import { authorKindLabel } from "@/lib/labels";

/** Side-by-side (unified) diff between any two draft versions — the "what did the
 *  officer change vs. what the AI wrote" provenance view. */
export function VersionDiff({
  reportId,
  versions,
}: {
  reportId: string;
  versions: ReportVersionSummary[];
}) {
  const ordered = [...versions].sort((a, b) => a.version_no - b.version_no);
  const [from, setFrom] = useState(ordered[0]?.version_no ?? 1);
  const [to, setTo] = useState(ordered[ordered.length - 1]?.version_no ?? 1);

  const { data, isFetching } = useQuery({
    queryKey: ["report-diff", reportId, from, to],
    queryFn: () => api.reportDiff(reportId, from, to),
    enabled: from !== to,
  });

  if (versions.length < 2) {
    return (
      <p className="px-4 py-6 text-center text-[12px] text-muted">
        Only one version so far — edit the draft to compare.
      </p>
    );
  }

  const lines = data?.unified.split("\n") ?? [];
  const added = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
  const removed = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;

  const picker = (value: number, onChange: (n: number) => void) => (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-md border border-border bg-bg px-2 py-1 text-[12px] focus:border-brand focus:outline-none"
    >
      {ordered.map((v) => (
        <option key={v.id} value={v.version_no}>
          v{v.version_no} · {authorKindLabel(v.author_kind)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="p-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        {picker(from, setFrom)}
        <span className="text-faint">→</span>
        {picker(to, setTo)}
        {data && (
          <span className="ml-auto flex items-center gap-2 text-[11px]">
            <span className="text-ok">+{added}</span>
            <span className="text-danger">−{removed}</span>
          </span>
        )}
      </div>

      {from === to ? (
        <p className="mt-3 text-[12px] text-muted">Pick two different versions.</p>
      ) : isFetching && !data ? (
        <div className="shimmer mt-3 h-40 rounded" />
      ) : added + removed === 0 ? (
        <p className="mt-3 text-[12px] text-muted">No text changes between these versions.</p>
      ) : (
        <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-border bg-surface-2/50 p-2.5 font-mono text-[11px] leading-relaxed">
          {lines.map((line, i) => {
            const isAdd = line.startsWith("+") && !line.startsWith("+++");
            const isDel = line.startsWith("-") && !line.startsWith("---");
            const isHunk = line.startsWith("@@");
            return (
              <div
                key={i}
                className={
                  isAdd
                    ? "bg-ok/10 text-ok"
                    : isDel
                      ? "bg-danger/10 text-danger"
                      : isHunk
                        ? "text-brand"
                        : "text-muted"
                }
              >
                {line || " "}
              </div>
            );
          })}
        </pre>
      )}
    </div>
  );
}
