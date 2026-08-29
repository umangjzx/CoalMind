import { useState } from "react";
import { UploadPanel } from "./UploadPanel";
import { DocumentsTable } from "./DocumentsTable";
import { ReviewQueue } from "./ReviewQueue";
import { DocumentDrawer } from "./DocumentDrawer";

export function IngestionPage() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Ingestion &amp; Review</h1>
        <p className="mt-1 text-sm text-muted">
          Upload geological, mining and production documents. The pipeline classifies
          each file, extracts structured fields with a confidence score, and routes
          anything below the threshold here for an officer to verify before it can be
          used in a report.
        </p>
      </header>

      <UploadPanel />

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <DocumentsTable onSelect={setSelected} selectedId={selected} />
        <ReviewQueue />
      </div>

      {selected && <DocumentDrawer id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
