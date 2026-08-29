import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card } from "@/components/primitives";

export function UploadPanel() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: (files: File[]) => api.uploadDocuments(files),
    onSuccess: (res: unknown) => {
      const r = res as { items: unknown[]; queued_for_processing: number };
      setMsg(`${r.items.length} uploaded, ${r.queued_for_processing} queued for extraction`);
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["review-queue"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  function pick(files: FileList | null) {
    if (files && files.length) upload.mutate(Array.from(files));
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">Upload documents</h2>
      <p className="mt-1 text-xs text-muted">
        PDF, images, or scans. Each file is de-duplicated by content hash and run
        through the extraction pipeline; low-confidence fields go to the review queue.
      </p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pick(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`mt-3 cursor-pointer rounded-lg border-2 border-dashed p-8 text-center text-sm transition-colors ${
          dragOver ? "border-brand bg-brand/5" : "border-border hover:border-brand"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff"
          onChange={(e) => pick(e.target.files)}
        />
        {upload.isPending ? "Uploading…" : "Drop files here, or click to choose"}
      </div>
      {msg && (
        <div className="mt-3 rounded bg-surface-2 px-3 py-2 text-xs text-muted">{msg}</div>
      )}
    </Card>
  );
}
