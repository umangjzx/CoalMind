import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { KGEntity } from "@/lib/types";
import { entityKindLabel, unitLabel } from "@/lib/labels";
import { Card, ConfidenceBar, EmptyState } from "@/components/primitives";
import { SemanticSearch } from "./SemanticSearch";
import { EntityDrawer } from "./EntityDrawer";

const KIND_ORDER = [
  "subsidiary", "mine", "block", "seam", "mineral",
  "reserve", "production_figure", "finding", "inquiry", "report", "officer",
];

function StatsBar() {
  const { data } = useQuery({ queryKey: ["kg-stats"], queryFn: api.graphStats });
  if (!data) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span><b className="tabular-nums">{data.entities}</b> facts &amp; entities</span>
        <span><b className="tabular-nums">{data.relations}</b> links between them</span>
        <span><b className="tabular-nums">{data.chunks}</b> searchable passages</span>
      </div>
      <div className="text-xs text-muted">
        {Object.entries(data.entities_by_kind)
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => `${entityKindLabel(k)} ${n}`)
          .join(" · ")}
      </div>
    </div>
  );
}

export function KnowledgePage() {
  const [kind, setKind] = useState<string>("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["kg-entities", kind, q],
    queryFn: () => api.listEntities({ kind: kind || undefined, q: q || undefined, limit: 200 }),
  });

  const kinds = data
    ? [...new Set(data.items.map((e) => e.kind))].sort(
        (a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b),
      )
    : [];

  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Facts &amp; entities</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Everything the system has pulled out of your documents, organised by what it
          is &mdash; mines, blocks, seams, reserve and production figures &mdash; and
          linked together. Every item traces back to the document it came from. Search
          by meaning below, or browse the list.
        </p>
      </header>

      <Card className="p-4">
        <StatsBar />
      </Card>

      <SemanticSearch />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Browse</h2>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="filter by name…"
            className="rounded border border-border bg-bg px-2 py-1 text-sm"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="rounded border border-border bg-bg px-2 py-1 text-sm"
          >
            <option value="">Everything</option>
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {entityKindLabel(k)}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-muted">{data?.total ?? 0} shown</span>
        </div>

        {isLoading && <EmptyState>Loading…</EmptyState>}
        {data && data.items.length === 0 && (
          <EmptyState>
            Nothing here yet — upload and review some documents first, and confirmed
            facts will appear here.
          </EmptyState>
        )}
        {kinds.map((k) => (
          <div key={k} className="border-b border-border/60 last:border-0">
            <div className="bg-surface-2 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              {entityKindLabel(k)}
            </div>
            <ul>
              {data!.items
                .filter((e) => e.kind === k)
                .map((e: KGEntity) => (
                  <li
                    key={e.id}
                    onClick={() => setSelected(e.id)}
                    className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-surface-2"
                  >
                    <span className="truncate">
                      {e.name}
                      {e.attrs?.quantity != null && (
                        <span className="ml-2 text-muted">
                          {String(e.attrs.quantity)} {unitLabel(e.attrs.unit as string)}
                        </span>
                      )}
                      {e.attrs?.value != null && (
                        <span className="ml-2 text-muted">
                          {String(e.attrs.value)} {unitLabel(e.attrs.unit as string)}
                        </span>
                      )}
                    </span>
                    {e.confidence > 0 && <ConfidenceBar value={e.confidence} />}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </Card>

      {selected && <EntityDrawer id={selected} onClose={() => setSelected(null)} onNavigate={setSelected} />}
    </div>
  );
}
