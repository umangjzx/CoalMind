import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SearchResponse } from "@/lib/types";
import { Card } from "@/components/primitives";

const EXAMPLES = [
  "manganese reserve estimate revision",
  "belt conveyor damage and safety",
  "coal production shortfall eastern subsidiaries",
];

export function SemanticSearch() {
  const [q, setQ] = useState("");
  const search = useMutation({
    mutationFn: (query: string) => api.semanticSearch(query, 6),
  });
  const data = search.data as SearchResponse | undefined;

  function run(query: string) {
    setQ(query);
    if (query.trim().length >= 2) search.mutate(query);
  }

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold">Semantic search</h2>
      <p className="mt-1 text-xs text-muted">
        Vector search over embedded document text — matches by meaning, not keywords.
      </p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. reserve estimate revised after 2019"
          className="flex-1 rounded border border-border bg-bg px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={search.isPending || q.trim().length < 2}
          className="rounded bg-brand px-3 py-1.5 text-sm text-brand-fg disabled:opacity-50"
        >
          {search.isPending ? "…" : "Search"}
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => run(ex)}
            className="rounded-full border border-border px-2 py-0.5 text-xs text-muted hover:bg-surface-2"
          >
            {ex}
          </button>
        ))}
      </div>

      {data && (
        <ul className="mt-3 space-y-2">
          {data.hits.map((h) => (
            <li key={h.chunk_id} className="rounded border border-border p-2">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  {h.document_filename}
                  {h.doc_type ? ` · ${h.doc_type.replace(/_/g, " ")}` : ""}
                  {h.page_no ? ` · p.${h.page_no}` : ""}
                </span>
                <span className="tabular-nums">score {h.score.toFixed(3)}</span>
              </div>
              <p className="mt-1 line-clamp-3 text-sm">{h.text}</p>
              <a
                className="mt-1 inline-block text-xs text-brand hover:underline"
                href={`${api.documentFileUrl(h.document_id)}#page=${h.page_no ?? 1}`}
                target="_blank"
                rel="noreferrer"
              >
                open source
              </a>
            </li>
          ))}
          {data.hits.length === 0 && (
            <li className="text-sm text-muted">No matches.</li>
          )}
        </ul>
      )}
      {search.isError && (
        <div className="mt-2 text-xs text-danger">search failed — is the embedder up?</div>
      )}
    </Card>
  );
}
