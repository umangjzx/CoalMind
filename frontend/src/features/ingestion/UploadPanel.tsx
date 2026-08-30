import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

const ACCEPTED = ".pdf,.png,.jpg,.jpeg,.tif,.tiff";

export function UploadPanel() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const upload = useMutation({
    mutationFn: (files: File[]) => api.uploadDocuments(files),
    onSuccess: (res: unknown) => {
      const r = res as { items: unknown[]; queued_for_processing: number };
      const total = r.items.length;
      const fresh = r.queued_for_processing;
      const dupes = total - fresh;
      setMsg({
        ok: fresh > 0,
        text:
          fresh === 0
            ? `${total} file${total === 1 ? "" : "s"} already in the collection — nothing new to process.`
            : `${fresh} file${fresh === 1 ? "" : "s"} uploaded and queued for processing.` +
              (dupes ? ` (${dupes} duplicate${dupes === 1 ? "" : "s"} skipped.)` : ""),
      });
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => setMsg({ ok: false, text: `Upload failed: ${e.message}` }),
  });

  function pick(files: FileList | null) {
    if (files && files.length) {
      setMsg(null);
      upload.mutate(Array.from(files));
    }
  }

  return (
    <div className="cm-card overflow-hidden">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files); }}
        onClick={() => !upload.isPending && inputRef.current?.click()}
        className={[
          "flex cursor-pointer items-center justify-center gap-4 px-6 py-5 transition-all duration-150",
          dragOver
            ? "bg-brand-lt border-2 border-dashed border-brand"
            : "border-b border-dashed border-border hover:bg-surface-2",
          upload.isPending ? "cursor-wait" : "",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={ACCEPTED}
          onChange={(e) => pick(e.target.files)}
        />

        {/* Upload icon */}
        <div className={`shrink-0 rounded-lg p-2.5 transition-colors ${dragOver ? "bg-brand text-brand-fg" : "bg-surface-2 text-muted"}`}>
          {upload.isPending ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 20h16"/>
            </svg>
          )}
        </div>

        <div className="min-w-0">
          <div className="text-[13px] font-semibold">
            {upload.isPending ? "Uploading…" : dragOver ? "Drop to upload" : "Add documents"}
          </div>
          <div className="mt-0.5 text-[12px] text-muted">
            PDFs, images or scans · duplicates are skipped automatically
          </div>
        </div>

        <div className="ml-auto shrink-0">
          <span className="pill bg-surface-2 text-faint border border-border">
            PDF · PNG · JPG · TIFF
          </span>
        </div>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 px-4 py-2.5 text-[12px] ${msg.ok ? "bg-ok-lt text-ok" : "bg-warn-lt text-warn"}`}>
          <span>{msg.ok ? "✓" : "ℹ"}</span>
          <span>{msg.text}</span>
          <button
            onClick={() => setMsg(null)}
            className="ml-auto text-[16px] opacity-50 hover:opacity-100"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
