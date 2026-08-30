import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReviewActionKind, ReviewQueueItem } from "@/lib/types";
import { Card, CardHeader, ConfidenceBar, EmptyState, SkeletonRows } from "@/components/primitives";
import { Btn } from "@/components/layout";

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
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
      qc.invalidateQueries({ queryKey: ["document", item.document_id] });
    },
  });

  return (
    <div className="border-b border-border/60 px-4 py-3 last:border-0 hover:bg-surface-2/40 transition-colors">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-[13px] font-semibold" title={item.field_key}>
          {item.label}
        </span>
        <ConfidenceBar value={item.confidence} />
      </div>

      {/* Source */}
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <span>
          <span className="text-fg font-medium">{item.document_filename}</span>
          {item.page_no ? `, p.${item.page_no}` : ""}
          {item.source_kind === "ocr" ? " · scan" : ""}
        </span>
        <span className="text-border">·</span>
        <a
          className="text-brand hover:underline"
          href={`${api.documentFileUrl(item.document_id)}#page=${item.page_no ?? 1}`}
          target="_blank"
          rel="noreferrer"
        >
          View source
        </a>
      </div>

      {/* Snippet */}
      {item.source_snippet && (
        <div className="mt-1.5 rounded border-l-2 border-brand/30 bg-surface-2 pl-2.5 pr-2 py-1 font-mono text-[11px] text-muted">
          …{item.source_snippet}…
        </div>
      )}

      {/* Why flagged */}
      {item.review_note && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-warn">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          {item.review_note}
        </div>
      )}

      {/* Actions */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {!correcting ? (
          <>
            <span className="rounded bg-surface-2 px-2 py-1 text-[12.5px] font-medium border border-border">
              {item.value_text || <em className="text-faint font-normal">empty</em>}
            </span>
            <Btn
              size="xs"
              variant="secondary"
              disabled={act.isPending}
              onClick={() => act.mutate({ action: "confirm" })}
            >
              ✓ Confirm
            </Btn>
            <Btn
              size="xs"
              variant="ghost"
              onClick={() => setCorrecting(true)}
            >
              Edit
            </Btn>
            <Btn
              size="xs"
              variant="danger"
              disabled={act.isPending}
              onClick={() => act.mutate({ action: "reject" })}
            >
              Reject
            </Btn>
          </>
        ) : (
          <>
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="rounded border border-brand bg-bg px-2 py-1 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <Btn
              size="xs"
              variant="primary"
              disabled={act.isPending || !value.trim()}
              onClick={() => act.mutate({ action: "correct", value_text: value })}
            >
              Save
            </Btn>
            <Btn
              size="xs"
              variant="ghost"
              onClick={() => { setCorrecting(false); setValue(item.value_text); }}
            >
              Cancel
            </Btn>
          </>
        )}
        {act.isError && <span className="text-[11px] text-danger">save failed</span>}
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

  const waiting = data?.total ?? 0;

  return (
    <Card padding={false} className="flex flex-col max-h-[70vh]">
      <CardHeader
        title="Review queue"
        subtitle="Confirm, correct, or reject each low-confidence value"
        right={
          <span className={`pill ${waiting > 0 ? "bg-warn-lt text-warn" : "bg-ok-lt text-ok"}`}>
            {waiting > 0 ? `${waiting} waiting` : "all clear"}
          </span>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {isLoading && <SkeletonRows rows={4} />}
        {data && data.items.length === 0 && (
          <EmptyState
            icon={
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="9 11 12 14 22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
            }
          >
            Nothing to review right now. Low-confidence values appear here after
            documents are processed.
          </EmptyState>
        )}
        {data?.items.map((it) => <ReviewRow key={it.id} item={it} />)}
      </div>
    </Card>
  );
}
