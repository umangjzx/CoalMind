import { Fragment, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { QAOut, ReportCitation } from "@/lib/types";
import { ConfidenceBar } from "@/components/primitives";

function Cite({ n, c }: { n: number; c?: ReportCitation }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="align-super text-[10px] font-semibold text-brand hover:underline"
      >
        [{n}]
      </button>
      {open && c && (
        <span className="absolute left-0 top-4 z-30 block w-72 rounded border border-border bg-surface p-2 text-left text-xs shadow-lg">
          <span className="block font-medium">
            {c.document_filename ?? "source"}
            {c.page_no ? ` · p.${c.page_no}` : ""} · {c.field_key}
          </span>
          <span className="mt-1 block text-muted">…{c.snippet}…</span>
          <span className="mt-1 block">
            relevance {Math.round(c.confidence * 100)}%
            {c.document_id && (
              <a
                className="ml-2 text-brand hover:underline"
                href={`${api.documentFileUrl(c.document_id)}#page=${c.page_no ?? 1}`}
                target="_blank"
                rel="noreferrer"
              >
                open source
              </a>
            )}
          </span>
        </span>
      )}
    </span>
  );
}

function renderAnswer(md: string, cites: ReportCitation[]) {
  return md.split("\n").map((line, li) => (
    <p key={li} className={line.trim() ? "mb-1.5 text-sm leading-relaxed" : "h-2"}>
      {line.split(/(\[\[c:\d+\]\]|\*\*[^*]+\*\*)/g).map((part, i) => {
        const m = part.match(/^\[\[c:(\d+)\]\]$/);
        if (m) {
          const n = Number(m[1]);
          return <Cite key={i} n={n} c={cites.find((c) => c.marker === n)} />;
        }
        if (/^\*\*[^*]+\*\*$/.test(part))
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </p>
  ));
}

const MODE_LABEL: Record<string, string> = {
  rag: "graph-aware RAG",
  search_only: "search-only (LLM offline)",
  cache: "verified cache",
};

export function AnswerCard({
  qa,
  threshold = 0.75,
}: {
  qa: QAOut;
  threshold?: number;
}) {
  const qc = useQueryClient();
  const onDone = () => {
    qc.invalidateQueries({ queryKey: ["query-history"] });
    qc.invalidateQueries({ queryKey: ["query-cache"] });
  };
  const verify = useMutation({ mutationFn: () => api.verifyAnswer(qa.id), onSuccess: onDone });
  const reject = useMutation({ mutationFn: () => api.rejectAnswer(qa.id), onSuccess: onDone });

  const insufficient = qa.status === "insufficient";
  const flagged = !insufficient && qa.confidence < threshold;

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-2 text-sm font-medium">{qa.question}</div>
      <div className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          {insufficient ? (
            <span className="rounded bg-danger/15 px-2 py-0.5 font-medium text-danger">
              insufficient evidence — not answered
            </span>
          ) : flagged ? (
            <span className="rounded bg-warn/15 px-2 py-0.5 font-medium text-warn">
              low confidence — verify before use
            </span>
          ) : (
            <span className="rounded bg-ok/15 px-2 py-0.5 font-medium text-ok">answered</span>
          )}
          <ConfidenceBar value={qa.confidence} />
          <span className="text-muted">· {MODE_LABEL[qa.answer_mode] ?? qa.answer_mode}</span>
          {qa.status === "verified" && (
            <span className="rounded bg-ok/15 px-2 py-0.5 text-ok">in verified cache</span>
          )}
          {qa.hit_count > 0 && <span className="text-muted">· reused {qa.hit_count}×</span>}
        </div>

        <div className={insufficient ? "text-muted" : ""}>
          {renderAnswer(qa.answer_md, qa.citations)}
        </div>

        {qa.citations.length > 0 && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted">
              Source chain ({qa.citations.length})
            </summary>
            <ol className="mt-1 space-y-0.5 text-muted">
              {qa.citations.map((c) => (
                <li key={c.marker}>
                  [{c.marker}] {c.document_filename ?? c.document_id}
                  {c.page_no ? `, p.${c.page_no}` : ""} —{" "}
                  {c.field_key === "graph_fact" ? "graph fact" : "passage"} · “{c.snippet}”
                </li>
              ))}
            </ol>
          </details>
        )}

        {!insufficient && qa.status !== "verified" && qa.status !== "rejected" && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => verify.mutate()}
              disabled={verify.isPending}
              className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2"
            >
              Verify → add to cache
            </button>
            <button
              onClick={() => reject.mutate()}
              disabled={reject.isPending}
              className="rounded border border-border px-2 py-1 text-xs text-danger hover:bg-surface-2"
            >
              Reject
            </button>
          </div>
        )}
        {qa.status === "rejected" && (
          <div className="mt-2 text-xs text-danger">marked incorrect by an officer</div>
        )}
      </div>
    </div>
  );
}
