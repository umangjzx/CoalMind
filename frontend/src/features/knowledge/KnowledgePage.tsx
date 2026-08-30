import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { KGEntity } from "@/lib/types";
import { entityKindLabel, unitLabel } from "@/lib/labels";
import { BarList, Panel } from "@/components/charts";
import { KIND_COLOR } from "@/components/chart-colors";
import { Kpi, KpiRow, Page, PageHeader, Col, Grid } from "@/components/layout";
import { Card, CardHeader, EmptyState, SkeletonRows } from "@/components/primitives";
import { GraphView } from "./GraphView";
import { SemanticSearch } from "./SemanticSearch";
import { EntityDrawer } from "./EntityDrawer";

const KIND_ORDER = [
  "subsidiary", "mine", "block", "seam", "mineral",
  "reserve", "production_figure", "finding", "inquiry", "report", "officer",
];
const kindColor = (k: string) =>
  KIND_COLOR[Math.max(0, KIND_ORDER.indexOf(k)) % KIND_COLOR.length];

/* ── Graph shape stats ──────────────────────────────────────────────── */
function GraphStats() {
  const { data } = useQuery({ queryKey: ["kg-stats"], queryFn: api.graphStats });
  if (!data) return null;

  const total = data.entities || 1;
  const density = (data.relations / total).toFixed(1);

  return (
    <KpiRow>
      <Kpi
        label="Facts & entities"
        value={data.entities}
        tone="brand"
        sub="unique named things"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="12" cy="12" r="3"/><circle cx="4" cy="7" r="2"/><circle cx="20" cy="7" r="2"/>
            <circle cx="4" cy="17" r="2"/><circle cx="20" cy="17" r="2"/>
            <line x1="6" y1="7" x2="9" y2="10"/><line x1="18" y1="7" x2="15" y2="10"/>
            <line x1="6" y1="17" x2="9" y2="14"/><line x1="18" y1="17" x2="15" y2="14"/>
          </svg>
        }
      />
      <Kpi label="Links" value={data.relations} sub="between entities" tone="fg" />
      <Kpi
        label="Graph density"
        value={density}
        sub="links per entity"
        tone={Number(density) >= 2 ? "ok" : "fg"}
      />
      <Kpi label="Passages" value={data.chunks} sub="searchable text chunks" tone="fg" />
      <Kpi
        label="Entity kinds"
        value={Object.keys(data.entities_by_kind).length}
        sub="types of thing"
        tone="fg"
      />
      <Kpi label="All sourced" value="100%" tone="ok" sub="traced to a document" />
    </KpiRow>
  );
}

/* ── Entity kind breakdown panel ────────────────────────────────────── */
function KindBreakdown() {
  const { data } = useQuery({ queryKey: ["kg-stats"], queryFn: api.graphStats });
  if (!data) return null;

  return (
    <Panel title="Entity breakdown" hint="by kind, sorted by count">
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
  );
}

/* ── Entity card ─────────────────────────────────────────────────────── */
function EntityCard({ e, onClick }: { e: KGEntity; onClick: () => void }) {
  const q = e.attrs?.quantity ?? e.attrs?.value;
  const conf = e.confidence;
  const color = kindColor(e.kind);

  return (
    <button
      onClick={onClick}
      className="group flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-3 text-left transition-all duration-150 hover:border-brand hover:shadow-sm"
    >
      {/* Kind badge + confidence */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="pill text-[10px]"
          style={{ background: `${color}1a`, color }}
        >
          {entityKindLabel(e.kind)}
        </span>
        {conf > 0 && (
          <span className="text-[10.5px] tabular-nums text-faint">
            {Math.round(conf * 100)}%
          </span>
        )}
      </div>

      {/* Name */}
      <span className="min-w-0 truncate text-[12.5px] font-semibold group-hover:text-brand">
        {e.name}
      </span>

      {/* Quantity */}
      {q != null && (
        <span className="text-[11px] tabular-nums text-muted">
          {String(q)} {unitLabel(e.attrs?.unit as string)}
        </span>
      )}

      {/* Color accent bar */}
      <span
        className="mt-auto h-0.5 w-6 rounded-full opacity-60 transition-all duration-150 group-hover:w-full"
        style={{ background: color }}
      />
    </button>
  );
}

/* ── Kind section header ─────────────────────────────────────────────── */
function KindSection({
  kind,
  entities,
  onSelect,
}: {
  kind: string;
  entities: KGEntity[];
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const color = kindColor(kind);
  const MAX_COLLAPSED = 8;
  const shown = expanded ? entities : entities.slice(0, MAX_COLLAPSED);

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mb-2 flex w-full items-center gap-2 text-left"
      >
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">
          {entityKindLabel(kind)}
        </span>
        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-faint">
          {entities.length}
        </span>
        <span className="ml-auto text-[11px] text-faint">
          {expanded ? "▲" : "▼"}
        </span>
      </button>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((e) => (
          <EntityCard key={e.id} e={e} onClick={() => onSelect(e.id)} />
        ))}
      </div>
      {!expanded && entities.length > MAX_COLLAPSED && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 text-[11.5px] text-brand hover:underline"
        >
          Show {entities.length - MAX_COLLAPSED} more…
        </button>
      )}
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────── */
export function KnowledgePage() {
  const [kind, setKind] = useState<string>("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["kg-entities", kind, q],
    queryFn: () =>
      api.listEntities({ kind: kind || undefined, q: q || undefined, limit: 200 }),
  });

  const kinds = data
    ? [...new Set(data.items.map((e) => e.kind))].sort(
        (a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b),
      )
    : [];

  return (
    <Page>
      <PageHeader title="Facts & Entities">
        Everything extracted from your documents — mines, blocks, seams, reserves and
        production figures — linked together with every item traced back to its source.
      </PageHeader>

      {/* ── KPI row ──────────────────────────────────────────────── */}
      <GraphStats />

      {/* ── Graph + breakdown ────────────────────────────────────── */}
      <Grid>
        <Col span={8}>
          <GraphView onSelect={setSelected} />
        </Col>
        <Col span={4}>
          <KindBreakdown />
        </Col>
      </Grid>

      {/* ── Semantic search ──────────────────────────────────────── */}
      <SemanticSearch />

      {/* ── Browse panel ─────────────────────────────────────────── */}
      <Card padding={false}>
        <CardHeader
          title="Browse entities"
          subtitle="All confirmed facts from your documents"
          right={
            <div className="flex items-center gap-2">
              <div className="relative">
                <svg
                  width="13" height="13"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
                >
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Filter by name…"
                  className="rounded-md border border-border bg-bg pl-8 pr-3 py-1.5 text-[12px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 w-48"
                />
              </div>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] focus:border-brand focus:outline-none"
              >
                <option value="">All kinds</option>
                {KIND_ORDER.map((k) => (
                  <option key={k} value={k}>{entityKindLabel(k)}</option>
                ))}
              </select>
              <span className="text-[11px] text-muted tabular-nums whitespace-nowrap">
                {data?.total ?? 0} results
              </span>
            </div>
          }
        />

        <div className="p-4">
          {isLoading && <SkeletonRows rows={4} />}
          {data && data.items.length === 0 && (
            <EmptyState
              icon={
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              }
            >
              Nothing found. Upload and review documents first — confirmed facts appear here.
            </EmptyState>
          )}
          <div className="space-y-6">
            {kinds.map((k) => (
              <KindSection
                key={k}
                kind={k}
                entities={data!.items.filter((e) => e.kind === k)}
                onSelect={setSelected}
              />
            ))}
          </div>
        </div>
      </Card>

      {selected && (
        <EntityDrawer id={selected} onClose={() => setSelected(null)} onNavigate={setSelected} />
      )}
    </Page>
  );
}
