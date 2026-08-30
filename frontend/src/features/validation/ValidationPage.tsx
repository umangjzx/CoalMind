import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { EvalReport } from "@/lib/types";
import { docTypeLabel } from "@/lib/labels";
import { BarList, Panel, RadialProgress } from "@/components/charts";
import { Col, Grid, Page, PageHeader } from "@/components/layout";
import { Card, CardHeader, EmptyState, SkeletonRows } from "@/components/primitives";

/* ── Helpers ─────────────────────────────────────────────────────────── */
function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/* ── Metric card with radial gauge ──────────────────────────────────── */
function MetricGauge({
  value,
  label,
  sub,
  tone,
  target,
}: {
  value: number;   // 0-1
  label: string;
  sub?: string;
  tone?: "ok" | "warn" | "danger";
  target?: number; // 0-1 threshold line
}) {
  const color =
    tone === "ok"
      ? "rgb(var(--c-ok))"
      : tone === "warn"
        ? "rgb(var(--c-warn))"
        : tone === "danger"
          ? "rgb(var(--c-danger))"
          : undefined;

  return (
    <div className="cm-card flex flex-col items-center gap-2 p-4 text-center">
      <RadialProgress value={value} size={80} strokeWidth={10} color={color} />
      <div>
        <div className="text-[13px] font-semibold">{label}</div>
        {sub && <div className="mt-0.5 text-[11px] text-muted leading-snug">{sub}</div>}
        {target != null && (
          <div className={`mt-1 text-[10.5px] font-medium ${value >= target ? "text-ok" : "text-danger"}`}>
            Target: ≥{pct(target)} — {value >= target ? "✓ met" : "✗ missed"}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Pass/fail pill ──────────────────────────────────────────────────── */
function PassPill({ pass }: { pass: boolean }) {
  return (
    <span className={`pill border ${pass ? "bg-ok-lt text-ok border-ok/20" : "bg-danger-lt text-danger border-danger/20"}`}>
      {pass ? "✓ Pass" : "✗ Over"}
    </span>
  );
}

/* ── Test status pill ─────────────────────────────────────────────────── */
function TestPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[12.5px] text-muted">{label}</span>
      <span className={`pill border ${ok ? "bg-ok-lt text-ok border-ok/20" : "bg-danger-lt text-danger border-danger/20"}`}>
        {ok ? "● green" : "● failing"}
      </span>
    </div>
  );
}

/* ── Extraction section ──────────────────────────────────────────────── */
function ExtractionSection({ e }: { e: EvalReport }) {
  const o = e.overall;
  const rows = e.documents;

  return (
    <div className="space-y-4">
      {/* Four gauges */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricGauge
          value={e.classification_accuracy}
          label="Doc type accuracy"
          sub={`${o.docs} documents classified`}
          tone={e.classification_accuracy >= 1 ? "ok" : "warn"}
          target={1}
        />
        <MetricGauge
          value={o.f1}
          label="F1 score"
          sub="precision × recall on targeted fields"
          tone={o.f1 >= 0.9 ? "ok" : o.f1 >= 0.7 ? "warn" : "danger"}
          target={0.9}
        />
        <MetricGauge
          value={o.coverage}
          label="Field coverage"
          sub={`${o.gt_fields_in_scope}/${o.gt_fields_total} ground-truth fields targeted`}
          tone={o.coverage >= 0.8 ? "ok" : "warn"}
        />
        <MetricGauge
          value={o.effective_accuracy}
          label="Effective accuracy"
          sub="once review queue catches low-confidence values"
          tone={o.effective_accuracy >= 0.95 ? "ok" : "warn"}
          target={0.95}
        />
      </div>

      <Grid>
        {/* Quality by doc type */}
        <Col span={6}>
          <Panel title="Accuracy by document quality" hint="clean PDFs vs degraded scans">
            <BarList
              max={1}
              format={pct}
              data={[
                { label: "Digital (F1)", value: e.digital.f1, color: "rgb(var(--c-ok))" },
                ...(e.degraded
                  ? [{ label: "Degraded scans (F1)", value: e.degraded.f1, color: "rgb(var(--c-warn))" }]
                  : []),
              ]}
            />
            <div className="mt-3 flex gap-4 text-[12px]">
              <div>
                <span className="text-muted">Silent errors</span>
                <span className="ml-1.5 font-semibold tabular-nums">{o.silent_errors}</span>
              </div>
              <div>
                <span className="text-muted">Silent misses</span>
                <span className="ml-1.5 font-semibold tabular-nums">{o.silent_misses}</span>
              </div>
            </div>
            <p className="mt-2 text-[11.5px] text-muted">
              The review queue is the safety net — every low-confidence value must be
              human-confirmed before use.
            </p>
          </Panel>
        </Col>

        {/* Per document table */}
        <Col span={6}>
          <Panel title="Per document" hint={`${rows.length} sample documents`}>
            <div className="overflow-x-auto">
              <table className="cm-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Type</th>
                    <th className="text-right">Fields correct</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => {
                    const scope = d.fields.filter((f) => f.in_scope);
                    const ok    = scope.filter((f) => f.correct).length;
                    const allOk = ok === scope.length;
                    return (
                      <tr key={d.name}>
                        <td className="max-w-[180px]">
                          <span className="truncate block text-[12px]">{d.name}</span>
                        </td>
                        <td>
                          <span className={`text-[12px] ${d.doc_type.ok ? "text-ok" : "text-danger"}`}>
                            {docTypeLabel(d.doc_type.pred)}
                          </span>
                        </td>
                        <td className="text-right tabular-nums">
                          <span className={`text-[12px] font-semibold ${allOk ? "text-ok" : "text-warn"}`}>
                            {ok}/{scope.length}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </Col>
      </Grid>
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────── */
export function ValidationPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["validation"],
    queryFn: api.validation,
  });

  return (
    <Page>
      <PageHeader title="Validation">
        How the platform's accuracy and speed were measured. Extraction is scored live
        against a hand-written answer key; performance is from the last benchmark run.
      </PageHeader>

      {isLoading && (
        <Card padding={false}>
          <CardHeader title="Loading validation data…" />
          <SkeletonRows rows={6} />
        </Card>
      )}

      {isError && (
        <div className="cm-card p-10 text-center">
          <EmptyState>Couldn't load the validation summary.</EmptyState>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* ── Extraction accuracy ─────────────────────────── */}
          <section className="space-y-3">
            <h2 className="text-[11.5px] font-semibold uppercase tracking-widest text-muted">
              Extraction accuracy
            </h2>
            {data.extraction && "overall" in data.extraction ? (
              <ExtractionSection e={data.extraction as EvalReport} />
            ) : (
              <div className="cm-card p-8 text-center">
                <EmptyState>
                  Sample corpus not generated — run{" "}
                  <code className="font-mono text-[12px]">python scripts/dev.py corpus</code>.
                </EmptyState>
              </div>
            )}
          </section>

          {/* ── Response times ──────────────────────────────── */}
          <Panel
            title="Response times"
            hint="p50 / p95 from the last benchmark — PRD rows must beat their target"
          >
            <div className="overflow-x-auto">
              <table className="cm-table">
                <thead>
                  <tr>
                    <th>Endpoint</th>
                    <th className="text-right">p50</th>
                    <th className="text-right">p95</th>
                    <th className="text-right">Target</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {data.performance.map((r) => {
                    const pass = r.p95_ms <= r.target_ms;
                    return (
                      <tr key={r.path}>
                        <td>
                          <span className="font-mono text-[11.5px]">{r.path}</span>
                          {r.prd && (
                            <span className="ml-2 pill bg-brand-lt text-brand text-[10px]">
                              PRD
                            </span>
                          )}
                        </td>
                        <td className="text-right tabular-nums text-muted">
                          {(r.p50_ms / 1000).toFixed(2)}s
                        </td>
                        <td className="text-right tabular-nums font-medium">
                          {(r.p95_ms / 1000).toFixed(2)}s
                        </td>
                        <td className="text-right tabular-nums text-muted">
                          &lt;{(r.target_ms / 1000).toFixed(0)}s
                        </td>
                        <td><PassPill pass={pass} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* ── Load + tests row ────────────────────────────── */}
          <Grid>
            {data.load && (
              <Col span={6}>
                <Panel title="Under load" hint="concurrent requests (in-process benchmark)">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Concurrent users", value: `${data.load.concurrency}` },
                      { label: "Query p95",         value: `${(data.load.query_p95_ms / 1000).toFixed(2)}s` },
                      { label: "Throughput",        value: `${data.load.query_rps}/s` },
                      {
                        label: "Errors",
                        value: `${data.load.errors}`,
                        tone: data.load.errors === 0 ? "ok" : "danger",
                      },
                    ].map(({ label, value, tone }) => (
                      <div key={label} className="rounded-lg bg-surface-2/60 p-3">
                        <div className={`metric-md tabular-nums ${tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : "text-fg"}`}>
                          {value}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted">{label}</div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </Col>
            )}

            <Col span={data.load ? 6 : 12}>
              <Panel title="Automated checks" hint="run on every change">
                <div className="divide-y divide-border/60">
                  <TestPill ok={data.tests.backend > 0} label={`Backend tests (${data.tests.backend} passing)`} />
                  <TestPill ok={data.tests.frontend_build} label="Frontend build" />
                </div>
                {data.tests.notes && (
                  <p className="mt-3 text-[11.5px] text-muted">{data.tests.notes}</p>
                )}
              </Panel>
            </Col>
          </Grid>

          {/* ── Methodology ─────────────────────────────────── */}
          <Panel title="How we measured">
            <ul className="space-y-2 text-[12.5px] text-muted">
              {data.methodology.map((m, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/40" />
                  {m}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </Page>
  );
}
