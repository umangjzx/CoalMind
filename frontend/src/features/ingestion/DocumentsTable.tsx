import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DocumentOut } from "@/lib/types";
import { docTypeLabel } from "@/lib/labels";
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
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Documents</h2>
          <span className="text-xs text-muted">{data?.total ?? 0} total</span>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          Select a row to see the values that were extracted and jump to the source page.
        </p>
      </div>
      {isLoading && <EmptyState>Loading…</EmptyState>}
      {isError && (
        <EmptyState>
          Can&rsquo;t reach the backend. Start it with{" "}
          <code className="font-mono">python scripts/dev.py api</code>.
        </EmptyState>
      )}
      {data && data.items.length === 0 && (
        <EmptyState>No documents yet — add some using the panel above.</EmptyState>
      )}
      {data && data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">File</th>
                <th className="px-4 py-2 font-medium">Kind</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Values found</th>
                <th className="px-4 py-2 font-medium">To review</th>
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
                    <td className="px-4 py-2 text-muted">{docTypeLabel(d.doc_type)}</td>
                    <td className="px-4 py-2">
                      <StatusPill status={d.status} />
                      {p.ocr_pages ? (
                        <span
                          className="ml-1 text-[10px] text-muted"
                          title="Some pages were read with optical character recognition"
                        >
                          scanned
                        </span>
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
