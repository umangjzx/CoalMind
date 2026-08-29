import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DocumentOut } from "@/lib/types";
import { Card, EmptyState, StatusPill } from "@/components/primitives";

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
    refetchInterval: 4000, // reflect pipeline progress
  });

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Documents</h2>
        <span className="text-xs text-muted">{data?.total ?? 0} total</span>
      </div>
      {isLoading && <EmptyState>Loading…</EmptyState>}
      {isError && <EmptyState>Could not reach the backend.</EmptyState>}
      {data && data.items.length === 0 && <EmptyState>No documents yet — upload some above.</EmptyState>}
      {data && data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">File</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Fields</th>
                <th className="px-4 py-2 font-medium">Review</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((d: DocumentOut) => {
                const p = d.meta?.pipeline ?? {};
                return (
                  <tr
                    key={d.id}
                    onClick={() => onSelect(d.id)}
                    className={`cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-2 ${
                      selectedId === d.id ? "bg-surface-2" : ""
                    }`}
                  >
                    <td className="max-w-[14rem] truncate px-4 py-2" title={d.original_filename}>
                      {d.original_filename}
                    </td>
                    <td className="px-4 py-2 text-muted">
                      {d.doc_type ? d.doc_type.replace(/_/g, " ") : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <StatusPill status={d.status} />
                      {p.ocr_pages ? (
                        <span className="ml-1 text-[10px] text-muted">OCR</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-muted">
                      {p.fields_extracted ?? "—"}
                    </td>
                    <td className="px-4 py-2 tabular-nums">
                      {p.fields_needs_review ? (
                        <span className="text-warn">{p.fields_needs_review}</span>
                      ) : (
                        <span className="text-muted">0</span>
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
