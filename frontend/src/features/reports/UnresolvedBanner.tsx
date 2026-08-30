import { Link } from "react-router-dom";
import type { ReportUnresolved } from "@/lib/types";

/** A report can't be finalised while any figure it uses is still unconfirmed.
 *  Each item links back to the review queue where it's cleared. */
export function UnresolvedBanner({ items }: { items: ReportUnresolved[] }) {
  if (!items.length) return null;
  const n = items.length;

  return (
    <div className="rounded-lg border border-warn/40 bg-warn-lt/50 p-3">
      <div className="flex items-start gap-2.5">
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" className="mt-0.5 shrink-0 text-warn"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-warn">
            {n} figure{n === 1 ? "" : "s"} still unconfirmed — finalising is blocked
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted">
            Confirm {n === 1 ? "it" : "them"} in{" "}
            <Link to="/ingestion" className="font-medium text-brand hover:underline">
              Upload &amp; Review
            </Link>
            , then regenerate the draft.
          </p>
          <ul className="mt-1.5 space-y-1">
            {items.map((x) => (
              <li key={x.extraction_field_id} className="flex items-center gap-2 text-[11.5px]">
                <span className="h-1 w-1 shrink-0 rounded-full bg-warn" />
                <span className="min-w-0 truncate">
                  <span className="font-medium">{x.label}</span>
                  <span className="text-muted"> — {x.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
