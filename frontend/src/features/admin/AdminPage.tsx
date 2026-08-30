import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AdminUserRow } from "@/lib/types";
import { auditActionLabel, docTypeLabel, roleLabel, statusLabel } from "@/lib/labels";
import { BarList, Panel, RadialProgress } from "@/components/charts";
import { Card, CardHeader, EmptyState, SkeletonRows } from "@/components/primitives";
import { Btn, Col, Grid, Kpi, KpiRow, Page, PageHeader, TabBar } from "@/components/layout";

const ROLES = [
  "reporting_officer",
  "geologist",
  "ministry_official",
  "data_admin",
  "records_clerk",
];

type AdminTab = "overview" | "users" | "audit" | "quality";

/* ══════════════════════════════════════════════════════════════════════
   OVERVIEW TAB
   ════════════════════════════════════════════════════════════════════ */
function OverviewTab() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: api.adminOverview,
  });
  const verify = useMutation({
    mutationFn: api.adminVerifyChain,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-overview"] }),
  });

  if (isError)
    return (
      <div className="cm-card p-8 text-center">
        <EmptyState>
          Sign in as an IT administrator or ministry account to see this page.
        </EmptyState>
      </div>
    );

  if (isLoading || !data)
    return <SkeletonRows rows={8} />;

  const s = data.security;
  const yn = (b: boolean) => (b ? "Yes" : "No");
  const allOk = s.auth_required && !s.allow_third_party_api && s.audit_chain_ok;

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <KpiRow>
        <Kpi label="Users"        value={data.users ?? 0}    tone="fg"    />
        <Kpi label="Documents"    value={Object.values(data.documents_by_status).reduce((a, b) => a + b, 0)} tone="fg" />
        <Kpi label="KG entities"  value={data.kg_entities}   tone="brand" />
        <Kpi label="Awaiting review" value={data.review_queue} tone={data.review_queue > 0 ? "warn" : "ok"} />
        <Kpi label="Audit events" value={s.audit_events}     tone="fg" />
        <Kpi label="Security"     value={allOk ? "OK" : "Review"} tone={allOk ? "ok" : "warn"} />
      </KpiRow>

      <Grid>
        {/* Counts panels */}
        <Col span={8}>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { title: "Documents by status",    data: data.documents_by_status },
              { title: "Extracted values",        data: data.fields_by_status    },
              { title: "Reports",                 data: data.reports_by_status   },
              { title: "Questions asked",         data: data.qa_by_status        },
            ].map(({ title, data: d }) => (
              <Panel key={title} title={title}>
                <BarList
                  data={Object.entries(d ?? {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => ({ label: statusLabel(k), value: v }))}
                />
              </Panel>
            ))}
          </div>
        </Col>

        {/* Security panel */}
        <Col span={4}>
          <Panel
            title="Security & data handling"
            right={
              <span className={`pill border ${allOk ? "bg-ok-lt text-ok border-ok/20" : "bg-warn-lt text-warn border-warn/20"}`}>
                {allOk ? "● Secure" : "⚠ Review"}
              </span>
            }
          >
            <ul className="space-y-2.5 text-[12.5px]">
              <SecurityRow
                label="Sign-in required"
                ok={s.auth_required}
                value={yn(s.auth_required)}
              />
              <SecurityRow
                label="AI model"
                ok={s.llm_effective.startsWith("on-prem")}
                value={`${s.llm_provider} · ${s.llm_is_hosted ? "hosted" : "on-premises"}`}
              />
              <SecurityRow
                label="Sends data to 3rd-party AI"
                ok={!s.allow_third_party_api}
                value={yn(s.allow_third_party_api)}
                invertOk
              />
              <SecurityRow
                label="Search index"
                ok={s.embeddings_on_prem}
                value={`${s.embeddings_provider}${s.embeddings_on_prem ? " (on-prem)" : ""}`}
              />
              <li className="flex items-start justify-between gap-3 border-t border-border pt-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-muted">Audit trail</div>
                  <div className={`mt-0.5 font-semibold ${s.audit_chain_ok ? "text-ok" : "text-danger"}`}>
                    {s.audit_chain_ok ? "✓ Intact" : "✗ TAMPERED"} · {s.audit_events} events
                  </div>
                </div>
                <Btn
                  size="xs"
                  variant="secondary"
                  onClick={() => verify.mutate()}
                  disabled={verify.isPending}
                >
                  {verify.isPending ? "Checking…" : "Re-check"}
                </Btn>
              </li>
            </ul>
            {verify.data && (
              <div className="mt-2 rounded bg-surface-2 px-2.5 py-1.5 text-[11.5px] text-muted">
                {verify.data.detail}
              </div>
            )}
          </Panel>

          {/* Platform quick counts */}
          <div className="mt-3 cm-card p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
              Platform counts
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Facts & entities", data.kg_entities],
                ["Links",            data.kg_relations],
                ["Passages",         data.doc_chunks],
                ["Topics",           data.topics],
                ["Subsidiaries",     data.subsidiaries],
                ["Users",            data.users],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded bg-surface-2 px-2 py-1.5">
                  <div className="text-[14px] font-bold tabular-nums">{v}</div>
                  <div className="text-[10.5px] text-muted">{k as string}</div>
                </div>
              ))}
            </div>
          </div>
        </Col>
      </Grid>
    </div>
  );
}

function SecurityRow({
  label,
  ok,
  value,
  invertOk = false,
}: {
  label: string;
  ok: boolean;
  value: string;
  invertOk?: boolean;
}) {
  const isGood = invertOk ? !ok : ok;
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={`font-medium ${isGood ? "text-ok" : "text-warn"}`}>{value}</span>
    </li>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   USERS TAB
   ════════════════════════════════════════════════════════════════════ */
function UsersTab() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-users"],
    queryFn: api.adminUsers,
  });
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    email: "", full_name: "", role: "reporting_officer", password: "",
  });

  const patch = useMutation({
    mutationFn: (p: { id: string; body: Record<string, unknown> }) =>
      api.adminUpdateUser(p.id, p.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
  const create = useMutation({
    mutationFn: () => api.adminCreateUser(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setShow(false);
      setForm({ email: "", full_name: "", role: "reporting_officer", password: "" });
    },
  });

  if (isError) return null;

  const activeCount  = data?.filter((u: AdminUserRow) => u.is_active).length  ?? 0;
  const inactiveCount = data?.filter((u: AdminUserRow) => !u.is_active).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-[12.5px] text-muted">
          <span><strong className="text-fg">{data?.length ?? 0}</strong> users</span>
          <span className="text-ok"><strong>{activeCount}</strong> active</span>
          {inactiveCount > 0 && (
            <span className="text-danger"><strong>{inactiveCount}</strong> disabled</span>
          )}
        </div>
        <Btn variant="primary" size="sm" onClick={() => setShow((v) => !v)}>
          {show ? "Cancel" : "+ Add user"}
        </Btn>
      </div>

      {/* Add user form */}
      {show && (
        <Card padding={false}>
          <CardHeader title="New user" subtitle="All fields are required" />
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            {[
              { key: "email",     label: "Email",          type: "email"    },
              { key: "full_name", label: "Full name",       type: "text"     },
              { key: "password",  label: "Initial password",type: "password" },
            ].map(({ key, label, type }) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted">{label}</label>
                <input
                  type={type}
                  value={(form as Record<string, string>)[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[13px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[13px] focus:border-brand focus:outline-none"
              >
                {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-2 sm:col-span-2">
              <Btn
                variant="primary"
                size="sm"
                onClick={() => create.mutate()}
                disabled={create.isPending}
                className="w-full justify-center"
              >
                Create user
              </Btn>
            </div>
            {create.isError && (
              <div className="text-[12px] text-danger sm:col-span-2">
                {(create.error as Error).message}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Users table */}
      <Card padding={false}>
        {isLoading && <SkeletonRows rows={5} />}
        {data && (
          <div className="overflow-x-auto">
            <table className="cm-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last login</th>
                </tr>
              </thead>
              <tbody>
                {data.map((u: AdminUserRow) => (
                  <tr key={u.id}>
                    <td>
                      <div className="font-medium text-[12.5px]">{u.email}</div>
                      <div className="text-[11px] text-muted">{u.full_name}</div>
                    </td>
                    <td>
                      <select
                        value={u.role}
                        onChange={(e) =>
                          patch.mutate({ id: u.id, body: { role: e.target.value } })
                        }
                        className="rounded border border-border bg-bg px-2 py-1 text-[12px] focus:border-brand focus:outline-none"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{roleLabel(r)}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        onClick={() =>
                          patch.mutate({ id: u.id, body: { is_active: !u.is_active } })
                        }
                        className={`pill border transition-colors ${
                          u.is_active
                            ? "bg-ok-lt text-ok border-ok/20 hover:bg-danger-lt hover:text-danger hover:border-danger/20"
                            : "bg-danger-lt text-danger border-danger/20 hover:bg-ok-lt hover:text-ok hover:border-ok/20"
                        }`}
                      >
                        {u.is_active ? "Active" : "Disabled"}
                      </button>
                    </td>
                    <td className="tabular-nums text-muted">
                      {u.last_login_at
                        ? new Date(u.last_login_at).toLocaleString()
                        : <span className="text-faint">Never</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   AUDIT TAB
   ════════════════════════════════════════════════════════════════════ */
function AuditTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => api.adminAudit({ limit: 60 }),
    refetchInterval: 10000,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] text-muted">
          <strong className="text-fg">{data?.total ?? 0}</strong> events ·
          tamper-evident, never edited or deleted
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-ok">
          <span className="h-1.5 w-1.5 rounded-full bg-ok animate-pulse" />
          Live
        </div>
      </div>

      <Card padding={false}>
        {isLoading && <SkeletonRows rows={8} />}
        {isError && <EmptyState>Couldn't load the audit log.</EmptyState>}
        {data && (
          <div className="overflow-x-auto" style={{ maxHeight: "65vh", overflowY: "auto" }}>
            <table className="cm-table">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  <th className="w-12">#</th>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.seq}>
                    <td className="tabular-nums text-faint">{e.seq}</td>
                    <td className="tabular-nums text-muted whitespace-nowrap">
                      {new Date(e.at).toLocaleString()}
                    </td>
                    <td className="font-medium">{e.actor}</td>
                    <td>{auditActionLabel(e.action)}</td>
                    <td className="text-muted font-mono text-[11px]">
                      {e.target_type}
                      {e.target_id ? (
                        <span className="text-faint">:{e.target_id.slice(0, 8)}</span>
                      ) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   QUALITY TAB
   ════════════════════════════════════════════════════════════════════ */
function QualityTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-quality"],
    queryFn: api.adminExtractionQuality,
  });

  if (isLoading) return <SkeletonRows rows={6} />;
  if (isError || !data) return <EmptyState>No quality data available.</EmptyState>;

  return (
    <div className="space-y-4">
      {/* Top-line gauges */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="cm-card flex flex-col items-center gap-2 p-4 text-center">
          <RadialProgress value={data.mean_confidence} size={72} strokeWidth={9} />
          <div>
            <div className="text-[13px] font-semibold">Avg. confidence</div>
            <div className="text-[11px] text-muted">across all extractions</div>
          </div>
        </div>
        <div className="cm-card flex flex-col items-center gap-2 p-4 text-center">
          <RadialProgress value={data.auto_accept_rate} size={72} strokeWidth={9} color="rgb(var(--c-ok))" />
          <div>
            <div className="text-[13px] font-semibold">Auto-accept rate</div>
            <div className="text-[11px] text-muted">high-confidence values</div>
          </div>
        </div>
        <div className="cm-card p-4">
          <div className="metric-lg tabular-nums">{data.total_fields}</div>
          <div className="mt-1 text-[12px] font-medium">Values extracted</div>
          <div className="mt-3 space-y-1.5 text-[11.5px]">
            <div className="flex justify-between">
              <span className="text-muted">Confirmed</span>
              <span className="font-semibold text-ok">{data.review_outcomes.verified ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Rejected</span>
              <span className="font-semibold text-danger">{data.review_outcomes.rejected ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Pending</span>
              <span className="font-semibold text-warn">{data.review_outcomes.pending ?? 0}</span>
            </div>
          </div>
        </div>
        <div className="cm-card p-4">
          <div className="metric-lg tabular-nums">{Math.round(data.ocr_page_ratio * 100)}%</div>
          <div className="mt-1 text-[12px] font-medium">From scans (OCR)</div>
          <div className="mt-1.5 text-[11.5px] text-muted">
            Scanned pages typically have lower extraction confidence than digital PDFs.
          </div>
        </div>
      </div>

      {/* Per doc-type breakdown */}
      <Panel title="Confidence by document type" hint="average extraction confidence per type">
        <BarList
          max={1}
          format={(v) => `${Math.round(v * 100)}%`}
          data={Object.entries(data.by_doc_type)
            .sort((a, b) => b[1].mean_confidence - a[1].mean_confidence)
            .map(([t, v]) => ({
              label: `${docTypeLabel(t)} (${v.fields} values)`,
              value: v.mean_confidence,
              color:
                v.mean_confidence >= 0.75
                  ? "rgb(var(--c-ok))"
                  : v.mean_confidence >= 0.6
                    ? "rgb(var(--c-warn))"
                    : "rgb(var(--c-danger))",
            }))}
        />
      </Panel>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN
   ════════════════════════════════════════════════════════════════════ */
export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>("overview");

  const TABS: { key: AdminTab; label: string }[] = [
    { key: "overview", label: "Overview"  },
    { key: "users",    label: "Users"     },
    { key: "audit",    label: "Audit log" },
    { key: "quality",  label: "Quality"   },
  ];

  return (
    <Page>
      <PageHeader title="Admin">
        Platform totals, user access control, a complete tamper-evident audit trail, and
        extraction quality metrics. Requires an IT administrator or ministry sign-in.
      </PageHeader>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      <div className="mt-1">
        {tab === "overview" && <OverviewTab />}
        {tab === "users"    && <UsersTab    />}
        {tab === "audit"    && <AuditTab    />}
        {tab === "quality"  && <QualityTab  />}
      </div>
    </Page>
  );
}
