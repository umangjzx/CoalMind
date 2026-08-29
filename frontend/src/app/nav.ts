export interface NavItem {
  to: string;
  label: string;
  blurb: string;
  /** milestone that delivers this area — shown as a chip until it's real */
  milestone: string;
}

export const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", blurb: "Corpus health, review queue, trending topics", milestone: "M0" },
  { to: "/ingestion", label: "Ingestion & Review", blurb: "Upload documents, verify low-confidence fields", milestone: "M1" },
  { to: "/reports", label: "Report Builder", blurb: "Template-driven, cited, parliament-ready drafts", milestone: "M3" },
  { to: "/query", label: "Ask CoalMind", blurb: "Natural-language questions with source chains", milestone: "M4" },
  { to: "/topics", label: "Topics & Trends", blurb: "Word cloud and topic trends over time", milestone: "M5" },
  { to: "/admin", label: "Admin", blurb: "RBAC, audit log, ingestion monitoring", milestone: "M6" },
];
