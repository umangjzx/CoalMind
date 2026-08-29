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
        <h1 className="text-2xl font-semibold">Upload &amp; review</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Add documents below. Each one is read, classified, and its key figures pulled
          out with a confidence score. Anything the system isn&rsquo;t sure about waits
          in the review queue for you to confirm &mdash; nothing uncertain is used in a
          report or an answer until you&rsquo;ve checked it.
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
