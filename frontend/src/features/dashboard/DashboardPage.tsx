import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { DEPENDENCY_LABELS, docTypeLabel, healthWord, statusLabel } from "@/lib/labels";
import { BarList, Donut, Panel } from "@/components/charts";
import { Col, Grid, Kpi, KpiRow, Page, PageHeader } from "@/components/layout";
import { PipelineFlow } from "./PipelineFlow";

function sum(rec: Record<string, number> | undefined): number {
  return Object.values(rec ?? {}).reduce((a, b) => a + b, 0);
}

export function DashboardPage() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const version = useQuery({ queryKey: ["version"], queryFn: api.version });
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: api.adminOverview });
  const quality = useQuery({
    queryKey: ["admin-quality"],
    queryFn: api.adminExtractionQuality,
  });
  const anomalies = useQuery({
    queryKey: ["anomalies", "open"],
    queryFn: () => api.anomalies({ status: "open", limit: 6 }),
  });

  const o = overview.data;
  const reviewCount = o?.review_queue ?? 0;
  const openAnomalies = anomalies.data?.open_count ?? 0;
  const allClear = !overview.isLoading && reviewCount === 0 && openAnomalies === 0;

  const fs = o?.fields_by_status ?? {};
  const reviewSegments = [
    { label: "Confirmed by a person", value: fs.verified ?? 0, color: "rgb(var(--k-6))" },
    { label: "Accepted automatically", value: fs.auto_accepted ?? 0, color: "rgb(var(--k-1))" },
    { label: "Waiting for review", value: fs.needs_review ?? 0, color: "rgb(var(--c-warn))" },
    { label: "Rejected", value: fs.rejected ?? 0, color: "rgb(var(--c-danger))" },
  ].filter((s) => s.value > 0);
  const fieldsTotal = sum(fs);
  const trusted = (fs.verified ?? 0) + (fs.auto_accepted ?? 0);

  return (
    <Page>
      <PageHeader title="Dashboard">
        The state of the document collection, and anything that needs a person.
      </PageHeader>

      <PipelineFlow o={o} />

      <KpiRow>
        <Kpi label="Documents" value={sum(o?.documents_by_status) || "—"} />
        <Kpi label="Values extracted" value={fieldsTotal || "—"} />
        <Kpi label="To review" value={reviewCount} tone={reviewCount ? "warn" : "ok"} />
        <Kpi
          label="Open anomalies"
          value={anomalies.data ? openAnomalies : "—"}
          tone={openAnomalies ? "danger" : "ok"}
        />
        <Kpi label="Reports" value={sum(o?.reports_by_status) || 0} />
        <Kpi label="Saved answers" value={o?.qa_by_status?.verified ?? 0} tone="ok" />
      </KpiRow>

      <Grid>
        <Col span={5}>
          <Panel
            title="Where the values stand"
            hint={`${fieldsTotal} values from ${sum(o?.documents_by_status)} documents`}
            className="h-full"
          >
            {reviewSegments.length > 0 ? (
              <Donut
                segments={reviewSegments}
                centerValue={`${fieldsTotal ? Math.round((trusted / fieldsTotal) * 100) : 0}%`}
                centerLabel="cleared"
              />
            ) : (
              <p className="text-xs text-muted">No values extracted yet.</p>
            )}
          </Panel>
        </Col>
        <Col span={4}>
          <Panel
            title="Confidence by document type"
            hint="lower types need more review"
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
              <p className="text-xs text-muted">No extraction data yet.</p>
            )}
          </Panel>
        </Col>
        <Col span={3}>
          <Panel title="System status" className="h-full text-sm">
            <ul className="space-y-2">
              {Object.entries(health.data?.checks ?? {}).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        v === "ok" ? "bg-ok" : v === "down" ? "bg-danger" : "bg-warn"
                      }`}
                    />
                    {DEPENDENCY_LABELS[k] ?? k}
                  </span>
                  <span className="text-xs text-muted">{healthWord(v)}</span>
                </li>
              ))}
              {health.isLoading && <li className="text-xs text-muted">Checking…</li>}
              {health.isError && (
                <li className="text-xs text-danger">Can&rsquo;t reach the backend.</li>
              )}
            </ul>
            {version.data && (
              <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
                {version.data.allow_third_party_api
                  ? `Answers may use a hosted AI model (${version.data.llm_provider}).`
                  : "Runs fully on-premises."}{" "}
                v{version.data.version}
              </p>
            )}
          </Panel>
        </Col>
      </Grid>

      <Grid>
        <Col span={8} className="space-y-3">
          <h2 className="text-sm font-semibold">Needs your attention</h2>
          {allClear ? (
            <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
              You&rsquo;re all caught up — nothing is waiting for review.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Link
                to="/ingestion"
                className="rounded-xl border border-border bg-surface p-4 transition-colors hover:border-brand"
              >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">Values to review</span>
                <span className="text-3xl font-semibold tabular-nums text-warn">
                  {reviewCount}
                </span>
              </div>
              {fieldsTotal > 0 && (
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full bg-ok"
                    style={{ width: `${Math.round((trusted / fieldsTotal) * 100)}%` }}
                  />
                </span>
              )}
              <p className="mt-2 text-xs text-muted">
                {fieldsTotal > 0
                  ? `${Math.round((trusted / fieldsTotal) * 100)}% of extracted values are cleared. The rest are low-confidence — confirm, correct, or reject them.`
                  : "Low-confidence values land here for a person to check."}
              </p>
            </Link>

            <Link
              to="/anomalies"
              className="rounded-xl border border-border bg-surface p-4 transition-colors hover:border-brand"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">Open anomalies</span>
                <span className="text-3xl font-semibold tabular-nums">
                  {anomalies.data ? openAnomalies : "—"}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted">
                Figures in newer documents that disagree with earlier records for the
                same mine or block.
              </p>
              {anomalies.data && anomalies.data.items.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {anomalies.data.items.slice(0, 3).map((a) => (
                    <li key={a.id} className="flex items-start gap-2 text-xs">
                      <span
                        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                          a.severity === "high"
                            ? "bg-danger"
                            : a.severity === "medium"
                              ? "bg-warn"
                              : "bg-muted"
                        }`}
                      />
                      <span className="min-w-0 truncate">{a.title}</span>
                    </li>
                  ))}
                </ul>
              )}
              </Link>
            </div>
          )}
        </Col>

        <Col span={4}>
          <Panel
            title="What's in the collection"
            hint="documents by processing state"
            className="h-full"
          >
            <BarList
              data={Object.entries(o?.documents_by_status ?? {})
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => ({ label: statusLabel(k), value: v }))}
            />
          </Panel>
        </Col>
      </Grid>
    </Page>
  );
}
