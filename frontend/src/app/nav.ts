export interface NavItem {
  to: string;
  label: string;
  blurb: string;
  /** milestone that delivers this area */
  milestone: string;
  /** true once the screen is actually built (hides the "coming in Mx" chip) */
  built?: boolean;
}

export const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", blurb: "Corpus health, review queue, trending topics", milestone: "M0", built: true },
  { to: "/ingestion", label: "Ingestion & Review", blurb: "Upload documents, verify low-confidence fields", milestone: "M1", built: true },
  { to: "/knowledge", label: "Knowledge Graph", blurb: "Browse mines, blocks, reserves and semantic search", milestone: "M2", built: true },
  { to: "/reports", label: "Report Builder", blurb: "Template-driven, cited, parliament-ready drafts", milestone: "M3", built: true },
  { to: "/query", label: "Ask CoalMind", blurb: "Natural-language questions with source chains", milestone: "M4", built: true },
  { to: "/topics", label: "Topics & Trends", blurb: "Word cloud and topic trends over time", milestone: "M5" },
  { to: "/admin", label: "Admin", blurb: "RBAC, audit log, ingestion monitoring", milestone: "M6" },
];
