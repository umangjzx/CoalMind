import { api } from "@/lib/api";
import type { ReportCitation } from "@/lib/types";
import { ConfidenceBar } from "@/components/primitives";

/** Every figure in a report is footnoted. This groups those footnotes by the
 *  document they came from, with a confidence bar and a jump-to-page link. */
export function SourcesPanel({ citations }: { citations: ReportCitation[] }) {
  if (!citations.length) {
    return (
      <p className="px-4 py-6 text-center text-[12px] text-muted">
        This draft doesn&rsquo;t cite any figures yet.
      </p>
    );
  }

  const groups = new Map<string, { name: string; docId: string | null; cites: ReportCitation[] }>();
  for (const c of citations) {
    const gkey = c.document_id ?? c.document_filename ?? "unknown";
    const g = groups.get(gkey) ?? {
      name: c.document_filename ?? "Unknown source",
      docId: c.document_id,
      cites: [],
    };
    g.cites.push(c);
    groups.set(gkey, g);
  }

  const avg =
    citations.reduce((s, c) => s + c.confidence, 0) / Math.max(1, citations.length);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="text-[11px] text-muted">
          {citations.length} figure{citations.length === 1 ? "" : "s"} ·{" "}
          {groups.size} document{groups.size === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          avg <ConfidenceBar value={avg} />
        </span>
      </div>

      <ul className="divide-y divide-border/60">
        {[...groups.values()].map((g) => (
          <li key={g.name} className="px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 truncate text-[12px] font-semibold" title={g.name}>
                {g.name}
              </span>
              {g.docId && (
                <a
                  href={`${api.documentFileUrl(g.docId)}#page=${g.cites[0]?.page_no ?? 1}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-[11px] font-medium text-brand hover:underline"
                >
                  open
                </a>
              )}
            </div>
            <ul className="mt-1.5 space-y-1.5">
              {g.cites.map((c) => (
                <li key={c.marker} className="flex items-center gap-2 text-[11.5px]">
                  <span className="shrink-0 font-semibold text-faint">[{c.marker}]</span>
                  <span className="min-w-0 flex-1 truncate text-muted" title={c.snippet}>
                    {c.field_key && c.field_key !== "chunk" && c.field_key !== "graph_fact"
                      ? `${c.field_key.replace(/_/g, " ")} = ${c.value}`
                      : c.snippet}
                    {c.page_no ? <span className="text-faint"> · p.{c.page_no}</span> : null}
                  </span>
                  <ConfidenceBar value={c.confidence} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
