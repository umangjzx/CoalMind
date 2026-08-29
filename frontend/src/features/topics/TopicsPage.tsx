import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TopicOut } from "@/lib/types";
import { Card, EmptyState } from "@/components/primitives";
import { WordCloud } from "./WordCloud";
import { TrendsChart } from "./TrendsChart";
import { TopicDrawer } from "./TopicDrawer";

export function TopicsPage() {
  const qc = useQueryClient();
  const [docType, setDocType] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const topics = useQuery({ queryKey: ["topics"], queryFn: () => api.topics() });

  const rebuild = useMutation({
    mutationFn: () => api.rebuildTopics(5),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["topics"] });
      qc.invalidateQueries({ queryKey: ["topic-trends"] });
    },
  });

  return (
    <div className="mx-auto min-w-0 max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Topics &amp; Trends</h1>
          <p className="mt-1 text-sm text-muted">
            Emerging themes across ingested correspondence and reports — surfaced
            proactively so the Ministry sees brewing issues before they become a
            parliamentary question. Terms are domain-normalised (khadan / colliery /
            mine → one term).
          </p>
        </div>
        <button
          onClick={() => rebuild.mutate()}
          disabled={rebuild.isPending}
          className="rounded border border-border px-3 py-1.5 text-xs hover:bg-surface-2 disabled:opacity-50"
        >
          {rebuild.isPending ? "Rebuilding…" : "Rebuild topics"}
        </button>
      </header>

      <WordCloud docType={docType} onDocType={setDocType} />

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Topics</h2>
            <span className="text-xs text-muted">
              {topics.data?.items.length ?? 0} · {topics.data?.engine ?? "—"}
            </span>
          </div>
          {topics.data && topics.data.items.length === 0 && (
            <EmptyState>
              No topics yet — click <b>Rebuild topics</b> (needs ≥2 indexed documents).
            </EmptyState>
          )}
          <ul>
            {topics.data?.items.map((t: TopicOut) => (
              <li
                key={t.id}
                onClick={() => setSelected(t.id)}
                className="cursor-pointer border-b border-border/60 px-4 py-2 last:border-0 hover:bg-surface-2"
              >
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm font-medium">{t.label}</span>
                  <span className="text-xs text-muted">{t.doc_count} docs</span>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {t.first_seen ?? "—"}
                  {t.last_seen && t.last_seen !== t.first_seen ? ` → ${t.last_seen}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <TrendsChart />
      </div>

      {selected && <TopicDrawer id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
