import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, EmptyState } from "@/components/primitives";

/** Compact inline-SVG small-multiples: one row per topic, a bar per time bucket. */
export function TrendsChart() {
  const { data, isLoading } = useQuery({
    queryKey: ["topic-trends"],
    queryFn: () => api.topicTrends(),
  });

  if (isLoading) return <Card className="p-4"><EmptyState>Loading trends…</EmptyState></Card>;
  if (!data || data.series.length === 0)
    return (
      <Card className="p-4">
        <EmptyState>No trend data — rebuild topics first.</EmptyState>
      </Card>
    );

  const max = Math.max(1, ...data.series.flatMap((s) => s.counts));
  const bw = 26;
  const gap = 6;
  const w = data.buckets.length * (bw + gap);

  return (
    <Card>
      <div className="border-b border-border px-4 py-3 text-sm font-semibold">
        Topic trends over time
      </div>
      <div className="space-y-3 overflow-x-auto p-4">
        {data.series.map((s) => (
          <div key={s.topic_index} className="min-w-0">
            <div className="mb-1 truncate text-xs text-muted" title={s.label}>
              {s.label}
            </div>
            <svg width={w} height={44} className="overflow-visible">
              {s.counts.map((c, i) => {
                const h = (c / max) * 34;
                return (
                  <g key={i} transform={`translate(${i * (bw + gap)},0)`}>
                    <rect
                      x={0}
                      y={38 - h}
                      width={bw}
                      height={Math.max(h, c > 0 ? 3 : 0)}
                      rx={2}
                      className="fill-brand"
                      opacity={c > 0 ? 0.85 : 0.15}
                    />
                    {c > 0 && (
                      <text x={bw / 2} y={38 - h - 3} textAnchor="middle"
                            className="fill-muted text-[9px]">
                        {c}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        ))}
        <div className="flex gap-[6px] pt-1" style={{ width: w }}>
          {data.buckets.map((b) => (
            <span key={b} className="text-center text-[9px] text-muted" style={{ width: bw }}>
              {b.replace("undated", "n/a")}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
