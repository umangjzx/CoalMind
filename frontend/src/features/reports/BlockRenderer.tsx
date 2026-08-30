import { Fragment, useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ReportBlock, ReportCitation } from "@/lib/types";

/* ── Inline [n] citation with a hover/click popover ─────────────────── */
function CiteMarker({ n, cite }: { n: number; cite?: ReportCitation }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const popId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const conf = cite ? Math.round(cite.confidence * 100) : null;
  const confTone =
    conf == null ? "" : conf >= 75 ? "text-ok" : conf >= 50 ? "text-warn" : "text-danger";

  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="align-super rounded px-0.5 text-[10px] font-bold text-brand transition-colors hover:bg-brand/10"
      >
        [{n}]
      </button>
      {open && cite && (
        <span
          id={popId}
          role="dialog"
          className="absolute left-1/2 top-5 z-40 block w-72 max-w-[80vw] -translate-x-1/2 rounded-lg border border-border bg-surface p-3 text-left text-[12px] shadow-lg"
        >
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0 font-semibold text-fg">
              {cite.document_filename ?? "source"}
              {cite.page_no ? ` · p.${cite.page_no}` : ""}
            </span>
            {conf != null && (
              <span className={`shrink-0 text-[11px] font-semibold tabular-nums ${confTone}`}>
                {conf}%
              </span>
            )}
          </span>
          {cite.field_key && cite.field_key !== "chunk" && cite.field_key !== "graph_fact" && (
            <span className="mt-1 block font-mono text-[11px] text-muted">
              {cite.field_key.replace(/_/g, " ")} = {cite.value}
            </span>
          )}
          <span className="mt-1.5 block leading-relaxed text-muted">…{cite.snippet}…</span>
          {cite.document_id && (
            <a
              className="mt-2 inline-flex items-center gap-1 font-medium text-brand hover:underline"
              href={`${api.documentFileUrl(cite.document_id)}#page=${cite.page_no ?? 1}`}
              target="_blank"
              rel="noreferrer"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Open the source page
            </a>
          )}
        </span>
      )}
    </span>
  );
}

function withMarkers(text: string, cites: ReportCitation[]) {
  return text.split(/(\[\[c:\d+\]\])/g).map((p, i) => {
    const m = p.match(/^\[\[c:(\d+)\]\]$/);
    if (!m) return <Fragment key={i}>{renderBold(p)}</Fragment>;
    const n = Number(m[1]);
    return <CiteMarker key={i} n={n} cite={cites.find((c) => c.marker === n)} />;
  });
}

// minimal **bold** support for template prose
function renderBold(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>,
  );
}

export function BlockRenderer({
  blocks,
  citations,
}: {
  blocks: ReportBlock[];
  citations: ReportCitation[];
}) {
  // number the level-2 headings (1., 2., …) the way a real report would
  let sectionNo = 0;
  return (
    <div className="report-prose space-y-3.5">
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          const level = Math.min(4, b.level ?? 2);
          const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
          const num = level === 2 ? `${(sectionNo += 1)}. ` : "";
          return (
            <Tag key={i} className={level >= 2 ? "mt-5 first:mt-0" : "mb-1"}>
              {num}
              {withMarkers(b.text ?? "", citations)}
            </Tag>
          );
        }
        if (b.type === "paragraph") {
          return (
            <p key={i} className="text-fg/90">
              {withMarkers(b.text ?? "", citations)}
            </p>
          );
        }
        if (b.type === "kv") {
          return (
            <dl
              key={i}
              className="grid grid-cols-[minmax(9rem,auto)_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-border bg-surface-2/40 p-3"
            >
              {(b.items ?? []).map((it, j) => (
                <Fragment key={j}>
                  <dt className="text-[12.5px] text-muted">{it.label}</dt>
                  <dd className="text-[12.5px] font-medium">
                    {withMarkers(String(it.value), citations)}
                  </dd>
                </Fragment>
              ))}
            </dl>
          );
        }
        if (b.type === "table") {
          return (
            <div key={i} className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-surface-2">
                    {(b.columns ?? []).map((c, j) => (
                      <th
                        key={j}
                        className="border-b border-border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(b.rows ?? []).map((row, j) => (
                    <tr key={j} className="border-b border-border/60 last:border-0">
                      {row.map((cell, k) => (
                        <td key={k} className="px-3 py-1.5 tabular-nums">
                          {withMarkers(String(cell), citations)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
