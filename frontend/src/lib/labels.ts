/** Plain-language labels for the enum-ish strings the API returns, so officers
 *  see "Reserve status" and "Needs review" rather than `geological_reserve_status`
 *  and `needs_review`. Anything not mapped falls back to a title-cased version. */

export function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Consistent short date ("14 Aug 2023") for timestamps across the app. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Date + time ("14 Aug 2023, 4:32 pm") for the audit log and similar. */
export function shortDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Compact relative time ("just now", "5m ago", "3h ago", "2d ago", then a date). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  return shortDate(iso);
}

const DOC_TYPE_LABELS: Record<string, string> = {
  geological_reserve_status: "Reserve status report",
  monthly_production_mis: "Monthly production (MIS)",
  parliamentary_qa_response: "Parliament Q&A reply",
  inspection_report: "Mine inspection note",
  borehole_log_summary: "Borehole log",
  correspondence: "Letter / correspondence",
  unknown: "Unclassified",
};

export function docTypeLabel(t: string | null | undefined): string {
  if (!t) return "—";
  return DOC_TYPE_LABELS[t] ?? titleCase(t);
}

const DOC_STATUS_LABELS: Record<string, string> = {
  received: "Queued",
  processing: "Reading…",
  extracted: "Values extracted",
  needs_review: "Needs review",
  ready: "Ready to use",
  failed: "Failed",
};

const FIELD_STATUS_LABELS: Record<string, string> = {
  auto_accepted: "Auto-accepted",
  needs_review: "Needs review",
  verified: "Verified by you",
  rejected: "Rejected",
};

export function statusLabel(s: string | null | undefined): string {
  if (!s) return "—";
  return DOC_STATUS_LABELS[s] ?? FIELD_STATUS_LABELS[s] ?? titleCase(s);
}

const ENTITY_KIND_LABELS: Record<string, string> = {
  subsidiary: "Subsidiary",
  mine: "Mine",
  block: "Block / area",
  seam: "Coal seam",
  mineral: "Coal grade",
  reserve: "Reserve figure",
  production_figure: "Production figure",
  finding: "Inspection finding",
  inquiry: "Parliament question",
  report: "Source document",
  officer: "Officer",
};

export function entityKindLabel(k: string | null | undefined): string {
  if (!k) return "—";
  return ENTITY_KIND_LABELS[k] ?? titleCase(k);
}

const UNIT_LABELS: Record<string, string> = {
  million_tonnes: "MT",
  lakh_tonnes: "lakh t",
  lakh_cubic_metre: "lakh m³",
  cubic_metre_per_tonne: "m³/t",
  metre: "m",
  percent: "%",
};

export function unitLabel(u: string | null | undefined): string {
  if (!u) return "";
  return UNIT_LABELS[u] ?? u.replace(/_/g, " ");
}

const PREDICATE_LABELS: Record<string, string> = {
  has_reserve: "has reserve",
  produces: "produces",
  located_in: "located in",
  reported_in: "reported in",
  contains: "contains",
  for_mineral: "grade",
  supersedes: "replaces",
  responds_to: "answers",
  mentions: "mentions",
};

export function predicateLabel(p: string | null | undefined): string {
  if (!p) return "";
  return PREDICATE_LABELS[p] ?? p.replace(/_/g, " ");
}

const ANSWER_MODE_LABELS: Record<string, string> = {
  rag: "From your documents",
  search_only: "From search (AI model offline)",
  cache: "Reused a saved answer",
};

export function answerModeLabel(m: string | null | undefined): string {
  if (!m) return "";
  return ANSWER_MODE_LABELS[m] ?? titleCase(m);
}

const REPORT_TEMPLATE_LABELS: Record<string, string> = {
  geological_reserve_status: "Reserve status report",
  monthly_production_mis: "Monthly production (MIS)",
  parliamentary_qa: "Parliament Q&A reply",
  adhoc_inquiry: "Ad-hoc inquiry",
};

export function reportTemplateLabel(k: string | null | undefined): string {
  if (!k) return "—";
  return REPORT_TEMPLATE_LABELS[k] ?? titleCase(k);
}

/** report version author: "ai" | "human" */
export function authorKindLabel(k: string | null | undefined): string {
  return k === "ai" ? "AI draft" : k === "human" ? "Officer edit" : titleCase(k ?? "");
}

const ROLE_LABELS: Record<string, string> = {
  reporting_officer: "Reporting officer",
  geologist: "Geologist",
  ministry_official: "Ministry official",
  data_admin: "IT administrator",
  records_clerk: "Records clerk",
};

export function roleLabel(r: string | null | undefined): string {
  if (!r) return "—";
  return ROLE_LABELS[r] ?? titleCase(r);
}

/** audit action ids like "document.ingested" -> "Document ingested" */
export function auditActionLabel(a: string | null | undefined): string {
  if (!a) return "—";
  return titleCase(a.replace(/\./g, " "));
}

/** health-check keys -> what a person calls that dependency */
export const DEPENDENCY_LABELS: Record<string, string> = {
  db: "Database",
  storage: "Document storage",
  llm: "Language model",
  embeddings: "Search index",
};

/** health-check values -> plain words */
export function healthWord(v: string): string {
  return (
    { ok: "Online", down: "Offline", blocked: "Disabled", degraded: "Limited" }[v] ??
    titleCase(v)
  );
}
