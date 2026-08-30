import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AdminOverview } from "@/lib/types";
import { Col, Grid, Kpi, KpiRow, Page, PageHeader } from "@/components/layout";
import { RadialProgress } from "@/components/charts";
import { Card, CardHeader } from "@/components/primitives";
import { UploadPanel } from "./UploadPanel";
import { DocumentsTable } from "./DocumentsTable";
import { ReviewQueue } from "./ReviewQueue";
import { DocumentDrawer } from "./DocumentDrawer";

function sum(rec: Record<string, number> | undefined): number {
  return Object.values(rec ?? {}).reduce((a, b) => a + b, 0);
}

/* ── Mini pipeline progress ─────────────────────────────────────────── */
function PipelineProgress({ o }: { o: AdminOverview | undefined }) {
  const byStatus = o?.documents_by_status ?? {};
  const total = sum(byStatus);
  if (total === 0) return null;

  const stages = [
    { label: "Received",    value: byStatus.received    ?? 0, color: "rgb(var(--c-faint))" },
    { label: "Processing",  value: byStatus.processing  ?? 0, color: "rgb(var(--c-brand))" },
    { label: "Extracted",   value: byStatus.extracted   ?? 0, color: "rgb(var(--k-2))"     },
    { label: "Needs review",value: byStatus.needs_review?? 0, color: "rgb(var(--c-warn))"  },
    { label: "Ready",       value: (byStatus.ready ?? 0) + (byStatus.verified ?? 0) + (byStatus.auto_accepted ?? 0), color: "rgb(var(--c-ok))" },
    { label: "Failed",      value: byStatus.failed      ?? 0, color: "rgb(var(--c-danger))" },
  ].filter((s) => s.value > 0);

  return (
    <Card padding={false}>
      <CardHeader title="Document pipeline" subtitle={`${total} documents in the system`} />
      <div className="p-3">
        {/* stacked progress bar */}
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-surface-2">
          {stages.map((s) => (
            <div
              key={s.label}
              className="h-full transition-[width] duration-700"
              style={{
                width: `${(s.value / total) * 100}%`,
                background: s.color,
                minWidth: s.value > 0 ? 3 : 0,
              }}
              title={`${s.label}: ${s.value}`}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {stages.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
              {s.label}: <strong className="text-fg">{s.value}</strong>
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ── Main ────────────────────────────────────────────────────────────── */
export function IngestionPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: api.adminOverview });
  const quality = useQuery({ queryKey: ["admin-quality"], queryFn: api.adminExtractionQuality });
  const o = overview.data;
  const fs = o?.fields_by_status ?? {};
  const fieldsTotal = sum(fs);
  const confirmed = (fs.auto_accepted ?? 0) + (fs.verified ?? 0);
  const confPct = fieldsTotal > 0 ? confirmed / fieldsTotal : 0;
  const meanConf = quality.data?.mean_confidence ?? 0;
  const reviewQ = o?.review_queue ?? 0;

  return (
    <Page>
      <PageHeader title="Upload & Review">
        Add documents on the left. Each one is read, classified and key figures extracted
        with a confidence score. Anything uncertain waits in the review queue — nothing
        unconfirmed is used in a report or answer.
      </PageHeader>

      {/* ── KPI row ──────────────────────────────────────────────── */}
      <KpiRow>
        <Kpi
          label="Documents"
          value={sum(o?.documents_by_status) || "—"}
          sub={`${o?.documents_by_status?.processing ?? 0} processing`}
        />
        <Kpi
          label="Values extracted"
          value={fieldsTotal || "—"}
          sub={`${fs.auto_accepted ?? 0} auto-accepted`}
          tone="brand"
        />
        <Kpi
          label="Waiting for you"
          value={reviewQ}
          tone={reviewQ > 0 ? "warn" : "ok"}
          sub={reviewQ > 0 ? "needs human review" : "all clear"}
        />
        <Kpi
          label="Confirmed"
          value={confirmed || "—"}
          tone="ok"
          sub={`${fs.verified ?? 0} by a person`}
        />
        <Kpi
          label="Avg. confidence"
          value={quality.data ? `${Math.round(meanConf * 100)}%` : "—"}
          tone={meanConf >= 0.75 ? "ok" : meanConf >= 0.5 ? "warn" : "danger"}
          sub="across all extractions"
        />
        <Kpi
          label="Rejected"
          value={fs.rejected ?? 0}
          tone={fs.rejected ? "danger" : "fg"}
          sub="low-quality values"
        />
      </KpiRow>

      {/* ── Pipeline progress + quality strip ────────────────────── */}
      <Grid>
        <Col span={8}>
          <PipelineProgress o={o} />
        </Col>
        <Col span={4}>
          <Card padding={false} className="h-full">
            <CardHeader
              title="Clearance"
              subtitle="confirmed vs total extracted"
              right={
                <RadialProgress value={confPct} size={44} strokeWidth={7} />
              }
            />
            <div className="p-3 space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-ok transition-[width] duration-700"
                  style={{ width: `${Math.round(confPct * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-faint">
                <span>{confirmed} confirmed</span>
                <span>{reviewQ} pending</span>
              </div>
              {quality.data && (
                <div className="mt-2 pt-2 border-t border-border space-y-1.5">
                  <div className="flex justify-between text-[12px]">
                    <span className="text-muted">Auto-accept rate</span>
                    <span className="font-semibold">{Math.round(quality.data.auto_accept_rate * 100)}%</span>
                  </div>
                  <div className="flex justify-between text-[12px]">
                    <span className="text-muted">From scans (OCR)</span>
                    <span className="font-semibold">{Math.round(quality.data.ocr_page_ratio * 100)}%</span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Grid>

      {/* ── Upload zone ──────────────────────────────────────────── */}
      <UploadPanel />

      {/* ── Documents table + review queue ───────────────────────── */}
      <Grid>
        <Col span={7}>
          <DocumentsTable onSelect={setSelected} selectedId={selected} />
        </Col>
        <Col span={5}>
          <ReviewQueue />
        </Col>
      </Grid>

      {selected && <DocumentDrawer id={selected} onClose={() => setSelected(null)} />}
    </Page>
  );
}
