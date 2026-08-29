import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AskResponse, QAOut } from "@/lib/types";
import { Card, EmptyState } from "@/components/primitives";
import { Col, Grid, Page, PageHeader } from "@/components/layout";
import { AnswerCard } from "./AnswerCard";

const EXAMPLES = [
  "What are the proved and total geological reserves for Jhanjra Block-II?",
  "What was coal production at Kusmunda and how did it compare to target?",
  "Which mine reported belt-conveyor safety issues, and what was the risk rating?",
  "How did the Wani North manganese reserve estimate change after 2019?",
];

export function AskPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [threshold, setThreshold] = useState(0.75);
  const listRef = useRef<HTMLDivElement>(null);

  const history = useQuery({ queryKey: ["query-history"], queryFn: () => api.queryHistory(40) });
  const cache = useQuery({ queryKey: ["query-cache"], queryFn: () => api.queryCache() });

  const ask = useMutation({
    mutationFn: (question: string) => api.ask(question),
    onSuccess: (r: AskResponse) => {
      setThreshold(r.confidence_threshold);
      setQ("");
      qc.invalidateQueries({ queryKey: ["query-history"] });
      setTimeout(() => listRef.current?.scrollTo({ top: 0 }), 50);
    },
  });

  const items: QAOut[] = history.data?.items ?? [];
  const answered = items.filter((i) => i.status === "answered" || i.status === "verified").length;
  const declined = items.filter((i) => i.status === "insufficient").length;
  const saved = cache.data?.total ?? 0;

  return (
    <Page>
      <PageHeader title="Ask CoalMind">
        Ask a question in plain English. The answer is built only from your uploaded
        documents, with every figure linked to the page it came from. If the documents
        don&rsquo;t clearly answer it, the system says so rather than guessing.
      </PageHeader>

      <Grid>
        <Col span={4} className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card className="p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (q.trim().length >= 3) ask.mutate(q.trim());
              }}
            >
              <textarea
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (q.trim().length >= 3) ask.mutate(q.trim());
                  }
                }}
                rows={3}
                placeholder="Ask about a reserve, a production figure, an inspection…"
                className="w-full resize-none rounded border border-border bg-bg px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={ask.isPending || q.trim().length < 3}
                className="mt-2 w-full rounded bg-brand px-4 py-2 text-sm text-brand-fg disabled:opacity-50"
              >
                {ask.isPending ? "Thinking…" : "Ask"}
              </button>
            </form>
            <div className="mt-3 space-y-1.5">
              <div className="text-[11px] uppercase tracking-wide text-muted">Try one</div>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => ask.mutate(ex)}
                  className="block w-full rounded border border-border px-2 py-1.5 text-left text-xs text-muted hover:border-brand hover:text-fg"
                >
                  {ex}
                </button>
              ))}
            </div>
          </Card>

          <Card className="grid grid-cols-3 divide-x divide-border p-0 text-center">
            {[
              ["Asked", items.length],
              ["Declined", declined],
              ["Saved", saved],
            ].map(([label, n]) => (
              <div key={label as string} className="px-2 py-3">
                <div className="text-lg font-semibold tabular-nums">{n as number}</div>
                <div className="text-[11px] text-muted">{label as string}</div>
              </div>
            ))}
          </Card>

          {cache.data && cache.data.items.length > 0 && (
            <Card className="p-3">
              <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">
                Saved answers — reused instantly
              </div>
              <ul className="space-y-1">
                {cache.data.items.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => ask.mutate(c.question)}
                      className="w-full truncate rounded px-1.5 py-1 text-left text-xs hover:bg-surface-2"
                      title={c.question}
                    >
                      {c.question}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Col>

        <Col span={8}>
          <div ref={listRef} className="space-y-4">
            {ask.isPending && (
              <Card className="p-4 text-sm text-muted">
                Finding the evidence and writing a cited answer…
              </Card>
            )}
            {items.length === 0 && !ask.isPending && (
              <Card className="p-10">
                <EmptyState>
                  No questions yet. Ask one on the left, or pick an example &mdash; every
                  answer comes back with its sources.
                </EmptyState>
              </Card>
            )}
            {items.map((qa) => (
              <AnswerCard key={qa.id} qa={qa} threshold={threshold} />
            ))}
          </div>
        </Col>
      </Grid>

      <p className="text-center text-[11px] text-muted">
        {answered} answered · {declined} declined for lack of evidence
      </p>
    </Page>
  );
}
