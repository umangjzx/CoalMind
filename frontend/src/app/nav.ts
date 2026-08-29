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
  { to: "/ingestion", label: "Upload & Review", blurb: "Add documents and confirm low-confidence values", milestone: "M1", built: true },
  { to: "/knowledge", label: "Facts & Entities", blurb: "Browse extracted facts and search by meaning", milestone: "M2", built: true },
  { to: "/reports", label: "Report Builder", blurb: "Template-driven, cited, parliament-ready drafts", milestone: "M3", built: true },
  { to: "/query", label: "Ask CoalMind", blurb: "Natural-language questions with source chains", milestone: "M4", built: true },
  { to: "/topics", label: "Topics & Trends", blurb: "Word cloud and topic trends over time", milestone: "M5", built: true },
  { to: "/anomalies", label: "Anomalies", blurb: "Historical-vs-new inconsistencies flagged for review", milestone: "M7", built: true },
  { to: "/validation", label: "Validation", blurb: "How accuracy and speed were measured", milestone: "M7", built: true },
  { to: "/admin", label: "Admin", blurb: "RBAC, audit log, ingestion monitoring", milestone: "M6", built: true },
];
