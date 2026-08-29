import type { ReactNode } from "react";
import { statusLabel } from "@/lib/labels";

const STATUS_STYLES: Record<string, string> = {
  ready: "bg-ok/15 text-ok",
  verified: "bg-ok/15 text-ok",
  auto_accepted: "bg-ok/15 text-ok",
  needs_review: "bg-warn/15 text-warn",
  processing: "bg-brand/15 text-brand",
  received: "bg-surface-2 text-muted",
  extracted: "bg-surface-2 text-muted",
  rejected: "bg-danger/15 text-danger",
  failed: "bg-danger/15 text-danger",
};

export function StatusPill({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-surface-2 text-muted";
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}
      title={status}
    >
      {statusLabel(status)}
    </span>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.75 ? "bg-ok" : value >= 0.5 ? "bg-warn" : "bg-danger";
  return (
    <span className="inline-flex items-center gap-2" title={`confidence ${pct}%`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
        <span className={`block h-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums text-xs text-muted">{pct}%</span>
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-lg border border-border bg-surface ${className}`}>
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="p-8 text-center text-sm text-muted">{children}</div>;
}
