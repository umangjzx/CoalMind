import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AdminUserRow } from "@/lib/types";
import { auditActionLabel, docTypeLabel, roleLabel, statusLabel } from "@/lib/labels";
import { Card, EmptyState } from "@/components/primitives";

const ROLES = [
  "reporting_officer",
  "geologist",
  "ministry_official",
  "data_admin",
  "records_clerk",
];

function CountGrid({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data);
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted">{title}</div>
      <div className="mt-1 flex flex-wrap gap-2">
        {entries.length === 0 && <span className="text-sm text-muted">—</span>}
        {entries.map(([k, v]) => (
          <span key={k} className="rounded bg-surface-2 px-2 py-0.5 text-sm">
            {statusLabel(k)} <b className="tabular-nums">{v}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function OverviewSection() {
  const qc = useQueryClient();
  const { data, isError } = useQuery({ queryKey: ["admin-overview"], queryFn: api.adminOverview });
  const verify = useMutation({
    mutationFn: api.adminVerifyChain,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-overview"] }),
  });

  if (isError)
    return (
      <Card className="p-4">
        <EmptyState>
          Sign in as an IT administrator or ministry account to see this page.
        </EmptyState>
      </Card>
    );
  if (!data) return <Card className="p-4"><EmptyState>Loading…</EmptyState></Card>;

  const s = data.security;
  const yn = (b: boolean) => (b ? "Yes" : "No");
  return (
    <Card className="space-y-4 p-4">
      <h2 className="text-sm font-semibold">Platform overview</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <CountGrid title="Documents" data={data.documents_by_status} />
        <CountGrid title="Extracted values" data={data.fields_by_status} />
        <CountGrid title="Reports" data={data.reports_by_status} />
        <CountGrid title="Questions asked" data={data.qa_by_status} />
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {[
          ["Awaiting review", data.review_queue],
          ["Facts & entities", data.kg_entities],
          ["Links", data.kg_relations],
          ["Searchable passages", data.doc_chunks],
          ["Themes", data.topics],
          ["Subsidiaries", data.subsidiaries],
          ["Users", data.users],
        ].map(([k, v]) => (
          <span key={k} className="rounded bg-surface-2 px-2 py-0.5">
            {k} <b className="tabular-nums">{v}</b>
          </span>
        ))}
      </div>

      <div className="rounded border border-border p-3">
        <div className="text-xs uppercase tracking-wide text-muted">Security &amp; data handling</div>
        <ul className="mt-1 space-y-0.5 text-sm">
          <li>
            Sign-in required:{" "}
            <b className={s.auth_required ? "text-ok" : "text-warn"}>{yn(s.auth_required)}</b>
          </li>
          <li>
            AI model:{" "}
            <b>{s.llm_provider}</b> ({s.llm_is_hosted ? "hosted" : "on-premises"}) &mdash;{" "}
            <b className={s.llm_effective.startsWith("on-prem") ? "text-ok" : "text-warn"}>
              {s.llm_effective.startsWith("on-prem") ? "runs on-premises" : "in use"}
            </b>
          </li>
          <li>
            Sends data to a third-party AI service:{" "}
            <b className={s.allow_third_party_api ? "text-warn" : "text-ok"}>
              {yn(s.allow_third_party_api)}
            </b>
          </li>
          <li>
            Search index: <b>{s.embeddings_provider}</b>{" "}
            {s.embeddings_on_prem ? "(on-premises)" : ""}
          </li>
          <li className="flex flex-wrap items-center gap-2">
            Audit trail:{" "}
            <b className={s.audit_chain_ok ? "text-ok" : "text-danger"}>
              {s.audit_chain_ok ? "Intact" : "TAMPERED"}
            </b>{" "}
            ({s.audit_events} events)
            <button
              onClick={() => verify.mutate()}
              className="rounded border border-border px-2 py-0.5 text-xs hover:bg-surface-2"
            >
              {verify.isPending ? "Checking…" : "Re-check"}
            </button>
            {verify.data && (
              <span className="text-xs text-muted">{verify.data.detail}</span>
            )}
          </li>
        </ul>
      </div>
    </Card>
  );
}

function UsersSection() {
  const qc = useQueryClient();
  const { data, isError } = useQuery({ queryKey: ["admin-users"], queryFn: api.adminUsers });
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", role: "reporting_officer", password: "" });

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

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Users &amp; roles</h2>
        <button
          onClick={() => setShow((v) => !v)}
          className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-2"
        >
          {show ? "Cancel" : "Add user"}
        </button>
      </div>
      {show && (
        <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-2">
          <input placeholder="Email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded border border-border bg-bg px-2 py-1 text-sm" />
          <input placeholder="Full name" value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className="rounded border border-border bg-bg px-2 py-1 text-sm" />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="rounded border border-border bg-bg px-2 py-1 text-sm">
            {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
          <input placeholder="Initial password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="rounded border border-border bg-bg px-2 py-1 text-sm" />
          <button onClick={() => create.mutate()} disabled={create.isPending}
            className="rounded bg-brand px-3 py-1 text-sm text-brand-fg disabled:opacity-50 sm:col-span-2">
            Create
          </button>
          {create.isError && (
            <div className="text-xs text-danger sm:col-span-2">{(create.error as Error).message}</div>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Active</th>
              <th className="px-4 py-2 font-medium">Last login</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((u: AdminUserRow) => (
              <tr key={u.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2">
                  {u.email}
                  <div className="text-xs text-muted">{u.full_name}</div>
                </td>
                <td className="px-4 py-2">
                  <select
                    value={u.role}
                    onChange={(e) => patch.mutate({ id: u.id, body: { role: e.target.value } })}
                    className="rounded border border-border bg-bg px-1 py-0.5 text-xs"
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => patch.mutate({ id: u.id, body: { is_active: !u.is_active } })}
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      u.is_active ? "bg-ok/15 text-ok" : "bg-danger/15 text-danger"
                    }`}
                  >
                    {u.is_active ? "Active" : "Disabled"}
                  </button>
                </td>
                <td className="px-4 py-2 text-xs text-muted">
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AuditSection() {
  const { data, isError } = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => api.adminAudit({ limit: 60 }),
    refetchInterval: 10000,
  });
  if (isError) return null;
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Activity log</h2>
        <span className="text-xs text-muted">
          {data?.total ?? 0} events · tamper-evident, never edited or deleted
        </span>
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-xs">
          <tbody>
            {data?.items.map((e) => (
              <tr key={e.seq} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-1 tabular-nums text-muted">{e.seq}</td>
                <td className="px-3 py-1 text-muted">{new Date(e.at).toLocaleString()}</td>
                <td className="px-3 py-1">{e.actor}</td>
                <td className="px-3 py-1">{auditActionLabel(e.action)}</td>
                <td className="px-3 py-1 text-muted">
                  {e.target_type}
                  {e.target_id ? `:${e.target_id.slice(0, 8)}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function QualitySection() {
  const { data, isError } = useQuery({
    queryKey: ["admin-quality"],
    queryFn: api.adminExtractionQuality,
  });
  if (isError || !data) return null;
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold">Extraction quality</h2>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <span className="rounded bg-surface-2 px-2 py-0.5">
          values extracted <b>{data.total_fields}</b>
        </span>
        <span className="rounded bg-surface-2 px-2 py-0.5">
          accepted automatically <b>{Math.round(data.auto_accept_rate * 100)}%</b>
        </span>
        <span className="rounded bg-surface-2 px-2 py-0.5">
          average confidence <b>{Math.round(data.mean_confidence * 100)}%</b>
        </span>
        <span className="rounded bg-surface-2 px-2 py-0.5">
          from scans <b>{Math.round(data.ocr_page_ratio * 100)}%</b>
        </span>
        <span className="rounded bg-surface-2 px-2 py-0.5">
          reviewed: {data.review_outcomes.verified ?? 0} confirmed ·{" "}
          {data.review_outcomes.rejected ?? 0} rejected ·{" "}
          {data.review_outcomes.pending ?? 0} waiting
        </span>
      </div>
      <table className="mt-3 text-xs">
        <tbody>
          {Object.entries(data.by_doc_type).map(([t, v]) => (
            <tr key={t}>
              <td className="py-0.5 pr-4 text-muted">{docTypeLabel(t)}</td>
              <td className="py-0.5 pr-4">{v.fields} values</td>
              <td className="py-0.5">{Math.round(v.mean_confidence * 100)}% avg. confidence</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function AdminPage() {
  return (
    <div className="mx-auto min-w-0 max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Platform totals, who can sign in and with what access, a complete record of
          every action taken, and how well extraction is performing. Needs an IT
          administrator or ministry sign-in.
        </p>
      </header>
      <OverviewSection />
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <UsersSection />
        <QualitySection />
      </div>
      <AuditSection />
    </div>
  );
}
