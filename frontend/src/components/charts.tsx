/** Small, dependency-free SVG charts. Colours come from CSS custom properties
 *  (`--k-1`..`--k-7`, `--c-*`) so every chart tracks the light/dark theme. */

import type { ReactNode } from "react";

export const KIND_COLOR = [
  "rgb(var(--k-1))",
  "rgb(var(--k-2))",
  "rgb(var(--k-3))",
  "rgb(var(--k-4))",
  "rgb(var(--k-5))",
  "rgb(var(--k-6))",
  "rgb(var(--k-7))",
];

// --------------------------------------------------------------------------- //
// horizontal bars with a label + value column
// --------------------------------------------------------------------------- //

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
  suffix?: string;
}

export function BarList({
  data,
  max,
  format = (v) => String(v),
}: {
  data: BarDatum[];
  max?: number;
  format?: (v: number) => string;
}) {
  const hi = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={d.label} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3">
          <span className="truncate text-xs text-muted" title={d.label}>
            {d.label}
          </span>
          <span className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <span
              className="block h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.max((d.value / hi) * 100, d.value > 0 ? 3 : 0)}%`,
                background: d.color ?? KIND_COLOR[i % KIND_COLOR.length],
              }}
            />
          </span>
          <span className="tabular-nums text-xs font-medium">
            {format(d.value)}
            {d.suffix ?? ""}
          </span>
        </div>
      ))}
      {data.length === 0 && <div className="text-xs text-muted">No data yet.</div>}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// donut / ring with a centre label
// --------------------------------------------------------------------------- //

export interface Segment {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  segments,
  centerValue,
  centerLabel,
  size = 132,
}: {
  segments: Segment[];
  centerValue: string;
  centerLabel: string;
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`translate(${size / 2},${size / 2}) rotate(-90)`}>
          <circle r={r} fill="none" stroke="rgb(var(--c-surface-2))" strokeWidth={12} />
          {segments.map((s) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={s.label}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={12}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return el;
          })}
        </g>
        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          className="fill-fg text-[20px] font-semibold"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {centerValue}
        </text>
        <text x="50%" y="62%" textAnchor="middle" className="fill-muted text-[10px]">
          {centerLabel}
        </text>
      </svg>
      <ul className="space-y-1 text-xs">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: s.color }}
            />
            <span className="text-muted">{s.label}</span>
            <span className="ml-auto tabular-nums font-medium">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// histogram (equal-width buckets)
// --------------------------------------------------------------------------- //

export function Histogram({
  buckets,
  height = 84,
  color = "rgb(var(--c-brand))",
}: {
  buckets: { label: string; value: number }[];
  height?: number;
  color?: string;
}) {
  const hi = Math.max(1, ...buckets.map((b) => b.value));
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {buckets.map((b) => (
        <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] tabular-nums text-muted">{b.value || ""}</span>
          <div
            className="w-full rounded-t transition-[height] duration-500"
            style={{
              height: `${(b.value / hi) * (height - 26)}px`,
              minHeight: b.value > 0 ? 3 : 0,
              background: color,
            }}
          />
          <span className="text-[9px] text-muted">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// tiny sparkline
// --------------------------------------------------------------------------- //

export function Sparkline({
  points,
  width = 120,
  height = 32,
}: {
  points: number[];
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;
  const hi = Math.max(1, ...points);
  const step = width / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${height - (p / hi) * (height - 4) - 2}`)
    .join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={d} fill="none" stroke="rgb(var(--c-brand))" strokeWidth={1.75} />
      <circle
        cx={(points.length - 1) * step}
        cy={height - (points[points.length - 1] / hi) * (height - 4) - 2}
        r={2.5}
        fill="rgb(var(--c-brand))"
      />
    </svg>
  );
}

// --------------------------------------------------------------------------- //
// section wrapper used across the visual pages
// --------------------------------------------------------------------------- //

export function Panel({
  title,
  hint,
  right,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-4 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
