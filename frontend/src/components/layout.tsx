import type { ReactNode } from "react";

/** Consistent page shell — capped so content stays dense rather than stretched
 *  thin across a wide monitor. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1320px] space-y-3">{children}</div>;
}

/** Standard title block. `actions` sits on the right on wide screens. */
export function PageHeader({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {children && <p className="mt-1 max-w-[75ch] text-sm text-muted">{children}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** 12-column responsive grid. Children use `Col span={n}`. Collapses to 1 col
 *  under `sm`, 6-col under `lg`. */
export function Grid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-3 lg:grid-cols-12 ${className}`}>{children}</div>
  );
}

const SPAN: Record<number, string> = {
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
  7: "lg:col-span-7",
  8: "lg:col-span-8",
  9: "lg:col-span-9",
  12: "lg:col-span-12",
};

export function Col({
  span = 6,
  children,
  className = "",
}: {
  span?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;
  children: ReactNode;
  className?: string;
}) {
  return <div className={`min-w-0 ${SPAN[span]} ${className}`}>{children}</div>;
}

/** Compact KPI card — big number, label, optional delta / sub. */
export function Kpi({
  label,
  value,
  sub,
  tone = "fg",
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "fg" | "ok" | "warn" | "danger" | "brand";
  onClick?: () => void;
}) {
  const color = {
    fg: "text-fg",
    ok: "text-ok",
    warn: "text-warn",
    danger: "text-danger",
    brand: "text-brand",
  }[tone];
  const base =
    "rounded-lg border border-border bg-surface px-3 py-2 text-left transition-colors";
  const inner = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[10px] uppercase tracking-wide text-muted">
          {label}
        </span>
        <span className={`text-lg font-semibold leading-none tabular-nums ${color}`}>
          {value}
        </span>
      </div>
      {sub && <div className="mt-0.5 truncate text-[10px] text-muted">{sub}</div>}
    </>
  );
  return onClick ? (
    <button onClick={onClick} className={`${base} block w-full hover:border-brand`}>
      {inner}
    </button>
  ) : (
    <div className={base}>{inner}</div>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{children}</div>
  );
}
