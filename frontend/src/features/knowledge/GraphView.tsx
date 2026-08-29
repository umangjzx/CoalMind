import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { KGEntity, KGRelation } from "@/lib/types";
import { entityKindLabel, predicateLabel } from "@/lib/labels";
import { Card, EmptyState } from "@/components/primitives";

/** left-to-right tiers: named things first, then the figures they carry, then
 *  the documents / questions they were reported in. */
const TIER: Record<string, number> = {
  subsidiary: 0,
  mine: 1,
  block: 2,
  seam: 3,
  mineral: 3,
  reserve: 4,
  production_figure: 4,
  finding: 4,
  inquiry: 5,
  report: 5,
  officer: 5,
};

const KIND_HUE: Record<string, string> = {
  subsidiary: "rgb(var(--k-7))",
  mine: "rgb(var(--k-1))",
  block: "rgb(var(--k-2))",
  seam: "rgb(var(--k-4))",
  mineral: "rgb(var(--k-4))",
  reserve: "rgb(var(--k-3))",
  production_figure: "rgb(var(--k-6))",
  finding: "rgb(var(--c-danger))",
  inquiry: "rgb(var(--k-5))",
  report: "rgb(var(--k-7))",
  officer: "rgb(var(--k-7))",
};

const COL_W = 190;
const NODE_H = 30;
const ROW_GAP = 40;
const PAD_Y = 24;

interface Placed {
  e: KGEntity;
  x: number;
  y: number;
}

export function GraphView({ onSelect }: { onSelect: (id: string) => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["kg-graph"],
    queryFn: api.knowledgeGraph,
    retry: 1,
  });
  const [hover, setHover] = useState<string | null>(null);

  const layout = useMemo(() => {
    if (!data) return null;
    const cols = new Map<number, KGEntity[]>();
    for (const e of data.entities) {
      const t = TIER[e.kind] ?? 5;
      const bucket = cols.get(t) ?? [];
      bucket.push(e);
      cols.set(t, bucket);
    }
    const tiers = [...cols.keys()].sort((a, b) => a - b);
    const placed = new Map<string, Placed>();
    let maxRows = 0;
    tiers.forEach((t, ci) => {
      const list = cols
        .get(t)!
        .slice()
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
      maxRows = Math.max(maxRows, list.length);
      list.forEach((e, ri) => {
        placed.set(e.id, { e, x: ci * COL_W + 12, y: PAD_Y + ri * ROW_GAP });
      });
    });
    const width = tiers.length * COL_W;
    const height = PAD_Y * 2 + Math.max(1, maxRows) * ROW_GAP;
    const edges = data.relations
      .map((r: KGRelation) => ({ r, a: placed.get(r.src_id), b: placed.get(r.dst_id) }))
      .filter((x) => x.a && x.b);
    return { placed: [...placed.values()], edges, width, height };
  }, [data]);

  if (isLoading) return <Card className="p-4"><EmptyState>Building the map…</EmptyState></Card>;
  if (isError) return <Card className="p-4"><EmptyState>Couldn&rsquo;t load the map.</EmptyState></Card>;
  if (!layout || layout.placed.length === 0)
    return (
      <Card className="p-4">
        <EmptyState>
          Nothing to map yet — confirmed facts from your documents will show up here as a
          connected picture.
        </EmptyState>
      </Card>
    );

  const isLit = (id: string) =>
    hover === null ||
    hover === id ||
    layout.edges.some(
      (x) =>
        (x.r.src_id === hover && x.r.dst_id === id) ||
        (x.r.dst_id === hover && x.r.src_id === id),
    );

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">The map</h2>
        <p className="text-xs text-muted">
          Named things on the left, the figures they carry in the middle, the documents
          they came from on the right. Hover to trace a thread; click to open.
        </p>
      </div>
      <div className="overflow-auto p-3" style={{ maxHeight: 460 }}>
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          style={{ minWidth: Math.min(layout.width, 640) }}
        >
          {layout.edges.map(({ r, a, b }) => {
            const x1 = a!.x + COL_W - 24;
            const y1 = a!.y + NODE_H / 2;
            const x2 = b!.x;
            const y2 = b!.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            const lit = hover === null || hover === r.src_id || hover === r.dst_id;
            return (
              <path
                key={r.id}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="rgb(var(--c-muted))"
                strokeWidth={lit ? 1.4 : 1}
                strokeOpacity={lit ? 0.55 : 0.12}
              />
            );
          })}

          {layout.placed.map(({ e, x, y }) => {
            const lit = isLit(e.id);
            const hue = KIND_HUE[e.kind] ?? "rgb(var(--k-7))";
            const q = e.attrs?.quantity ?? e.attrs?.value;
            return (
              <g
                key={e.id}
                transform={`translate(${x},${y})`}
                onMouseEnter={() => setHover(e.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect(e.id)}
                style={{ cursor: "pointer", opacity: lit ? 1 : 0.25 }}
              >
                <rect
                  width={COL_W - 26}
                  height={NODE_H}
                  rx={7}
                  fill="rgb(var(--c-surface))"
                  stroke={hover === e.id ? hue : "rgb(var(--c-border))"}
                  strokeWidth={hover === e.id ? 2 : 1}
                />
                <rect width={4} height={NODE_H} rx={2} fill={hue} />
                <text
                  x={12}
                  y={NODE_H / 2 + 4}
                  className="fill-fg"
                  style={{ fontSize: 11, fontWeight: 500 }}
                >
                  {(e.name.length > 22 ? e.name.slice(0, 21) + "…" : e.name) +
                    (q != null ? ` · ${q}` : "")}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-[11px] text-muted">
        {[...new Set(layout.placed.map((p) => p.e.kind))].map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-[3px]"
              style={{ background: KIND_HUE[k] ?? "rgb(var(--k-7))" }}
            />
            {entityKindLabel(k)}
          </span>
        ))}
      </div>
      {hover && (
        <div className="border-t border-border px-4 py-1.5 text-[11px] text-muted">
          {layout.edges
            .filter((x) => x.r.src_id === hover || x.r.dst_id === hover)
            .slice(0, 4)
            .map((x) => {
              const out = x.r.src_id === hover;
              const other = out ? x.b!.e : x.a!.e;
              return (
                <span key={x.r.id} className="mr-3">
                  {predicateLabel(x.r.predicate)} {out ? "→" : "←"} {other.name}
                </span>
              );
            })}
        </div>
      )}
    </Card>
  );
}
