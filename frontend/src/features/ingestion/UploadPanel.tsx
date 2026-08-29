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
      const total = r.items.length;
      const fresh = r.queued_for_processing;
      const dupes = total - fresh;
      setMsg(
        fresh === 0
          ? `${total} file${total === 1 ? "" : "s"} already in the collection — nothing new to process.`
          : `${fresh} file${fresh === 1 ? "" : "s"} uploaded — reading them now. They'll appear in the list below.` +
              (dupes ? ` (${dupes} were already here.)` : ""),
      );
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["review-queue"] });
    },
    onError: (e: Error) => setMsg(`Upload failed: ${e.message}`),
  });

  function pick(files: FileList | null) {
    if (files && files.length) upload.mutate(Array.from(files));
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">Add documents</h2>
      <p className="mt-1 text-xs text-muted">
        PDFs, images, or scanned pages. Duplicate files are detected automatically, so
        it&rsquo;s safe to re-upload.
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
