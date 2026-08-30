/**
 * CoalMind AI — Chart component library
 * Pure SVG + CSS, zero external chart dependencies.
 * All colours resolve from CSS custom properties so light/dark theming is free.
 */

import type { ReactNode } from "react";

/* ── Colour palette (matches index.css --k-n) ────────────────────────── */
export const KIND_COLOR = [
  "rgb(var(--k-1))",
  "rgb(var(--k-2))",
  "rgb(var(--k-3))",
  "rgb(var(--k-4))",
  "rgb(var(--k-5))",
  "rgb(var(--k-6))",
  "rgb(var(--k-7))",
];

/* ══════════════════════════════════════════════════════════════════════
   PANEL — standard section wrapper
   ════════════════════════════════════════════════════════════════════ */
export function Panel({
  title,
  hint,
  right,
  children,
  className = "",
  noPad = false,
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  noPad?: boolean;
}) {
  return (
    <section className={`cm-card overflow-hidden ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
          {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      <div className={noPad ? "" : "p-4"}>{children}</div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   BAR LIST — horizontal progress bars with label + value
   ════════════════════════════════════════════════════════════════════ */
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
  if (data.length === 0)
    return <div className="text-[12px] text-muted">No data yet.</div>;
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={d.label} className="grid grid-cols-[10rem_1fr_auto] items-center gap-3">
          <span className="truncate text-[12px] text-muted" title={d.label}>
            {d.label}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-2">
            <span
              className="block h-full rounded-full transition-[width] duration-700"
              style={{
                width: `${Math.max((d.value / hi) * 100, d.value > 0 ? 2 : 0)}%`,
                background: d.color ?? KIND_COLOR[i % KIND_COLOR.length],
              }}
            />
          </span>
          <span className="tabular-nums text-[12px] font-semibold">
            {format(d.value)}
            {d.suffix ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   DONUT — ring chart with center label + inline legend
   ════════════════════════════════════════════════════════════════════ */
export interface Segment {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  segments,
  centerValue,
  centerLabel,
  size = 128,
}: {
  segments: Segment[];
  centerValue: string;
  centerLabel: string;
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`translate(${size / 2},${size / 2}) rotate(-90)`}>
          <circle r={r} fill="none" stroke="rgb(var(--c-surface-2))" strokeWidth={14} />
          {segments.map((s) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={s.label}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={14}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return el;
          })}
        </g>
        <text x="50%" y="44%" textAnchor="middle" dominantBaseline="middle"
          className="fill-fg text-[18px] font-bold" style={{ fontSize: 18, fontWeight: 700, fill: "rgb(var(--c-fg))" }}>
          {centerValue}
        </text>
        <text x="50%" y="62%" textAnchor="middle"
          style={{ fontSize: 10, fill: "rgb(var(--c-muted))" }}>
          {centerLabel}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-[12px]">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-muted">{s.label}</span>
            <span className="tabular-nums font-semibold">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   HISTOGRAM — equal-width vertical bars
   ════════════════════════════════════════════════════════════════════ */
export function Histogram({
  buckets,
  height = 80,
  color = "rgb(var(--c-brand))",
}: {
  buckets: { label: string; value: number }[];
  height?: number;
  color?: string;
}) {
  const hi = Math.max(1, ...buckets.map((b) => b.value));
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {buckets.map((b) => (
        <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
          {b.value > 0 && (
            <span className="text-[9px] tabular-nums text-muted leading-none">{b.value}</span>
          )}
          <div
            className="w-full rounded-t transition-[height] duration-700"
            style={{
              height: `${(b.value / hi) * (height - 28)}px`,
              minHeight: b.value > 0 ? 3 : 0,
              background: color,
              opacity: 0.85,
            }}
          />
          <span className="text-[9px] text-muted leading-none">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   SPARKLINE — tiny inline trend line
   ════════════════════════════════════════════════════════════════════ */
export function Sparkline({
  points,
  width = 80,
  height = 28,
  color,
  filled = false,
}: {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
  filled?: boolean;
}) {
  if (points.length < 2) return null;
  const hi = Math.max(1, ...points);
  const lo = Math.min(...points);
  const range = hi - lo || 1;
  const pad = 3;
  const step = width / (points.length - 1);
  const toY = (p: number) => height - pad - ((p - lo) / range) * (height - pad * 2);
  const pts = points.map((p, i) => [i * step, toY(p)] as [number, number]);
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const fillD = `${d} L${pts[pts.length - 1][0]} ${height} L0 ${height} Z`;
  const stroke = color ?? "rgb(var(--c-brand))";
  const last = pts[pts.length - 1];

  return (
    <svg width={width} height={height} className="overflow-visible">
      {filled && (
        <path d={fillD} fill={stroke} fillOpacity="0.12" />
      )}
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.75} />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={stroke} />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   LINE CHART — multi-series time-series with axis labels
   ════════════════════════════════════════════════════════════════════ */
export interface LineSeries {
  label: string;
  points: number[];
  color?: string;
}

export function LineChart({
  series,
  xLabels,
  height = 180,
  showLegend = true,
  yFormat = (v) => String(v),
}: {
  series: LineSeries[];
  xLabels?: string[];
  height?: number;
  showLegend?: boolean;
  yFormat?: (v: number) => string;
}) {
  const allPoints = series.flatMap((s) => s.points);
  const hi = Math.max(1, ...allPoints);
  const lo = 0;
  const range = hi - lo || 1;
  const padL = 36;
  const padR = 8;
  const padT = 8;
  const padB = 24;
  const W = 560;
  const H = height;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const toX = (i: number, total: number) => padL + (i / (total - 1)) * chartW;
  const toY = (v: number) => padT + chartH - ((v - lo) / range) * chartH;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * range);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} className="overflow-visible">
        {/* grid lines */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={padL} y1={toY(v)} x2={W - padR} y2={toY(v)}
              stroke="rgb(var(--c-border))" strokeWidth={0.75} strokeDasharray="3 3"
            />
            <text
              x={padL - 4} y={toY(v)}
              textAnchor="end" dominantBaseline="middle"
              style={{ fontSize: 9, fill: "rgb(var(--c-faint))" }}
            >
              {yFormat(Math.round(v))}
            </text>
          </g>
        ))}
        {/* x-axis labels */}
        {xLabels && xLabels.map((lbl, i) => (
          <text
            key={i}
            x={toX(i, xLabels.length)} y={H - 4}
            textAnchor="middle"
            style={{ fontSize: 9, fill: "rgb(var(--c-faint))" }}
          >
            {lbl}
          </text>
        ))}
        {/* series lines */}
        {series.map((s, si) => {
          const color = s.color ?? KIND_COLOR[si % KIND_COLOR.length];
          if (s.points.length < 2) return null;
          const d = s.points
            .map((v, i) => `${i === 0 ? "M" : "L"}${toX(i, s.points.length).toFixed(1)} ${toY(v).toFixed(1)}`)
            .join(" ");
          const fillD = `${d} L${toX(s.points.length - 1, s.points.length)} ${padT + chartH} L${padL} ${padT + chartH} Z`;
          return (
            <g key={s.label}>
              <path d={fillD} fill={color} fillOpacity="0.08" />
              <path d={d} fill="none" stroke={color} strokeWidth={2} />
              <circle
                cx={toX(s.points.length - 1, s.points.length)}
                cy={toY(s.points[s.points.length - 1])}
                r={3}
                fill={color}
              />
            </g>
          );
        })}
      </svg>
      {showLegend && series.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-3">
          {series.map((s, i) => (
            <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="inline-block h-2 w-4 rounded-full" style={{ background: s.color ?? KIND_COLOR[i % KIND_COLOR.length] }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STACKED BAR — grouped / stacked vertical bars
   ════════════════════════════════════════════════════════════════════ */
export interface StackedBarGroup {
  label: string;
  values: number[];  // one per series
}

export function StackedBar({
  groups,
  seriesLabels,
  colors,
  height = 140,
  format = (v) => String(v),
}: {
  groups: StackedBarGroup[];
  seriesLabels: string[];
  colors?: string[];
  height?: number;
  format?: (v: number) => string;
}) {
  const hi = Math.max(1, ...groups.map((g) => g.values.reduce((a, b) => a + b, 0)));
  const cols = colors ?? KIND_COLOR;
  const padT = 8;
  const padB = 20;
  const chartH = height - padT - padB;

  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {groups.map((g) => {
          const total = g.values.reduce((a, b) => a + b, 0);
          return (
            <div key={g.label} className="flex flex-1 flex-col items-center">
              <div
                className="flex w-full flex-col-reverse overflow-hidden rounded-t"
                style={{ height: `${(total / hi) * chartH}px`, minHeight: total > 0 ? 3 : 0, gap: 1 }}
                title={format(total)}
              >
                {g.values.map((v, i) => (
                  <div
                    key={i}
                    className="w-full shrink-0 transition-[height] duration-700"
                    style={{
                      height: `${(v / Math.max(total, 1)) * 100}%`,
                      background: cols[i % cols.length],
                      opacity: 0.9,
                    }}
                    title={`${seriesLabels[i] ?? i}: ${format(v)}`}
                  />
                ))}
              </div>
              <div className="mt-1 truncate text-[9px] text-muted" style={{ maxWidth: "100%" }}>
                {g.label}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-3">
        {seriesLabels.map((lbl, i) => (
          <span key={lbl} className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="inline-block h-2 w-2.5 rounded-[2px]" style={{ background: cols[i % cols.length] }} />
            {lbl}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   RADIAL PROGRESS — circular gauge for a single percentage
   ════════════════════════════════════════════════════════════════════ */
export function RadialProgress({
  value,
  label,
  size = 80,
  strokeWidth = 10,
  color,
  bgColor,
}: {
  value: number; // 0–1
  label?: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, value));
  const stroke = color ?? (pct >= 0.75 ? "rgb(var(--c-ok))" : pct >= 0.5 ? "rgb(var(--c-warn))" : "rgb(var(--c-danger))");
  const bg = bgColor ?? "rgb(var(--c-surface-2))";
  const display = `${Math.round(pct * 100)}%`;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={bg} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={stroke} strokeWidth={strokeWidth}
          strokeDasharray={`${pct * c} ${(1 - pct) * c}`}
          strokeDashoffset={c * 0.25}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
          style={{ fontSize: size * 0.22, fontWeight: 700, fill: stroke }}>
          {display}
        </text>
      </svg>
      {label && <div className="text-center text-[11px] text-muted leading-tight">{label}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MINI KPI SPARK — compact card with sparkline trend
   ════════════════════════════════════════════════════════════════════ */
export function MiniSpark({
  label,
  value,
  points,
  color,
  unit = "",
}: {
  label: string;
  value: string | number;
  points: number[];
  color?: string;
  unit?: string;
}) {
  const trend =
    points.length >= 2
      ? points[points.length - 1] - points[points.length - 2]
      : 0;
  const toneClass = trend > 0 ? "text-ok" : trend < 0 ? "text-danger" : "text-faint";
  return (
    <div className="cm-card flex items-center gap-3 p-3">
      <div className="flex-1 min-w-0">
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted truncate">{label}</div>
        <div className={`metric-md tabular-nums mt-0.5 ${toneClass}`}>
          {value}{unit}
        </div>
      </div>
      <Sparkline points={points} color={color} filled width={70} height={28} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   SEVERITY MATRIX — 3×N grid visualizing severity × count
   ════════════════════════════════════════════════════════════════════ */
export function SeverityMatrix({
  data,
}: {
  data: { label: string; high: number; medium: number; low: number }[];
}) {
  const maxVal = Math.max(1, ...data.flatMap((d) => [d.high, d.medium, d.low]));
  return (
    <div className="space-y-1.5">
      {data.map((row) => (
        <div key={row.label} className="grid grid-cols-[8rem_1fr_1fr_1fr] items-center gap-2 text-[12px]">
          <span className="truncate text-muted">{row.label}</span>
          {(["high", "medium", "low"] as const).map((sev) => {
            const val = row[sev];
            const opacity = val === 0 ? 0.08 : 0.15 + (val / maxVal) * 0.7;
            const bg = sev === "high" ? `rgb(var(--c-danger))` : sev === "medium" ? `rgb(var(--c-warn))` : `rgb(var(--c-faint))`;
            return (
              <div
                key={sev}
                className="flex h-7 items-center justify-center rounded text-[11px] font-semibold"
                style={{ background: bg, opacity, color: "rgb(var(--c-fg))" }}
                title={`${row.label} ${sev}: ${val}`}
              >
                {val > 0 ? val : ""}
              </div>
            );
          })}
        </div>
      ))}
      <div className="grid grid-cols-[8rem_1fr_1fr_1fr] gap-2 text-[10px] text-faint mt-1">
        <span />
        <span className="text-center">High</span>
        <span className="text-center">Medium</span>
        <span className="text-center">Low</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   PROGRESS STEPS — horizontal pipeline step tracker
   ════════════════════════════════════════════════════════════════════ */
export function ProgressSteps({
  steps,
}: {
  steps: { label: string; value: number | string; sub?: string; color: string; to?: string }[];
}) {
  return (
    <div className="flex items-stretch gap-0">
      {steps.map((s, i) => (
        <div key={s.label} className="flex flex-1 items-stretch">
          <div className="flex flex-1 flex-col gap-1 rounded-none p-3 relative">
            <span
              className="absolute top-0 left-0 right-0 h-0.5 rounded-full"
              style={{ background: s.color }}
            />
            <span className="text-[18px] font-bold tabular-nums leading-none" style={{ color: s.color }}>
              {s.value}
            </span>
            <span className="text-[11.5px] font-medium text-fg truncate">{s.label}</span>
            {s.sub && <span className="text-[10.5px] text-muted truncate">{s.sub}</span>}
          </div>
          {i < steps.length - 1 && (
            <div className="flex items-center px-1 text-border">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
