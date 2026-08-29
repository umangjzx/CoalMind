import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { UploadPanel } from "./UploadPanel";
import { DocumentsTable } from "./DocumentsTable";
import { ReviewQueue } from "./ReviewQueue";
import { DocumentDrawer } from "./DocumentDrawer";

export function IngestionPage() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <Page>
      <PageHeader title="Upload & review">
        Add documents below. Each one is read, classified, and its key figures pulled out
        with a confidence score. Anything the system isn&rsquo;t sure about waits in the
        review queue for you to confirm &mdash; nothing uncertain is used in a report or
        an answer until you&rsquo;ve checked it.
      </PageHeader>

      <UploadPanel />

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <DocumentsTable onSelect={setSelected} selectedId={selected} />
        <ReviewQueue />
      </div>

      {selected && <DocumentDrawer id={selected} onClose={() => setSelected(null)} />}
    </Page>
  );
}
