import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReviewActionKind, ReviewQueueItem } from "@/lib/types";
import { Card, ConfidenceBar, EmptyState } from "@/components/primitives";

function ReviewRow({ item }: { item: ReviewQueueItem }) {
  const qc = useQueryClient();
  const [correcting, setCorrecting] = useState(false);
  const [value, setValue] = useState(item.value_text);

  const act = useMutation({
    mutationFn: (body: { action: ReviewActionKind; value_text?: string }) =>
      api.reviewField(item.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["document", item.document_id] });
    },
  });

  return (
    <div className="border-b border-border/60 px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium">
          {item.label}
          <span className="ml-2 font-mono text-[11px] text-muted">{item.field_key}</span>
        </div>
        <ConfidenceBar value={item.confidence} />
      </div>

      <div className="mt-1 text-xs text-muted">
        {item.document_filename}
        {item.page_no ? ` · p.${item.page_no}` : ""}
        {item.source_kind === "ocr" ? " · OCR" : ""}
        {" · "}
        <a
          className="text-brand hover:underline"
          href={`${api.documentFileUrl(item.document_id)}#page=${item.page_no ?? 1}`}
          target="_blank"
          rel="noreferrer"
        >
          open source
        </a>
      </div>

      {item.source_snippet && (
        <div className="mt-2 rounded bg-surface-2 px-2 py-1 font-mono text-[11px] text-muted">
          …{item.source_snippet}…
        </div>
      )}
      {item.review_note && (
        <div className="mt-1 text-xs text-warn">⚠ {item.review_note}</div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!correcting && (
          <>
            <span className="rounded bg-surface-2 px-2 py-1 text-sm">
              {item.value_text || <em className="text-muted">empty</em>}
            </span>
            <button
              className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2 disabled:opacity-50"
              disabled={act.isPending}
              onClick={() => act.mutate({ action: "confirm" })}
            >
              Confirm
            </button>
            <button
              className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2"
              onClick={() => setCorrecting(true)}
            >
              Correct
            </button>
            <button
              className="rounded border border-border px-2 py-1 text-xs text-danger hover:bg-surface-2 disabled:opacity-50"
              disabled={act.isPending}
              onClick={() => act.mutate({ action: "reject" })}
            >
              Reject
            </button>
          </>
        )}
        {correcting && (
          <>
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="rounded border border-border bg-bg px-2 py-1 text-sm"
            />
            <button
              className="rounded bg-brand px-2 py-1 text-xs text-brand-fg disabled:opacity-50"
              disabled={act.isPending || !value.trim()}
              onClick={() => act.mutate({ action: "correct", value_text: value })}
            >
              Save
            </button>
            <button
              className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2"
              onClick={() => {
                setCorrecting(false);
                setValue(item.value_text);
              }}
            >
              Cancel
            </button>
          </>
        )}
        {act.isError && <span className="text-xs text-danger">save failed</span>}
      </div>
    </div>
  );
}

export function ReviewQueue() {
  const { data, isLoading } = useQuery({
    queryKey: ["review-queue"],
    queryFn: () => api.reviewQueue({ limit: 200 }),
    refetchInterval: 5000,
  });

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Review queue</h2>
        <span className="text-xs text-muted">{data?.total ?? 0} fields need verification</span>
      </div>
      {isLoading && <EmptyState>Loading…</EmptyState>}
      {data && data.items.length === 0 && (
        <EmptyState>Nothing to review — every extracted field is above threshold or verified.</EmptyState>
      )}
      {data && data.items.map((it) => <ReviewRow key={it.id} item={it} />)}
    </Card>
  );
}
