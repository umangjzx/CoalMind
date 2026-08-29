import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { KGEntity } from "@/lib/types";

/** Compact "facts extracted into the knowledge graph" panel for a document. */
export function DocumentGraph({ documentId }: { documentId: string }) {
  const { data } = useQuery({
    queryKey: ["doc-subgraph", documentId],
    queryFn: () => api.documentSubgraph(documentId),
    refetchInterval: 4000,
  });

  if (!data) return null;
  const byId = new Map<string, KGEntity>(data.entities.map((e) => [e.id, e]));

  return (
    <section className="mt-5">
      <h3 className="text-sm font-semibold">
        Knowledge graph ({data.entities.length} entities · {data.relations.length} relations)
      </h3>
      {data.relations.length === 0 ? (
        <p className="mt-1 text-xs text-muted">
          No graph facts yet — verify the extracted fields above and they flow into the graph.
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs">
          {data.relations.map((r) => {
            const s = byId.get(r.src_id);
            const d = byId.get(r.dst_id);
            return (
              <li key={r.id} className="rounded bg-surface-2 px-2 py-1">
                <span className="font-medium">
                  {s?.kind}:{s?.name}
                </span>
                <span className="mx-1 font-mono text-muted">
                  {r.predicate}
                  {r.valid_from ? ` (${r.valid_from})` : ""}
                </span>
                <span className="font-medium">
                  {d?.kind}:{d?.name}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
