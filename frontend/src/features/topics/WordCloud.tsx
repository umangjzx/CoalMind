import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { docTypeLabel } from "@/lib/labels";
import { Card, EmptyState } from "@/components/primitives";

const DOC_TYPES = [
  "geological_reserve_status",
  "monthly_production_mis",
  "parliamentary_qa_response",
  "inspection_report",
  "borehole_log_summary",
  "correspondence",
];

export function WordCloud({
  docType,
  onDocType,
}: {
  docType: string;
  onDocType: (v: string) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["wordcloud", docType],
    queryFn: () => api.wordCloud({ doc_type: docType || undefined }),
  });

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Word cloud</h2>
        <select
          value={docType}
          onChange={(e) => onDocType(e.target.value)}
          className="rounded border border-border bg-bg px-2 py-1 text-xs"
        >
          <option value="">All document types</option>
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {docTypeLabel(t)}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted">
          English, Hindi &amp; spelling variants grouped
        </span>
      </div>
      <div className="p-4">
        {isLoading && <EmptyState>Loading…</EmptyState>}
        {data && data.items.length === 0 && (
          <EmptyState>No terms yet — add and process some documents first.</EmptyState>
        )}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {data?.items.map((w) => (
            <span
              key={w.term}
              title={`${w.count} occurrence${w.count > 1 ? "s" : ""}`}
              className="leading-tight"
              style={{
                fontSize: `${0.8 + w.weight * 1.9}rem`,
                color: `rgb(var(--c-fg) / ${0.45 + w.weight * 0.55})`,
                fontWeight: w.weight > 0.6 ? 600 : 400,
              }}
            >
              {w.term}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
