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
    <Card className="p-3">
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
        className={`flex cursor-pointer items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 text-sm transition-colors ${
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
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-muted">
          <path d="M12 16V4m0 0L7 9m5-5 5 5M4 20h16" stroke="currentColor" strokeWidth="1.75"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="font-medium">
          {upload.isPending ? "Uploading…" : "Add documents"}
        </span>
        <span className="text-xs text-muted">
          drop PDFs / scans here, or click — duplicates are skipped
        </span>
      </div>
      {msg && (
        <div className="mt-2 rounded bg-surface-2 px-3 py-1.5 text-xs text-muted">{msg}</div>
      )}
    </Card>
  );
}
