import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AskResponse, QAOut } from "@/lib/types";
import { Card, CardHeader } from "@/components/primitives";
import { Col, Grid, Page, PageHeader } from "@/components/layout";
import { AnswerCard } from "./AnswerCard";

const EXAMPLES = [
  "What are the proved and total geological reserves for Jhanjra Block-II?",
  "What was coal production at Kusmunda and how did it compare to target?",
  "Which mine reported belt-conveyor safety issues, and what was the risk rating?",
  "How did the Wani North manganese reserve estimate change after 2019?",
];

/* ── Ask form ─────────────────────────────────────────────────────────── */
function AskForm({
  onAsk,
  isPending,
}: {
  onAsk: (q: string) => void;
  isPending: boolean;
}) {
  const [q, setQ] = useState("");

  const submit = () => {
    if (q.trim().length >= 3) {
      onAsk(q.trim());
      setQ("");
    }
  };

  return (
    <div className="sticky top-0 z-10 rounded-xl border border-border bg-surface shadow-sm p-3 space-y-2">
      <div className="relative">
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
          className="absolute left-3 top-3 text-faint"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder="Ask about a reserve, production figure, inspection, or finding…"
          className="w-full resize-none rounded-lg border border-border bg-bg pl-9 pr-3 pt-2.5 pb-2.5 text-[13px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-faint flex-1">
          {q.trim().length >= 3 ? "Press Enter or click Ask" : "Type a question about your documents…"}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={isPending || q.trim().length < 3}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-brand-fg transition-all disabled:opacity-40 hover:bg-brand/90"
        >
          {isPending ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" className="animate-spin" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
              </svg>
              Thinking…
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              Ask
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ── Stats strip ──────────────────────────────────────────────────────── */
function StatsStrip({
  total,
  declined,
  saved,
}: {
  total: number;
  declined: number;
  saved: number;
}) {
  return (
    <div className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-surface overflow-hidden">
      {[
        { label: "Questions asked", value: total, color: "text-fg" },
        { label: "Declined (no evidence)", value: declined, color: "text-warn" },
        { label: "Saved & reused", value: saved, color: "text-ok" },
      ].map(({ label, value, color }) => (
        <div key={label} className="px-3 py-2.5 text-center">
          <div className={`text-[18px] font-bold tabular-nums ${color}`}>{value}</div>
          <div className="text-[10.5px] text-muted mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Saved answers list ───────────────────────────────────────────────── */
function SavedAnswers({ onAsk }: { onAsk: (q: string) => void }) {
  const cache = useQuery({ queryKey: ["query-cache"], queryFn: () => api.queryCache() });
  if (!cache.data || cache.data.items.length === 0) return null;

  return (
    <Card padding={false}>
      <CardHeader
        title="Saved answers"
        subtitle="Reused instantly on next ask"
        right={
          <span className="pill bg-ok-lt text-ok">{cache.data.total} saved</span>
        }
      />
      <ul>
        {cache.data.items.slice(0, 8).map((c) => (
          <li key={c.id} className="border-b border-border/60 last:border-0">
            <button
              onClick={() => onAsk(c.question)}
              className="w-full px-3 py-2 text-left text-[12px] text-muted hover:bg-surface-2 hover:text-fg transition-colors"
              title={c.question}
            >
              <div className="flex items-start gap-2">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0 text-ok">
                  <polyline points="9 11 12 14 22 4"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
                <span className="line-clamp-2">{c.question}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ── Main ────────────────────────────────────────────────────────────── */
export function AskPage() {
  const qc = useQueryClient();
  const listRef = useRef<HTMLDivElement>(null);
  const [threshold, setThreshold] = useState(0.75);

  const history = useQuery({ queryKey: ["query-history"], queryFn: () => api.queryHistory(40) });
  const cache   = useQuery({ queryKey: ["query-cache"],   queryFn: () => api.queryCache()      });

  const ask = useMutation({
    mutationFn: (question: string) => api.ask(question),
    onSuccess: (r: AskResponse) => {
      setThreshold(r.confidence_threshold);
      qc.invalidateQueries({ queryKey: ["query-history"] });
      setTimeout(() => listRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 80);
    },
  });

  const items: QAOut[]  = history.data?.items ?? [];
  const answered = items.filter((i) => i.status === "answered" || i.status === "verified").length;
  const declined = items.filter((i) => i.status === "insufficient").length;
  const saved    = cache.data?.total ?? 0;

  return (
    <Page>
      <PageHeader title="Ask CoalMind">
        Ask in plain English. Every answer is built only from your uploaded documents,
        with each figure linked to the page it came from. If the documents don't clearly
        answer it, the system says so rather than guessing.
      </PageHeader>

      <Grid>
        {/* ── Left: compose + context ──────────────────────── */}
        <Col span={4} className="space-y-3">
          {/* Ask form */}
          <AskForm onAsk={(q) => ask.mutate(q)} isPending={ask.isPending} />

          {/* Stats */}
          <StatsStrip total={items.length} declined={declined} saved={saved} />

          {/* Example questions */}
          <Card padding={false}>
            <CardHeader title="Try an example" subtitle="Click any question to ask it" />
            <ul>
              {EXAMPLES.map((ex) => (
                <li key={ex} className="border-b border-border/60 last:border-0">
                  <button
                    onClick={() => ask.mutate(ex)}
                    disabled={ask.isPending}
                    className="w-full px-3 py-2.5 text-left text-[12px] text-muted hover:bg-surface-2 hover:text-fg transition-colors group"
                  >
                    <div className="flex items-start gap-2">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0 opacity-40 group-hover:opacity-100 group-hover:text-brand transition-all">
                        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                      </svg>
                      <span>{ex}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {/* Saved answers */}
          <SavedAnswers onAsk={(q) => ask.mutate(q)} />
        </Col>

        {/* ── Right: answers feed ──────────────────────────── */}
        <Col span={8}>
          <div ref={listRef} className="space-y-3">
            {/* Thinking indicator */}
            {ask.isPending && (
              <div className="cm-card flex items-center gap-3 p-4">
                <svg width="16" height="16" viewBox="0 0 24 24" className="animate-spin shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
                </svg>
                <div>
                  <div className="text-[12.5px] font-medium">Searching documents…</div>
                  <div className="text-[11.5px] text-muted">Finding evidence and writing a cited answer</div>
                </div>
              </div>
            )}

            {/* Empty state */}
            {items.length === 0 && !ask.isPending && (
              <div className="cm-card p-12 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-faint">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div className="text-[13px] font-medium">No questions yet</div>
                <div className="mt-1 text-[12px] text-muted">
                  Ask a question on the left, or pick an example — every answer comes back
                  with its sources.
                </div>
              </div>
            )}

            {/* Answer cards */}
            {items.map((qa) => (
              <AnswerCard key={qa.id} qa={qa} threshold={threshold} />
            ))}
          </div>

          {/* Footer stats */}
          {items.length > 0 && (
            <div className="mt-4 flex items-center justify-center gap-3 text-[11.5px] text-faint">
              <span>{answered} answered</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>{declined} declined for lack of evidence</span>
            </div>
          )}
        </Col>
      </Grid>
    </Page>
  );
}
