import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import type { AdminOverview } from "@/lib/types";
import { DEPENDENCY_LABELS, docTypeLabel, healthWord, statusLabel } from "@/lib/labels";
import { BarList, Donut, Panel } from "@/components/charts";
import { Col, Grid, Kpi, KpiRow, Page, PageHeader } from "@/components/layout";
import { PipelineFlow } from "./PipelineFlow";

function sum(rec: Record<string, number> | undefined): number {
  return Object.values(rec ?? {}).reduce((a, b) => a + b, 0);
}

/* ── System health panel ─────────────────────────────────────────────── */
function SystemHealth() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const version = useQuery({ queryKey: ["version"], queryFn: api.version });

  const checks = Object.entries(health.data?.checks ?? {});
  const allOk = checks.length > 0 && checks.every(([, v]) => v === "ok");

  return (
    <Panel
      title="System status"
      hint={allOk ? "All services operational" : "Some services need attention"}
      className="h-full"
      right={
        <span className={`pill ${allOk ? "bg-ok-lt text-ok" : "bg-warn-lt text-warn"}`}>
          {allOk ? "● Healthy" : "⚠ Degraded"}
        </span>
      }
    >
      {health.isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="shimmer h-6 rounded" />
          ))}
        </div>
      )}
      {health.isError && (
        <p className="text-[12px] text-danger">Can't reach the backend.</p>
      )}
      <ul className="space-y-2">
        {checks.map(([k, v]) => (
          <li key={k} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[12.5px]">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  v === "ok" ? "bg-ok" : v === "down" ? "bg-danger" : "bg-warn"
                }`}
              />
              {DEPENDENCY_LABELS[k] ?? k}
            </span>
            <span className={`text-[11px] font-medium ${v === "ok" ? "text-ok" : v === "down" ? "text-danger" : "text-warn"}`}>
              {healthWord(v)}
            </span>
          </li>
        ))}
      </ul>
      {version.data && (
        <div className="mt-3 border-t border-border pt-3 text-[11px] text-muted space-y-0.5">
          <div>
            {version.data.allow_third_party_api
              ? `AI: ${version.data.llm_provider} (hosted)`
              : "Runs fully on-premises"}
          </div>
          <div className="font-mono text-faint">v{version.data.version}</div>
        </div>
      )}
    </Panel>
  );
}

/* ── Attention items ─────────────────────────────────────────────────── */
function AttentionCard({
  to,
  title,
  count,
  tone,
  description,
  items,
}: {
  to: string;
  title: string;
  count: number | string;
  tone: "warn" | "danger";
  description: string;
  items?: { label: string; severity?: string }[];
}) {
  const colors = {
    warn: {
      ring: "border-warn/30 hover:border-warn",
      num: "text-warn",
      bg: "bg-warn-lt/50",
    },
    danger: {
      ring: "border-danger/30 hover:border-danger",
      num: "text-danger",
      bg: "bg-danger-lt/50",
    },
  }[tone];

  return (
    <Link
      to={to}
      className={`cm-card block p-4 transition-all duration-150 hover:shadow-sm ${colors.ring}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">{title}</div>
          <p className="mt-0.5 text-[11.5px] text-muted">{description}</p>
        </div>
        <span className={`metric-xl tabular-nums shrink-0 ${colors.num}`}>{count}</span>
      </div>
      {items && items.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-border/50 pt-2.5">
          {items.slice(0, 4).map((it, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px]">
              <span
                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                  it.severity === "high"
                    ? "bg-danger"
                    : it.severity === "medium"
                      ? "bg-warn"
                      : "bg-muted"
                }`}
              />
              <span className="truncate text-muted">{it.label}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 text-[11px] font-medium text-brand">Review →</div>
    </Link>
  );
}

/* ── Document collection breakdown ──────────────────────────────────── */
function CollectionBreakdown({ o }: { o: AdminOverview | undefined }) {
  const byStatus = o?.documents_by_status ?? {};
  const total = sum(byStatus);
  const failed = byStatus.failed ?? 0;
  const pending = byStatus.needs_review ?? 0;

  return (
    <Panel
      title="Collection"
      hint={`${total} document${total === 1 ? "" : "s"} by processing state`}
      className="h-full"
      right={
        <span
          className={`pill ${
            failed > 0
              ? "bg-danger-lt text-danger"
              : pending > 0
                ? "bg-warn-lt text-warn"
                : "bg-ok-lt text-ok"
          }`}
        >
          {failed > 0
            ? `${failed} failed`
            : pending > 0
              ? `${pending} in review`
              : "all processed"}
        </span>
      }
    >
      <BarList
        data={Object.entries(byStatus)
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .map(([k, v]) => ({
            label: statusLabel(k),
            value: v as number,
            color:
              k === "failed"
                ? "rgb(var(--c-danger))"
                : k === "needs_review"
                  ? "rgb(var(--c-warn))"
                  : k === "ready"
                    ? "rgb(var(--c-ok))"
                    : "rgb(var(--c-brand))",
          }))}
      />
    </Panel>
  );
}

/* ── Confidence quality panel ────────────────────────────────────────── */
function ConfidencePanel() {
  const quality = useQuery({
    queryKey: ["admin-quality"],
    queryFn: api.adminExtractionQuality,
  });

  return (
    <Panel
      title="Extraction quality"
      hint="average confidence by document type"
      className="h-full"
    >
      {quality.data ? (
        <BarList
          max={1}
          format={(v) => `${Math.round(v * 100)}%`}
          data={Object.entries(quality.data.by_doc_type)
            .sort((a, b) => b[1].mean_confidence - a[1].mean_confidence)
            .map(([t, v]) => ({
              label: docTypeLabel(t),
              value: v.mean_confidence,
              color:
                v.mean_confidence >= 0.75
                  ? "rgb(var(--c-ok))"
                  : v.mean_confidence >= 0.6
                    ? "rgb(var(--c-warn))"
                    : "rgb(var(--c-danger))",
            }))}
        />
      ) : (
        <p className="text-[12px] text-muted">No extraction data yet.</p>
      )}
    </Panel>
  );
}

/* ── Fields status donut ─────────────────────────────────────────────── */
function FieldsDonut({
  fs,
  fieldsTotal,
  trusted,
  docCount,
}: {
  fs: Record<string, number>;
  fieldsTotal: number;
  trusted: number;
  docCount: number;
}) {
  const segments = [
    { label: "Confirmed by a person", value: fs.verified ?? 0, color: "rgb(var(--k-6))" },
    { label: "Accepted automatically", value: fs.auto_accepted ?? 0, color: "rgb(var(--k-1))" },
    { label: "Waiting for review", value: fs.needs_review ?? 0, color: "rgb(var(--c-warn))" },
    { label: "Rejected", value: fs.rejected ?? 0, color: "rgb(var(--c-danger))" },
  ].filter((s) => s.value > 0);

  return (
    <Panel
      title="Extracted values"
      hint={`${fieldsTotal} values from ${docCount} document${docCount === 1 ? "" : "s"}`}
      className="h-full"
    >
      {segments.length > 0 ? (
        <Donut
          segments={segments}
          centerValue={`${fieldsTotal ? Math.round((trusted / fieldsTotal) * 100) : 0}%`}
          centerLabel="cleared"
          size={120}
        />
      ) : (
        <p className="text-[12px] text-muted">No values extracted yet.</p>
      )}
    </Panel>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */
export function DashboardPage() {
  const nav = useNavigate();
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: api.adminOverview });
  const anomalies = useQuery({
    queryKey: ["anomalies", "open"],
    queryFn: () => api.anomalies({ status: "open", limit: 6 }),
  });

  const o = overview.data;
  const reviewCount = o?.review_queue ?? 0;
  const openAnomalies = anomalies.data?.open_count ?? 0;
  const allClear = !overview.isLoading && reviewCount === 0 && openAnomalies === 0;

  const fs = o?.fields_by_status ?? {};
  const fieldsTotal = sum(fs);
  const trusted = (fs.verified ?? 0) + (fs.auto_accepted ?? 0);
  const docCount = sum(o?.documents_by_status);
  const highSeverity = anomalies.data?.items.filter((a) => a.severity === "high").length ?? 0;

  return (
    <Page>
      <PageHeader title="Dashboard">
        The state of the document collection, and anything that needs your attention.
      </PageHeader>

      {/* ── KPI row ──────────────────────────────────────────────── */}
      <KpiRow>
        <Kpi
          label="Documents"
          value={docCount || "—"}
          sub={`${o?.documents_by_status?.processing ?? 0} processing`}
          onClick={() => nav("/ingestion")}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
          }
        />
        <Kpi
          label="Values extracted"
          value={fieldsTotal || "—"}
          sub={`${fs.needs_review ?? 0} waiting review`}
          tone={fieldsTotal > 0 ? "brand" : "fg"}
          onClick={() => nav("/knowledge")}
        />
        <Kpi
          label="To review"
          value={reviewCount}
          tone={reviewCount > 0 ? "warn" : "ok"}
          sub={reviewCount > 0 ? "needs attention" : "all clear"}
          onClick={() => nav("/ingestion")}
        />
        <Kpi
          label="Open anomalies"
          value={anomalies.data ? openAnomalies : "—"}
          tone={openAnomalies > 0 ? "danger" : "ok"}
          sub={highSeverity > 0 ? `${highSeverity} high severity` : "none critical"}
          onClick={() => nav("/anomalies")}
        />
        <Kpi
          label="Reports"
          value={sum(o?.reports_by_status) || 0}
          sub={`${o?.reports_by_status?.final ?? 0} finalised`}
          tone="fg"
          onClick={() => nav("/reports")}
        />
        <Kpi
          label="Saved answers"
          value={o?.qa_by_status?.verified ?? 0}
          tone="ok"
          sub="reused instantly"
          onClick={() => nav("/query")}
        />
      </KpiRow>

      {/* ── Pipeline ─────────────────────────────────────────────── */}
      <PipelineFlow o={o} />

      {/* ── Three-column analysis row ─────────────────────────────── */}
      <Grid>
        <Col span={5}>
          <FieldsDonut fs={fs} fieldsTotal={fieldsTotal} trusted={trusted} docCount={docCount} />
        </Col>
        <Col span={4}>
          <ConfidencePanel />
        </Col>
        <Col span={3}>
          <SystemHealth />
        </Col>
      </Grid>

      {/* ── Attention + collection row ───────────────────────────── */}
      <Grid>
        <Col span={8}>
          <div className="space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-widest text-muted">
              Needs attention
            </h2>
            {allClear ? (
              <div className="cm-card p-6 text-center">
                <div className="text-[28px] mb-2">✓</div>
                <div className="text-[13px] font-medium text-ok">You're all caught up</div>
                <div className="text-[12px] text-muted mt-1">Nothing is waiting for review.</div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {reviewCount > 0 && (
                  <AttentionCard
                    to="/ingestion"
                    title="Values to review"
                    count={reviewCount}
                    tone="warn"
                    description={
                      fieldsTotal > 0
                        ? `${Math.round((trusted / fieldsTotal) * 100)}% of extracted values are cleared. Low-confidence ones need a human check.`
                        : "Low-confidence values land here for a person to confirm, correct, or reject."
                    }
                  />
                )}
                {openAnomalies > 0 && (
                  <AttentionCard
                    to="/anomalies"
                    title="Open anomalies"
                    count={openAnomalies}
                    tone="danger"
                    description="Figures in newer documents that disagree with earlier records for the same mine or block."
                    items={anomalies.data?.items.slice(0, 4).map((a) => ({
                      label: a.title,
                      severity: a.severity,
                    }))}
                  />
                )}
              </div>
            )}

            {/* Clearance progress bar */}
            {fieldsTotal > 0 && (
              <div className="cm-card p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium">Clearance progress</span>
                  <span className="text-[12px] font-semibold text-ok">
                    {Math.round((trusted / fieldsTotal) * 100)}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-ok transition-[width] duration-700"
                    style={{ width: `${Math.round((trusted / fieldsTotal) * 100)}%` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[10.5px] text-faint">
                  <span>{trusted} cleared</span>
                  <span>{(fs.needs_review ?? 0)} remaining</span>
                </div>
              </div>
            )}
          </div>
        </Col>

        <Col span={4}>
          <CollectionBreakdown o={o} />
        </Col>
      </Grid>

      {/* ── Platform counts quick reference ──────────────────────── */}
      {o && (
        <div className="cm-card p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
            Platform overview
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {[
              { label: "KG entities", value: o.kg_entities },
              { label: "KG links", value: o.kg_relations },
              { label: "Passages", value: o.doc_chunks },
              { label: "Topics", value: o.topics },
              { label: "Subsidiaries", value: o.subsidiaries },
              { label: "Users", value: o.users },
              { label: "Awaiting review", value: o.review_queue },
              { label: "Questions asked", value: sum(o.qa_by_status) },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <div className="text-[15px] font-bold tabular-nums">{value ?? 0}</div>
                <div className="text-[10px] text-muted">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}
