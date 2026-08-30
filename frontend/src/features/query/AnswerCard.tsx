import { Fragment, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { QAOut, ReportCitation } from "@/lib/types";
import { answerModeLabel } from "@/lib/labels";
import { ConfidenceBar } from "@/components/primitives";
import { Btn } from "@/components/layout";

/* ── Inline citation popover ─────────────────────────────────────────── */
function Cite({ n, c }: { n: number; c?: ReportCitation }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        onClick={() => setOpen((o) => !o)}
        className="align-super text-[10px] font-semibold text-brand hover:underline"
      >
        [{n}]
      </button>
      {open && c && (
        <span className="absolute left-0 top-5 z-30 block w-72 rounded-lg border border-border bg-surface p-3 text-left text-[12px] shadow-md">
          <span className="block font-semibold">
            {c.document_filename ?? "source"}
            {c.page_no ? `, page ${c.page_no}` : ""}
          </span>
          <span className="mt-1 block text-muted leading-relaxed">…{c.snippet}…</span>
          {c.document_id && (
            <a
              className="mt-2 flex items-center gap-1 text-brand hover:underline"
              href={`${api.documentFileUrl(c.document_id)}#page=${c.page_no ?? 1}`}
              target="_blank"
              rel="noreferrer"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              View this page
            </a>
          )}
          <button
            onClick={() => setOpen(false)}
            className="absolute right-2 top-2 text-faint hover:text-fg text-lg leading-none"
          >
            ×
          </button>
        </span>
      )}
    </span>
  );
}

/* ── Markdown-ish answer renderer ────────────────────────────────────── */
function renderAnswer(md: string, cites: ReportCitation[]) {
  return md.split("\n").map((line, li) => (
    <p key={li} className={line.trim() ? "mb-1.5 text-[13px] leading-relaxed" : "h-2"}>
      {line.split(/(\[\[c:\d+\]\]|\*\*[^*]+\*\*)/g).map((part, i) => {
        const m = part.match(/^\[\[c:(\d+)\]\]$/);
        if (m) {
          const n = Number(m[1]);
          return <Cite key={i} n={n} c={cites.find((c) => c.marker === n)} />;
        }
        if (/^\*\*[^*]+\*\*$/.test(part))
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </p>
  ));
}

/* ── Answer card ─────────────────────────────────────────────────────── */
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

  const statusConfig = insufficient
    ? { bg: "border-danger/30 bg-danger-lt/20", badge: "bg-danger-lt text-danger", icon: "✗", label: "Not enough evidence" }
    : flagged
    ? { bg: "border-warn/30 bg-warn-lt/20", badge: "bg-warn-lt text-warn", icon: "⚠", label: "Low confidence" }
    : { bg: "border-border bg-surface", badge: "bg-ok-lt text-ok", icon: "✓", label: "Answered" };

  return (
    <div className={`cm-card overflow-hidden border ${statusConfig.bg}`}>
      {/* Question header */}
      <div className="border-b border-border/60 px-4 py-3 bg-surface-2/30">
        <div className="flex items-start gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="mt-0.5 shrink-0 text-faint">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span className="text-[13px] font-semibold">{qa.question}</span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {/* Status + confidence row */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`pill ${statusConfig.badge}`}>
            {statusConfig.icon} {statusConfig.label}
          </span>
          <ConfidenceBar value={qa.confidence} />
          <span className="text-[11px] text-muted">· {answerModeLabel(qa.answer_mode)}</span>
          {qa.status === "verified" && (
            <span className="pill bg-ok-lt text-ok">Saved</span>
          )}
          {qa.hit_count > 0 && (
            <span className="pill bg-surface-2 text-muted">
              ↩ reused {qa.hit_count}×
            </span>
          )}
        </div>

        {/* Answer text */}
        <div className={`${insufficient ? "text-muted" : ""}`}>
          {renderAnswer(qa.answer_md, qa.citations)}
        </div>

        {/* Citations */}
        {qa.citations.length > 0 && (
          <details className="mt-3 text-[12px]">
            <summary className="flex cursor-pointer items-center gap-1.5 text-muted hover:text-fg transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              {qa.citations.length} source{qa.citations.length > 1 ? "s" : ""}
            </summary>
            <ol className="mt-2 space-y-1 border-t border-border/50 pt-2">
              {qa.citations.map((c) => (
                <li key={c.marker} className="flex gap-2 text-[11.5px] text-muted">
                  <span className="shrink-0 font-semibold text-faint">[{c.marker}]</span>
                  <span>
                    {c.document_filename ?? c.document_id}
                    {c.page_no ? `, p.${c.page_no}` : ""} —{" "}
                    <span className="italic">…{c.snippet}…</span>
                  </span>
                </li>
              ))}
            </ol>
          </details>
        )}

        {/* Actions */}
        {!insufficient && qa.status !== "verified" && qa.status !== "rejected" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
            <Btn
              size="xs"
              variant="secondary"
              disabled={verify.isPending}
              onClick={() => verify.mutate()}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Save this answer
            </Btn>
            <Btn
              size="xs"
              variant="danger"
              disabled={reject.isPending}
              onClick={() => reject.mutate()}
            >
              Mark incorrect
            </Btn>
            <span className="text-[11px] text-faint">
              Saving reuses it instantly next time.
            </span>
          </div>
        )}

        {qa.status === "rejected" && (
          <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-danger border-t border-border/50 pt-2">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Marked incorrect by an officer.
          </div>
        )}
      </div>
    </div>
  );
}
