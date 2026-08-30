import type { ReactNode } from "react";

/* ── Page shell ───────────────────────────────────────────────────────── */
/** Consistent page shell capped at 1400 px with dense spacing. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1400px] space-y-4">{children}</div>;
}

/* ── Page header ─────────────────────────────────────────────────────── */
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
        <h1 className="text-[17px] font-bold tracking-tight text-fg">{title}</h1>
        {children && (
          <p className="mt-0.5 max-w-[72ch] text-[12.5px] leading-relaxed text-muted">
            {children}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ── 12-column grid ──────────────────────────────────────────────────── */
export function Grid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-4 lg:grid-cols-12 ${className}`}>{children}</div>
  );
}

const SPAN: Record<number, string> = {
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
  7: "lg:col-span-7",
  8: "lg:col-span-8",
  9: "lg:col-span-9",
  10: "lg:col-span-10",
  12: "lg:col-span-12",
};

export function Col({
  span = 6,
  children,
  className = "",
}: {
  span?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 12;
  children: ReactNode;
  className?: string;
}) {
  return <div className={`min-w-0 ${SPAN[span] ?? ""} ${className}`}>{children}</div>;
}

/* ── KPI card ────────────────────────────────────────────────────────── */
const KPI_TONE: Record<string, { value: string; bg: string; dot: string }> = {
  fg:     { value: "text-fg",     bg: "",                   dot: "bg-faint"  },
  ok:     { value: "text-ok",     bg: "bg-ok-lt/60",        dot: "bg-ok"     },
  warn:   { value: "text-warn",   bg: "bg-warn-lt/60",      dot: "bg-warn"   },
  danger: { value: "text-danger", bg: "bg-danger-lt/60",    dot: "bg-danger" },
  brand:  { value: "text-brand",  bg: "bg-brand-lt/60",     dot: "bg-brand"  },
  info:   { value: "text-info",   bg: "bg-info-lt/60",      dot: "bg-info"   },
};

export function Kpi({
  label,
  value,
  sub,
  tone = "fg",
  onClick,
  icon,
  trend,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "fg" | "ok" | "warn" | "danger" | "brand" | "info";
  onClick?: () => void;
  icon?: ReactNode;
  /** positive = up (ok), negative = down (danger), 0 = flat */
  trend?: number;
}) {
  const t = KPI_TONE[tone] ?? KPI_TONE.fg;

  const TrendArrow = () => {
    if (trend == null) return null;
    if (trend > 0)
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="trend-up">
          <polyline points="18 15 12 9 6 15"/>
        </svg>
      );
    if (trend < 0)
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="trend-down">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      );
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="trend-flat">
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    );
  };

  const base = `cm-card flex flex-col gap-1.5 p-3 transition-all duration-150 ${t.bg}`;
  const inner = (
    <>
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-muted">
          {label}
        </span>
        {icon && <span className="shrink-0 opacity-40">{icon}</span>}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className={`metric-md tabular-nums ${t.value}`}>{value}</span>
        {trend != null && <TrendArrow />}
      </div>
      {sub && (
        <div className="truncate text-[11px] text-faint">{sub}</div>
      )}
    </>
  );

  return onClick ? (
    <button onClick={onClick} className={`${base} text-left hover:border-brand hover:shadow-sm cursor-pointer`}>
      {inner}
    </button>
  ) : (
    <div className={base}>{inner}</div>
  );
}

export function KpiRow({ children, cols = 6 }: { children: ReactNode; cols?: 3 | 4 | 5 | 6 }) {
  const gridCols: Record<number, string> = {
    3: "grid-cols-1 sm:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-4",
    5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
    6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
  };
  return (
    <div className={`grid gap-3 ${gridCols[cols] ?? gridCols[6]}`}>{children}</div>
  );
}

/* ── Section divider ─────────────────────────────────────────────────── */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-widest text-muted">
      <span className="h-px flex-1 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border" />
    </h2>
  );
}

/* ── Tab bar ─────────────────────────────────────────────────────────── */
export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; count?: number }[];
  active: T;
  onChange: (k: T) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={[
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all duration-150",
            active === t.key
              ? "bg-surface text-fg shadow-xs"
              : "text-muted hover:text-fg",
          ].join(" ")}
        >
          {t.label}
          {t.count != null && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                active === t.key ? "bg-brand/10 text-brand" : "bg-surface-3 text-faint"
              }`}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ── Action button variants ──────────────────────────────────────────── */
export function Btn({
  children,
  onClick,
  disabled,
  variant = "secondary",
  size = "sm",
  className = "",
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "xs" | "sm" | "md";
  className?: string;
  title?: string;
  type?: "button" | "submit" | "reset";
}) {
  const variants: Record<string, string> = {
    primary: "bg-brand text-brand-fg border-brand hover:bg-brand/90",
    secondary: "bg-surface text-fg border-border hover:bg-surface-2",
    ghost: "bg-transparent text-muted border-transparent hover:bg-surface-2 hover:text-fg",
    danger: "bg-surface text-danger border-danger/30 hover:bg-danger-lt",
  };
  const sizes: Record<string, string> = {
    xs: "px-2 py-1 text-[11px]",
    sm: "px-3 py-1.5 text-[12px]",
    md: "px-4 py-2 text-[13px]",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        "inline-flex items-center gap-1.5 rounded-md border font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}
