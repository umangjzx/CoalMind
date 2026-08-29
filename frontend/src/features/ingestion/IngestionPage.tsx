import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Col, Grid, Kpi, KpiRow, Page, PageHeader } from "@/components/layout";
import { UploadPanel } from "./UploadPanel";
import { DocumentsTable } from "./DocumentsTable";
import { ReviewQueue } from "./ReviewQueue";
import { DocumentDrawer } from "./DocumentDrawer";

function sum(rec: Record<string, number> | undefined): number {
  return Object.values(rec ?? {}).reduce((a, b) => a + b, 0);
}

export function IngestionPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: api.adminOverview });
  const quality = useQuery({ queryKey: ["admin-quality"], queryFn: api.adminExtractionQuality });
  const o = overview.data;
  const fs = o?.fields_by_status ?? {};

  return (
    <Page>
      <PageHeader title="Upload & review">
        Add documents on the left. Each one is read, classified, and its key figures
        pulled out with a confidence score. Anything the system isn&rsquo;t sure about
        waits in the review queue for you to confirm &mdash; nothing uncertain is used in
        a report or an answer until you&rsquo;ve checked it.
      </PageHeader>

      <KpiRow>
        <Kpi label="Documents" value={sum(o?.documents_by_status) || "—"} />
        <Kpi label="Values extracted" value={sum(fs) || "—"} />
        <Kpi label="Auto-accepted" value={fs.auto_accepted ?? 0} tone="ok" />
        <Kpi
          label="Waiting for you"
          value={o?.review_queue ?? 0}
          tone={(o?.review_queue ?? 0) > 0 ? "warn" : "ok"}
        />
        <Kpi label="Confirmed" value={fs.verified ?? 0} tone="ok" />
        <Kpi
          label="Avg. confidence"
          value={quality.data ? `${Math.round(quality.data.mean_confidence * 100)}%` : "—"}
        />
      </KpiRow>

      <Grid>
        <Col span={3}>
          <UploadPanel />
        </Col>
        <Col span={5}>
          <DocumentsTable onSelect={setSelected} selectedId={selected} />
        </Col>
        <Col span={4}>
          <ReviewQueue />
        </Col>
      </Grid>

      {selected && <DocumentDrawer id={selected} onClose={() => setSelected(null)} />}
    </Page>
  );
}
