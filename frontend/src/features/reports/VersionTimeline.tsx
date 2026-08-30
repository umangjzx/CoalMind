import type { ReportVersionSummary } from "@/lib/types";
import { relativeTime, shortDateTime } from "@/lib/labels";

/** Append-only draft history. AI renders and officer edits are colour-coded so
 *  an auditor can see exactly what a human changed. */
export function VersionTimeline({
  versions,
  currentNo,
  viewingNo,
  onView,
}: {
  versions: ReportVersionSummary[];
  /** the report's live current_version.version_no */
  currentNo: number;
  /** the version the reader is currently looking at (may be a historical one) */
  viewingNo: number;
  onView: (versionNo: number | null) => void;
}) {
  if (!versions.length) return null;
  const ordered = [...versions].sort((a, b) => b.version_no - a.version_no);

  return (
    <ul className="space-y-0 px-2 py-2">
      {ordered.map((v, i) => {
        const isCurrent = v.version_no === currentNo;
        const isViewing = v.version_no === viewingNo;
        const ai = v.author_kind === "ai";
        return (
          <li key={v.id} className="relative flex gap-2.5 pl-1">
            {/* rail */}
            <div className="flex w-4 shrink-0 flex-col items-center">
              <span
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-surface ${
                  ai ? "bg-brand" : "bg-k-3"
                }`}
              />
              {i < ordered.length - 1 && <span className="w-px flex-1 bg-border" />}
            </div>

            <button
              onClick={() => onView(isCurrent ? null : v.version_no)}
              className={`mb-1 min-w-0 flex-1 rounded-md px-2 py-1.5 text-left transition-colors ${
                isViewing ? "bg-brand-lt/50" : "hover:bg-surface-2"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-semibold">v{v.version_no}</span>
                <span
                  className={`pill text-[9.5px] ${
                    ai ? "bg-brand-lt text-brand" : "bg-warn-lt text-warn"
                  }`}
                >
                  {ai ? "AI" : "Officer"}
                </span>
                {isCurrent && (
                  <span className="pill bg-ok-lt text-ok text-[9.5px]">current</span>
                )}
                {v.unresolved_count > 0 && (
                  <span className="pill bg-danger-lt text-danger text-[9.5px]">
                    {v.unresolved_count} unconfirmed
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[11.5px] text-muted" title={v.summary}>
                {v.summary || (ai ? "AI draft" : "officer edit")}
              </div>
              <div className="text-[10.5px] text-faint" title={shortDateTime(v.created_at)}>
                {relativeTime(v.created_at)}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
