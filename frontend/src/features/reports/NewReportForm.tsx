import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReportDetailT, ReportTemplate } from "@/lib/types";
import { Btn } from "@/components/layout";

/** Parameter form for one chosen template. The template is picked upstream
 *  (Landing shows the tiles); this just collects the officer's inputs. */
export function NewReportForm({
  templateKey,
  onBack,
  onCreated,
}: {
  templateKey: string;
  onBack: () => void;
  onCreated: (r: ReportDetailT) => void;
}) {
  const qc = useQueryClient();
  const { data: templates } = useQuery({
    queryKey: ["report-templates"],
    queryFn: api.reportTemplates,
  });
  const [params, setParams] = useState<Record<string, string>>({});

  const tmpl: ReportTemplate | undefined = templates?.find((t) => t.key === templateKey);

  const create = useMutation({
    mutationFn: () =>
      api.createReport({
        template_key: templateKey,
        params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "")),
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      onCreated(r);
    },
  });

  const missingRequired =
    tmpl?.param_schema.some((p) => p.required && !params[p.name]?.trim()) ?? true;

  if (!tmpl) {
    return (
      <div className="cm-card p-4 text-[12.5px] text-muted">Loading template…</div>
    );
  }

  return (
    <div className="cm-card overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">{tmpl.title}</div>
          <p className="mt-0.5 text-[11.5px] text-muted">{tmpl.description}</p>
        </div>
        <button
          onClick={onBack}
          className="shrink-0 text-[11.5px] font-medium text-brand hover:underline"
        >
          ← Choose a different type
        </button>
      </div>

      <div className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {tmpl.param_schema.map((p) => (
            <label key={p.name} className="flex flex-col gap-1">
              <span className="text-[11.5px] font-medium text-muted">
                {p.label}
                {p.required && <span className="text-danger"> *</span>}
              </span>
              {p.type === "select" ? (
                <select
                  value={params[p.name] ?? ""}
                  onChange={(e) => setParams((s) => ({ ...s, [p.name]: e.target.value }))}
                  className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[13px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                >
                  <option value="">—</option>
                  {p.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={p.type === "date" ? "date" : "text"}
                  value={params[p.name] ?? ""}
                  onChange={(e) => setParams((s) => ({ ...s, [p.name]: e.target.value }))}
                  className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[13px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
              )}
              {p.help && <span className="text-[10.5px] text-faint">{p.help}</span>}
            </label>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Btn
            variant="primary"
            size="md"
            disabled={missingRequired || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Drafting…" : "Draft report"}
          </Btn>
          {missingRequired && (
            <span className="text-[11.5px] text-faint">
              Fill the required field{tmpl.param_schema.filter((p) => p.required).length > 1 ? "s" : ""} to continue.
            </span>
          )}
        </div>

        {create.isError && (
          <div className="mt-3 rounded-md bg-danger-lt px-3 py-2 text-[12px] text-danger">
            Couldn&rsquo;t draft it: {(create.error as Error).message}
          </div>
        )}
      </div>
    </div>
  );
}
