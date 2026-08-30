import type { ReactNode } from "react";
import { statusLabel } from "@/lib/labels";

/* ── Status pill ─────────────────────────────────────────────────────── */
const STATUS_STYLES: Record<string, string> = {
  ready:         "bg-ok-lt text-ok border-ok/20",
  verified:      "bg-ok-lt text-ok border-ok/20",
  auto_accepted: "bg-ok-lt text-ok border-ok/20",
  needs_review:  "bg-warn-lt text-warn border-warn/20",
  processing:    "bg-brand-lt text-brand border-brand/20",
  received:      "bg-surface-2 text-muted border-border",
  extracted:     "bg-surface-2 text-muted border-border",
  rejected:      "bg-danger-lt text-danger border-danger/20",
  failed:        "bg-danger-lt text-danger border-danger/20",
  draft:         "bg-warn-lt text-warn border-warn/20",
  in_review:     "bg-brand-lt text-brand border-brand/20",
  final:         "bg-ok-lt text-ok border-ok/20",
  answered:      "bg-ok-lt text-ok border-ok/20",
  insufficient:  "bg-danger-lt text-danger border-danger/20",
};

export function StatusPill({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-surface-2 text-muted border-border";
  return (
    <span className={`pill border ${cls}`} title={status}>
      {statusLabel(status)}
    </span>
  );
}

/* ── Confidence bar ──────────────────────────────────────────────────── */
export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone =
    value >= 0.75 ? "bg-ok" : value >= 0.5 ? "bg-warn" : "bg-danger";
  return (
    <span className="inline-flex items-center gap-2" title={`confidence ${pct}%`}>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-2">
        <span
          className={`block h-full rounded-full transition-[width] duration-500 ${tone}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className={`tabular-nums text-[11px] font-medium ${value >= 0.75 ? "text-ok" : value >= 0.5 ? "text-warn" : "text-danger"}`}>
        {pct}%
      </span>
    </span>
  );
}

/* ── Card ────────────────────────────────────────────────────────────── */
export function Card({
  children,
  className = "",
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div className={`cm-card overflow-hidden ${padding ? "" : ""} ${className}`}>
      {children}
    </div>
  );
}

/* ── Card section header ─────────────────────────────────────────────── */
export function CardHeader({
  title,
  subtitle,
  right,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 border-b border-border px-4 py-3 ${className}`}>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-fg">{title}</div>
        {subtitle && (
          <div className="mt-0.5 text-[11px] text-muted">{subtitle}</div>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────── */
export function EmptyState({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
      {icon && <div className="mb-1 opacity-30">{icon}</div>}
      <div className="text-[12.5px] text-muted">{children}</div>
    </div>
  );
}

/* ── Loading skeleton rows ───────────────────────────────────────────── */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="shimmer h-8 w-full" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

/* ── Info tooltip ────────────────────────────────────────────────────── */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-faint hover:text-muted cursor-help">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-48 -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] leading-snug text-fg opacity-0 shadow-md transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

/* ── Stat diff chip ──────────────────────────────────────────────────── */
export function DiffChip({ before, after }: { before: number; after: number }) {
  if (before === 0) return null;
  const delta = ((after - before) / before) * 100;
  const up = delta >= 0;
  return (
    <span className={`pill ${up ? "bg-ok-lt text-ok" : "bg-danger-lt text-danger"}`}>
      {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
    </span>
  );
}
