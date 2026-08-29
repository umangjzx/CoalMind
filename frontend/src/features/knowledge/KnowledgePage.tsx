import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { KGEntity } from "@/lib/types";
import { entityKindLabel, unitLabel } from "@/lib/labels";
import { BarList, KIND_COLOR, Panel } from "@/components/charts";
import { Kpi, KpiRow, Page, PageHeader } from "@/components/layout";
import { Card, EmptyState } from "@/components/primitives";
import { GraphView } from "./GraphView";
import { SemanticSearch } from "./SemanticSearch";
import { EntityDrawer } from "./EntityDrawer";

const KIND_ORDER = [
  "subsidiary", "mine", "block", "seam", "mineral",
  "reserve", "production_figure", "finding", "inquiry", "report", "officer",
];
const kindColor = (k: string) => KIND_COLOR[Math.max(0, KIND_ORDER.indexOf(k)) % KIND_COLOR.length];

function GraphShape() {
  const { data } = useQuery({ queryKey: ["kg-stats"], queryFn: api.graphStats });
  if (!data) return null;
  const total = data.entities || 1;
  return (
    <>
      <KpiRow>
        <Kpi label="Facts & entities" value={data.entities} />
        <Kpi label="Links between them" value={data.relations} />
        <Kpi label="Searchable passages" value={data.chunks} />
        <Kpi
          label="Links per entity"
          value={(data.relations / total).toFixed(1)}
          sub="how connected the graph is"
        />
        <Kpi label="Kinds of thing" value={Object.keys(data.entities_by_kind).length} />
        <Kpi label="Every item" value="traced" sub="to a source document" tone="ok" />
      </KpiRow>
      <Panel title="What the graph is made of" hint="entities by kind">
        <BarList
          data={Object.entries(data.entities_by_kind)
            .sort((a, b) => b[1] - a[1])
            .map(([k, n], i) => ({
              label: entityKindLabel(k),
              value: n,
              color: KIND_COLOR[i % KIND_COLOR.length],
            }))}
        />
      </Panel>
    </>
  );
}

function EntityCard({ e, onClick }: { e: KGEntity; onClick: () => void }) {
  const q = e.attrs?.quantity ?? e.attrs?.value;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm transition-colors hover:border-brand"
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: kindColor(e.kind) }}
      />
      <span className="min-w-0 flex-1 truncate">{e.name}</span>
      {q != null && (
        <span className="shrink-0 tabular-nums text-muted">
          {String(q)} {unitLabel(e.attrs?.unit as string)}
        </span>
      )}
      {e.confidence > 0 && (
        <span className="shrink-0 tabular-nums text-xs text-muted">
          {Math.round(e.confidence * 100)}%
        </span>
      )}
    </button>
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
    <Page>
      <PageHeader title="Facts & entities">
        Everything the system has pulled out of your documents, organised by what it is
        &mdash; mines, blocks, seams, reserve and production figures &mdash; and linked
        together. Every item traces back to the document it came from.
      </PageHeader>

      <GraphShape />
      <GraphView onSelect={setSelected} />
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
            Nothing here yet — upload and review some documents first, and confirmed facts
            will appear here.
          </EmptyState>
        )}
        <div className="space-y-4 p-4">
          {kinds.map((k) => (
            <div key={k}>
              <div className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: kindColor(k) }} />
                {entityKindLabel(k)}
                <span className="text-border">·</span>
                {data!.items.filter((e) => e.kind === k).length}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {data!.items
                  .filter((e) => e.kind === k)
                  .map((e) => (
                    <EntityCard key={e.id} e={e} onClick={() => setSelected(e.id)} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {selected && (
        <EntityDrawer id={selected} onClose={() => setSelected(null)} onNavigate={setSelected} />
      )}
    </Page>
  );
}
