import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DocumentOut } from "@/lib/types";
import { docTypeLabel } from "@/lib/labels";
import { Card, CardHeader, EmptyState, SkeletonRows, StatusPill } from "@/components/primitives";

export function DocumentsTable({
  onSelect,
  selectedId,
}: {
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["documents"],
    queryFn: () => api.listDocuments({ limit: 100 }),
    refetchInterval: 4000,
  });

  return (
    <Card padding={false}>
      <CardHeader
        title="Documents"
        subtitle="Select a row to see extracted values and source pages"
        right={
          <span className="pill bg-surface-2 text-muted">
            {data?.total ?? 0} total
          </span>
        }
      />

      {isLoading && <SkeletonRows rows={6} />}
      {isError && (
        <EmptyState>
          Can't reach the backend. Start it with{" "}
          <code className="font-mono text-[11px]">python scripts/dev.py api</code>.
        </EmptyState>
      )}
      {data && data.items.length === 0 && (
        <EmptyState
          icon={
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
          }
        >
          No documents yet — add some using the upload area above.
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="cm-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Kind</th>
                <th>Status</th>
                <th className="text-right">Values</th>
                <th className="text-right">To review</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((d: DocumentOut) => {
                const p = d.meta?.pipeline ?? {};
                const hasReview = (p.fields_needs_review ?? 0) > 0;
                return (
                  <tr
                    key={d.id}
                    onClick={() => onSelect(d.id)}
                    className={`cursor-pointer ${selectedId === d.id ? "bg-brand-lt/40" : ""}`}
                  >
                    <td className="max-w-[200px]">
                      <span className="block truncate text-[12.5px] font-medium" title={d.original_filename}>
                        {d.original_filename}
                      </span>
                      {p.ocr_pages ? (
                        <span className="text-[10.5px] text-muted">OCR scan</span>
                      ) : null}
                    </td>
                    <td className="text-muted">{docTypeLabel(d.doc_type)}</td>
                    <td><StatusPill status={d.status} /></td>
                    <td className="text-right tabular-nums text-muted">
                      {p.fields_extracted ?? "—"}
                    </td>
                    <td className="text-right tabular-nums">
                      {hasReview ? (
                        <span className="font-semibold text-warn">{p.fields_needs_review}</span>
                      ) : (
                        <span className="text-ok text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
