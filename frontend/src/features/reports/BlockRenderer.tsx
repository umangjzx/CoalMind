import { Fragment, useState } from "react";
import { api } from "@/lib/api";
import type { ReportBlock, ReportCitation } from "@/lib/types";

function CiteMarker({ n, cite }: { n: number; cite?: ReportCitation }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="align-super text-[10px] font-semibold text-brand hover:underline"
      >
        [{n}]
      </button>
      {open && cite && (
        <span className="absolute left-0 top-4 z-30 block w-72 rounded border border-border bg-surface p-2 text-left text-xs shadow-lg">
          <span className="block font-medium">
            {cite.document_filename ?? "source"}
            {cite.page_no ? ` · p.${cite.page_no}` : ""}
          </span>
          <span className="mt-1 block font-mono text-[11px] text-muted">
            {cite.field_key} = {cite.value}
          </span>
          <span className="mt-1 block text-muted">…{cite.snippet}…</span>
          <span className="mt-1 block">
            confidence {Math.round(cite.confidence * 100)}%
            {cite.document_id && (
              <a
                className="ml-2 text-brand hover:underline"
                href={`${api.documentFileUrl(cite.document_id)}#page=${cite.page_no ?? 1}`}
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

function withMarkers(text: string, cites: ReportCitation[]) {
  const parts = text.split(/(\[\[c:\d+\]\])/g);
  return parts.map((p, i) => {
    const m = p.match(/^\[\[c:(\d+)\]\]$/);
    if (!m) return <Fragment key={i}>{renderBold(p)}</Fragment>;
    const n = Number(m[1]);
    return <CiteMarker key={i} n={n} cite={cites.find((c) => c.marker === n)} />;
  });
}

// minimal **bold** support for template prose
function renderBold(s: string) {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
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
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          const Tag = (`h${Math.min(4, b.level ?? 2)}` as "h1" | "h2" | "h3" | "h4");
          return (
            <Tag key={i} className="font-semibold" style={{ fontSize: `${1.4 - (b.level ?? 2) * 0.15}rem` }}>
              {withMarkers(b.text ?? "", citations)}
            </Tag>
          );
        }
        if (b.type === "paragraph") {
          return (
            <p key={i} className="text-sm leading-relaxed">
              {withMarkers(b.text ?? "", citations)}
            </p>
          );
        }
        if (b.type === "kv") {
          return (
            <table key={i} className="text-sm">
              <tbody>
                {(b.items ?? []).map((it, j) => (
                  <tr key={j}>
                    <th className="py-0.5 pr-4 text-left font-normal text-muted">{it.label}</th>
                    <td className="py-0.5">{withMarkers(String(it.value), citations)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        if (b.type === "table") {
          return (
            <div key={i} className="overflow-x-auto">
              <table className="min-w-full border border-border text-sm">
                <thead>
                  <tr className="bg-surface-2">
                    {(b.columns ?? []).map((c, j) => (
                      <th key={j} className="border border-border px-2 py-1 text-left">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(b.rows ?? []).map((row, j) => (
                    <tr key={j}>
                      {row.map((cell, k) => (
                        <td key={k} className="border border-border px-2 py-1">
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
