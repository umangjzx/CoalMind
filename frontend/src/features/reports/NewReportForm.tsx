import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReportDetailT, ReportTemplate } from "@/lib/types";
import { Card } from "@/components/primitives";

export function NewReportForm({ onCreated }: { onCreated: (r: ReportDetailT) => void }) {
  const qc = useQueryClient();
  const { data: templates } = useQuery({
    queryKey: ["report-templates"],
    queryFn: api.reportTemplates,
  });
  const [key, setKey] = useState("");
  const [params, setParams] = useState<Record<string, string>>({});

  const tmpl: ReportTemplate | undefined = templates?.find((t) => t.key === key);

  const create = useMutation({
    mutationFn: () =>
      api.createReport({
        template_key: key,
        params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "")),
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      onCreated(r);
    },
  });

  const missingRequired =
    tmpl?.param_schema.some((p) => p.required && !params[p.name]?.trim()) ?? true;

  return (
    <Card className="p-3">
      <h2 className="text-sm font-semibold">New report</h2>
      <select
        value={key}
        onChange={(e) => {
          setKey(e.target.value);
          setParams({});
        }}
        className="mt-2 w-full rounded border border-border bg-bg px-2 py-1.5 text-sm"
      >
        <option value="">Choose a report type…</option>
        {templates?.map((t) => (
          <option key={t.key} value={t.key}>
            {t.title}
          </option>
        ))}
      </select>
      {tmpl && (
        <>
          <p className="mt-1 text-xs text-muted">{tmpl.description}</p>
          <div className="mt-3 space-y-2">
            {tmpl.param_schema.map((p) => (
              <label key={p.name} className="block text-xs">
                <span className="text-muted">
                  {p.label}
                  {p.required && <span className="text-danger"> *</span>}
                </span>
                {p.type === "select" ? (
                  <select
                    value={params[p.name] ?? ""}
                    onChange={(e) => setParams((s) => ({ ...s, [p.name]: e.target.value }))}
                    className="mt-0.5 w-full rounded border border-border bg-bg px-2 py-1 text-sm"
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
                    className="mt-0.5 w-full rounded border border-border bg-bg px-2 py-1 text-sm"
                  />
                )}
                {p.help && <span className="text-[11px] text-muted">{p.help}</span>}
              </label>
            ))}
          </div>
          <button
            disabled={!key || missingRequired || create.isPending}
            onClick={() => create.mutate()}
            className="mt-3 w-full rounded bg-brand px-3 py-1.5 text-sm text-brand-fg disabled:opacity-50"
          >
            {create.isPending ? "Drafting…" : "Draft report"}
          </button>
          {create.isError && (
            <div className="mt-2 text-xs text-danger">
              Couldn&rsquo;t draft it: {(create.error as Error).message}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
