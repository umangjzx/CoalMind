import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TopicOut } from "@/lib/types";
import { Card, EmptyState } from "@/components/primitives";
import { Page, PageHeader } from "@/components/layout";
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
    <Page>
      <PageHeader
        title="Topics & Trends"
        actions={
          <button
            onClick={() => rebuild.mutate()}
            disabled={rebuild.isPending}
            className="rounded border border-border px-3 py-1.5 text-xs hover:bg-surface-2 disabled:opacity-50"
          >
            {rebuild.isPending ? "Refreshing…" : "Refresh topics"}
          </button>
        }
      >
        The recurring themes across all your documents, and how often each one comes up
        over time &mdash; so a building issue is visible before it turns into a Parliament
        question. Terms are grouped across English, Hindi, and spelling variants.
      </PageHeader>

      <WordCloud docType={docType} onDocType={setDocType} />

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Themes</h2>
            <span className="text-xs text-muted">{topics.data?.items.length ?? 0} found</span>
          </div>
          {topics.data && topics.data.items.length === 0 && (
            <EmptyState>
              No themes yet — click <b>Refresh topics</b> once at least two documents
              have been processed.
            </EmptyState>
          )}
          <ul>
            {topics.data?.items.map((t: TopicOut) => (
              <li
                key={t.id}
                onClick={() => setSelected(t.id)}
                className="cursor-pointer border-b border-border/60 px-4 py-2 last:border-0 hover:bg-surface-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{t.label}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {t.doc_count} document{t.doc_count === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {t.first_seen ?? "date unknown"}
                  {t.last_seen && t.last_seen !== t.first_seen ? ` → ${t.last_seen}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <TrendsChart />
      </div>

      {selected && <TopicDrawer id={selected} onClose={() => setSelected(null)} />}
    </Page>
  );
}
