import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function TopicDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["topic", id],
    queryFn: () => api.topicDetail(id),
  });

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-muted">
              topic · {data?.engine}
            </div>
            <h2 className="text-base font-semibold">{data?.label ?? "…"}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2"
          >
            Close
          </button>
        </div>

        {isLoading && <div className="mt-4 text-sm text-muted">Loading…</div>}
        {data && (
          <>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.terms.map((t) => (
                <span
                  key={t.term}
                  className="rounded-full bg-surface-2 px-2 py-0.5 text-xs"
                >
                  {t.term}
                </span>
              ))}
            </div>

            <h3 className="mt-4 text-sm font-semibold">What's driving this</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{data.summary}</p>

            <h3 className="mt-4 text-sm font-semibold">
              Documents ({data.documents.length})
            </h3>
            <ul className="mt-1 space-y-1 text-sm">
              {data.documents.map((d) => (
                <li key={d.document_id} className="rounded bg-surface-2 px-2 py-1">
                  <a
                    className="text-brand hover:underline"
                    href={api.documentFileUrl(d.document_id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {d.filename}
                  </a>
                  <span className="ml-2 text-xs text-muted">
                    {d.doc_type?.replace(/_/g, " ")}
                    {d.doc_date ? ` · ${d.doc_date}` : ""} · weight {d.weight.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
