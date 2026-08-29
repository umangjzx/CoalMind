import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { FieldOut } from "@/lib/types";
import { ConfidenceBar, StatusPill } from "@/components/primitives";

function FieldLine({ f }: { f: FieldOut }) {
  return (
    <div className="border-b border-border/60 py-2 last:border-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{f.label || f.field_key}</span>
        <ConfidenceBar value={f.confidence} />
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-sm">
        <span className="rounded bg-surface-2 px-1.5 py-0.5">{f.value_text || "—"}</span>
        <StatusPill status={f.status} />
        {f.value_json?.unit ? (
          <span className="text-xs text-muted">{String(f.value_json.unit)}</span>
        ) : null}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-muted">
        {f.field_key} · {f.extractor}
        {f.page_no ? ` · p.${f.page_no}` : ""}
        {f.source_kind === "ocr" ? " · OCR" : ""}
      </div>
      {f.source_snippet && (
        <div className="mt-1 rounded bg-surface-2 px-2 py-1 font-mono text-[11px] text-muted">
          …{f.source_snippet}…
        </div>
      )}
    </div>
  );
}

export function DocumentDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: () => api.getDocument(id),
    refetchInterval: 4000,
  });

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto border-l border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">{data?.original_filename ?? "…"}</h2>
            {data && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <StatusPill status={data.status} />
                <span>{data.doc_type?.replace(/_/g, " ") ?? "unclassified"}</span>
                <span>· {data.page_count ?? "?"} pp</span>
                <span>· {data.language ?? "?"}</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2"
          >
            Close
          </button>
        </div>

        {data && (
          <div className="mt-3 flex gap-2">
            <a
              className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2"
              href={api.documentFileUrl(data.id)}
              target="_blank"
              rel="noreferrer"
            >
              Open source file
            </a>
            <button
              className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2"
              onClick={() => api.reprocess(data.id)}
            >
              Re-process
            </button>
          </div>
        )}

        {data?.error && (
          <div className="mt-3 rounded bg-danger/10 px-3 py-2 text-xs text-danger">
            {data.error}
          </div>
        )}
        {data?.meta?.pipeline?.doc_notes?.length ? (
          <ul className="mt-3 list-disc rounded bg-warn/10 px-5 py-2 text-xs text-warn">
            {data.meta.pipeline.doc_notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        ) : null}

        <h3 className="mt-4 text-sm font-semibold">
          Extracted fields {data ? `(${data.fields.length})` : ""}
        </h3>
        {isLoading && <div className="py-4 text-sm text-muted">Loading…</div>}
        <div className="mt-1">
          {data?.fields.map((f) => <FieldLine key={f.id} f={f} />)}
        </div>
      </div>
    </div>
  );
}
