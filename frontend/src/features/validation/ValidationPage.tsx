import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { EvalReport } from "@/lib/types";
import { docTypeLabel } from "@/lib/labels";
import { BarList, Panel } from "@/components/charts";
import { Page, PageHeader } from "@/components/layout";
import { Card, EmptyState } from "@/components/primitives";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function StatTile({
  value,
  label,
  tone = "fg",
}: {
  value: string;
  label: string;
  tone?: "fg" | "ok" | "warn";
}) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-fg";
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}

function ExtractionSection({ e }: { e: EvalReport }) {
  const o = e.overall;
  const rows = e.documents;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          value={pct(e.classification_accuracy)}
          label={`document type identified — ${o.docs}/${o.docs} correct`}
          tone={e.classification_accuracy >= 1 ? "ok" : "warn"}
        />
        <StatTile
          value={o.f1.toFixed(2)}
          label="field precision / recall (F1) on the fields the extractor targets"
          tone={o.f1 >= 0.9 ? "ok" : "warn"}
        />
        <StatTile
          value={pct(o.coverage)}
          label={`of ground-truth fields are targeted (${o.gt_fields_in_scope}/${o.gt_fields_total})`}
        />
        <StatTile
          value={pct(o.effective_accuracy)}
          label="effective accuracy once the review queue catches low-confidence values"
          tone={o.effective_accuracy >= 0.95 ? "ok" : "warn"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Accuracy by document quality" hint="clean digital PDFs vs degraded scans">
          <BarList
            max={1}
            format={pct}
            data={[
              { label: "Digital documents (F1)", value: e.digital.f1, color: "rgb(var(--c-ok))" },
              e.degraded
                ? {
                    label: "Degraded scans (F1)",
                    value: e.degraded.f1,
                    color: "rgb(var(--c-warn))",
                  }
                : { label: "Degraded scans", value: 0 },
            ]}
          />
          <p className="mt-3 text-xs text-muted">
            {o.silent_errors} silent errors · {o.silent_misses} silent misses — the review
            queue is the safety net for everything else.
          </p>
        </Panel>

        <Panel title="Per document" hint={`${rows.length} sample documents`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted">
                <tr className="text-left">
                  <th className="py-1 pr-3 font-medium">Document</th>
                  <th className="py-1 pr-3 font-medium">Type</th>
                  <th className="py-1 font-medium">Fields correct</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const scope = d.fields.filter((f) => f.in_scope);
                  const ok = scope.filter((f) => f.correct).length;
                  return (
                    <tr key={d.name} className="border-t border-border/50">
                      <td className="py-1 pr-3">{d.name}</td>
                      <td className="py-1 pr-3">
                        <span className={d.doc_type.ok ? "text-ok" : "text-danger"}>
                          {docTypeLabel(d.doc_type.pred)}
                        </span>
                      </td>
                      <td className="py-1 tabular-nums">
                        <span className={ok === scope.length ? "text-ok" : "text-warn"}>
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
      </div>
    </div>
  );
}

export function ValidationPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["validation"],
    queryFn: api.validation,
  });

  return (
    <Page>
      <PageHeader title="Validation">
        How the platform&rsquo;s accuracy and speed were measured. Extraction is scored
        live against a hand-written answer key for the sample corpus; performance is from
        the last benchmark run.
      </PageHeader>

      {isLoading && <Card className="p-6"><EmptyState>Running the checks…</EmptyState></Card>}
      {isError && (
        <Card className="p-6">
          <EmptyState>Couldn&rsquo;t load the validation summary.</EmptyState>
        </Card>
      )}

      {data && (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Extraction accuracy</h2>
            {data.extraction && "overall" in data.extraction ? (
              <ExtractionSection e={data.extraction as EvalReport} />
            ) : (
              <Card className="p-6">
                <EmptyState>
                  The sample corpus hasn&rsquo;t been generated — run{" "}
                  <code className="font-mono">python scripts/dev.py corpus</code>.
                </EmptyState>
              </Card>
            )}
          </section>

          <Panel
            title="Response time"
            hint="p50 / p95 from the last benchmark; PRD rows must beat their target"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted">
                  <tr className="text-left">
                    <th className="py-1.5 pr-4 font-medium">Path</th>
                    <th className="py-1.5 pr-4 font-medium tabular-nums">p50</th>
                    <th className="py-1.5 pr-4 font-medium tabular-nums">p95</th>
                    <th className="py-1.5 pr-4 font-medium tabular-nums">Target</th>
                    <th className="py-1.5 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {data.performance.map((r) => {
                    const pass = r.p95_ms <= r.target_ms;
                    return (
                      <tr key={r.path} className="border-t border-border/60">
                        <td className="py-1.5 pr-4">
                          {r.path}
                          {r.prd && (
                            <span className="ml-2 rounded bg-brand/15 px-1.5 text-[10px] text-brand">
                              PRD
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-4 tabular-nums text-muted">
                          {(r.p50_ms / 1000).toFixed(2)}s
                        </td>
                        <td className="py-1.5 pr-4 tabular-nums">
                          {(r.p95_ms / 1000).toFixed(2)}s
                        </td>
                        <td className="py-1.5 pr-4 tabular-nums text-muted">
                          &lt; {(r.target_ms / 1000).toFixed(0)}s
                        </td>
                        <td className={`py-1.5 ${pass ? "text-ok" : "text-danger"}`}>
                          {pass ? "within budget" : "over"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            {data.load && (
              <Panel title="Under load" hint="concurrent requests, in-process">
                <ul className="space-y-1.5 text-sm">
                  <li className="flex justify-between">
                    <span className="text-muted">Concurrent users</span>
                    <span className="tabular-nums font-medium">{data.load.concurrency}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted">Question response, p95</span>
                    <span className="tabular-nums font-medium">
                      {(data.load.query_p95_ms / 1000).toFixed(2)}s
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted">Throughput</span>
                    <span className="tabular-nums font-medium">{data.load.query_rps}/s</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted">Errors</span>
                    <span
                      className={`tabular-nums font-medium ${
                        data.load.errors === 0 ? "text-ok" : "text-danger"
                      }`}
                    >
                      {data.load.errors}
                    </span>
                  </li>
                </ul>
              </Panel>
            )}

            <Panel title="Automated checks" hint="run on every change">
              <ul className="space-y-1.5 text-sm">
                <li className="flex justify-between">
                  <span className="text-muted">Backend tests passing</span>
                  <span className="tabular-nums font-medium text-ok">{data.tests.backend}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-muted">Frontend build</span>
                  <span className="font-medium text-ok">
                    {data.tests.frontend_build ? "green" : "failing"}
                  </span>
                </li>
              </ul>
              <p className="mt-3 text-xs text-muted">{data.tests.notes}</p>
            </Panel>
          </div>

          <Panel title="How we measured">
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
              {data.methodology.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </Panel>
        </>
      )}
    </Page>
  );
}
