import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AskResponse, QAOut } from "@/lib/types";
import { Card, EmptyState } from "@/components/primitives";
import { AnswerCard } from "./AnswerCard";

const EXAMPLES = [
  "What are the proved and total geological reserves for Jhanjra Block-II?",
  "What was coal production at Kusmunda and how did it compare to target?",
  "Which mine reported belt-conveyor safety issues, and what was the risk rating?",
];

export function AskPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [threshold, setThreshold] = useState(0.75);
  const listRef = useRef<HTMLDivElement>(null);

  const history = useQuery({
    queryKey: ["query-history"],
    queryFn: () => api.queryHistory(40),
  });
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

  return (
    <div className="mx-auto min-w-0 max-w-5xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Ask CoalMind</h1>
        <p className="mt-1 text-sm text-muted">
          Natural-language questions answered from the knowledge graph and document
          corpus — every figure cited to its source. The system declines rather than
          guesses when it isn't confident. Verified answers are cached for instant reuse.
        </p>
      </header>

      <Card className="p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim().length >= 3) ask.mutate(q.trim());
          }}
          className="flex gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. What were the manganese reserve estimates for Wani North before and after 2019?"
            className="flex-1 rounded border border-border bg-bg px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={ask.isPending || q.trim().length < 3}
            className="rounded bg-brand px-4 py-2 text-sm text-brand-fg disabled:opacity-50"
          >
            {ask.isPending ? "Thinking…" : "Ask"}
          </button>
        </form>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => ask.mutate(ex)}
              className="rounded-full border border-border px-2 py-0.5 text-xs text-muted hover:bg-surface-2"
            >
              {ex}
            </button>
          ))}
        </div>
        {cache.data && cache.data.total > 0 && (
          <div className="mt-2 text-xs text-muted">
            {cache.data.total} verified answer{cache.data.total > 1 ? "s" : ""} in cache
          </div>
        )}
      </Card>

      <div ref={listRef} className="space-y-4">
        {ask.isPending && (
          <Card className="p-4 text-sm text-muted">Retrieving evidence and composing a cited answer…</Card>
        )}
        {items.length === 0 && !ask.isPending && (
          <EmptyState>No questions yet — ask one above.</EmptyState>
        )}
        {items.map((qa) => (
          <AnswerCard key={qa.id} qa={qa} threshold={threshold} />
        ))}
      </div>
    </div>
  );
}
