import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { KGNeighbor } from "@/lib/types";
import { entityKindLabel, predicateLabel, titleCase } from "@/lib/labels";
import { ConfidenceBar } from "@/components/primitives";

// attribute keys that are plumbing, not information for a reader
const HIDDEN_ATTR = /(_id$|^id$|^normalized_key$|^source_field)/;

function AttrList({ attrs }: { attrs: Record<string, unknown> }) {
  const entries = Object.entries(attrs).filter(
    ([k, v]) => v != null && v !== "" && !HIDDEN_ATTR.test(k),
  );
  if (!entries.length) return null;
  return (
    <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{titleCase(k)}</dt>
          <dd>{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function NeighborRow({ n, onNavigate }: { n: KGNeighbor; onNavigate: (id: string) => void }) {
  return (
    <li className="flex items-center justify-between gap-2 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="min-w-0">
        <span className="text-[11px] text-muted">
          {n.direction === "out" ? predicateLabel(n.predicate) : `${predicateLabel(n.predicate)} of`}
          {n.valid_from ? ` (as of ${n.valid_from})` : ""}
        </span>
        <button
          onClick={() => onNavigate(n.entity.id)}
          className="ml-2 truncate text-left text-brand hover:underline"
        >
          {n.entity.name}
          <span className="ml-1 text-[11px] text-muted">{entityKindLabel(n.entity.kind)}</span>
        </button>
      </span>
      {n.entity.confidence > 0 && <ConfidenceBar value={n.entity.confidence} />}
    </li>
  );
}

export function EntityDrawer({
  id,
  onClose,
  onNavigate,
}: {
  id: string;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["kg-entity", id],
    queryFn: () => api.entityDetail(id),
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
              {data ? entityKindLabel(data.entity.kind) : "…"}
            </div>
            <h2 className="truncate text-base font-semibold">{data?.entity.name ?? "…"}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2"
          >
            Close
          </button>
        </div>

        {data && (
          <>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted">
              {data.entity.confidence > 0 && <ConfidenceBar value={data.entity.confidence} />}
              {data.entity.document_id && (
                <a
                  className="text-brand hover:underline"
                  href={api.documentFileUrl(data.entity.document_id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View source document
                </a>
              )}
            </div>
            <AttrList attrs={data.entity.attrs} />

            <h3 className="mt-4 text-sm font-semibold">
              Connections ({data.neighbors.length})
            </h3>
            <ul className="mt-1">
              {data.neighbors.map((n) => (
                <NeighborRow key={n.relation_id} n={n} onNavigate={onNavigate} />
              ))}
              {data.neighbors.length === 0 && (
                <li className="py-2 text-sm text-muted">Not linked to anything yet.</li>
              )}
            </ul>
          </>
        )}
        {isLoading && <div className="mt-4 text-sm text-muted">Loading…</div>}
      </div>
    </div>
  );
}
