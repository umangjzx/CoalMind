import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TopicOut } from "@/lib/types";
import { BarList, Panel } from "@/components/charts";
import { Card, CardHeader, EmptyState, SkeletonRows } from "@/components/primitives";
import { Btn, Col, Grid, Kpi, KpiRow, Page, PageHeader } from "@/components/layout";
import { WordCloud } from "./WordCloud";
import { TrendsChart } from "./TrendsChart";
import { TopicDrawer } from "./TopicDrawer";

/* ── Topic card ──────────────────────────────────────────────────────── */
function TopicCard({
  t,
  rank,
  onClick,
  active,
}: {
  t: TopicOut;
  rank: number;
  onClick: () => void;
  active: boolean;
}) {
  const hue = (rank * 47) % 360;
  const color = `hsl(${hue}, 60%, 45%)`;

  return (
    <button
      onClick={onClick}
      className={[
        "group w-full rounded-lg border p-3 text-left transition-all duration-150",
        active
          ? "border-brand bg-brand-lt/40 shadow-sm"
          : "border-border bg-surface hover:border-brand hover:shadow-sm",
      ].join(" ")}
    >
      {/* Rank + doc count header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white"
          style={{ background: color }}
        >
          {rank}
        </span>
        <span className="text-[11px] text-muted tabular-nums">
          {t.doc_count} doc{t.doc_count === 1 ? "" : "s"}
        </span>
      </div>

      {/* Label */}
      <div className="text-[13px] font-semibold truncate group-hover:text-brand transition-colors">
        {t.label}
      </div>

      {/* Terms */}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {t.terms.slice(0, 5).map((term) => (
          <span
            key={term.term}
            className="rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-muted"
          >
            {term.term}
          </span>
        ))}
      </div>

      {/* Date range */}
      {t.first_seen && (
        <div className="mt-2 text-[10.5px] text-faint">
          {t.first_seen}
          {t.last_seen && t.last_seen !== t.first_seen ? ` → ${t.last_seen}` : ""}
        </div>
      )}

      {/* Accent bar */}
      <div
        className="mt-2 h-0.5 w-5 rounded-full transition-[width] duration-300 group-hover:w-full"
        style={{ background: color, opacity: 0.6 }}
      />
    </button>
  );
}

/* ── Main ────────────────────────────────────────────────────────────── */
export function TopicsPage() {
  const qc = useQueryClient();
  const [docType, setDocType] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");

  const topics = useQuery({ queryKey: ["topics"], queryFn: () => api.topics() });

  const rebuild = useMutation({
    mutationFn: () => api.rebuildTopics(5),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["topics"] });
      qc.invalidateQueries({ queryKey: ["topic-trends"] });
    },
  });

  const items: TopicOut[] = topics.data?.items ?? [];
  const totalDocs = items.reduce((s, t) => s + t.doc_count, 0);
  const topTopic = items[0];
  const avgDocs = items.length ? (totalDocs / items.length).toFixed(1) : "—";

  return (
    <Page>
      <PageHeader
        title="Topics & Trends"
        actions={
          <Btn
            variant="secondary"
            size="sm"
            onClick={() => rebuild.mutate()}
            disabled={rebuild.isPending}
          >
            {rebuild.isPending ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" className="animate-spin" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
                </svg>
                Refreshing…
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                Refresh topics
              </>
            )}
          </Btn>
        }
      >
        Recurring themes across all documents and how they trend over time — so a
        building issue is visible before it becomes a Parliament question. Terms are
        grouped across English, Hindi and spelling variants.
      </PageHeader>

      {/* ── KPI row ──────────────────────────────────────────────── */}
      <KpiRow cols={4}>
        <Kpi
          label="Topics found"
          value={items.length || "—"}
          tone="brand"
          sub="distinct themes"
        />
        <Kpi
          label="Top theme"
          value={topTopic?.label ?? "—"}
          tone="fg"
          sub={topTopic ? `${topTopic.doc_count} documents` : "run Refresh to detect"}
        />
        <Kpi
          label="Avg docs / topic"
          value={avgDocs}
          tone="fg"
          sub="coverage breadth"
        />
        <Kpi
          label="Total coverage"
          value={totalDocs || "—"}
          tone="fg"
          sub="document–topic associations"
        />
      </KpiRow>

      {/* ── Word cloud + trends ──────────────────────────────────── */}
      <Grid>
        <Col span={7}>
          <Card padding={false}>
            <CardHeader title="Term frequency" subtitle="size reflects how often each term appears" />
            <div className="p-3">
              <WordCloud docType={docType} onDocType={setDocType} />
            </div>
          </Card>
        </Col>
        <Col span={5}>
          <Card padding={false} className="h-full">
            <CardHeader title="Topic trends" subtitle="document count per theme over time" />
            <div className="p-3">
              <TrendsChart />
            </div>
          </Card>
        </Col>
      </Grid>

      {/* ── Topics list + barlist ────────────────────────────────── */}
      <Grid>
        <Col span={9}>
          <Card padding={false}>
            <CardHeader
              title="All themes"
              subtitle={`${items.length} topics extracted from your documents`}
              right={
                <div className="flex items-center gap-1 rounded-md border border-border bg-surface-2 p-0.5">
                  {(["grid", "list"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={[
                        "rounded px-2.5 py-1 text-[11px] font-medium transition-all",
                        view === v ? "bg-surface text-fg shadow-xs" : "text-muted hover:text-fg",
                      ].join(" ")}
                    >
                      {v === "grid" ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                          <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                        </svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                          <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                          <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              }
            />

            <div className="p-3">
              {topics.isLoading && <SkeletonRows rows={4} />}

              {items.length === 0 && !topics.isLoading && (
                <EmptyState
                  icon={
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                  }
                >
                  No themes yet — click <strong>Refresh topics</strong> once at least
                  two documents have been processed.
                </EmptyState>
              )}

              {view === "grid" ? (
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((t, i) => (
                    <TopicCard
                      key={t.id}
                      t={t}
                      rank={i + 1}
                      onClick={() => setSelected(t.id)}
                      active={selected === t.id}
                    />
                  ))}
                </div>
              ) : (
                <ul>
                  {items.map((t, i) => (
                    <li
                      key={t.id}
                      onClick={() => setSelected(t.id)}
                      className={[
                        "cursor-pointer border-b border-border/60 px-2 py-2.5 last:border-0 transition-colors",
                        selected === t.id ? "bg-brand-lt/30" : "hover:bg-surface-2",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-5 shrink-0 text-center text-[11px] font-bold text-faint">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold">{t.label}</span>
                            <div className="flex flex-wrap gap-1">
                              {t.terms.slice(0, 4).map((term) => (
                                <span
                                  key={term.term}
                                  className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted"
                                >
                                  {term.term}
                                </span>
                              ))}
                            </div>
                          </div>
                          {t.first_seen && (
                            <div className="mt-0.5 text-[10.5px] text-faint">
                              {t.first_seen}{t.last_seen && t.last_seen !== t.first_seen ? ` → ${t.last_seen}` : ""}
                            </div>
                          )}
                        </div>
                        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-muted">
                          {t.doc_count}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </Col>

        <Col span={3}>
          <Panel title="Coverage" hint="documents touching each theme" className="h-full">
            <BarList
              data={items
                .slice()
                .sort((a, b) => b.doc_count - a.doc_count)
                .map((t) => ({ label: t.label, value: t.doc_count }))}
            />
          </Panel>
        </Col>
      </Grid>

      {selected && (
        <TopicDrawer id={selected} onClose={() => setSelected(null)} />
      )}
    </Page>
  );
}
