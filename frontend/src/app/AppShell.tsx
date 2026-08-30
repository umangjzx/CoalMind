import { NavLink, Outlet, useLocation } from "react-router-dom";
import { NAV } from "@/app/nav";
import { HealthBadge } from "@/components/HealthBadge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";

/* ── Nav icons (inline SVG, keeps zero dependencies) ─────────────────── */
const NAV_ICONS: Record<string, JSX.Element> = {
  "/": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  "/ingestion": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/>
      <line x1="9" y1="15" x2="15" y2="15"/>
    </svg>
  ),
  "/knowledge": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><circle cx="4" cy="7" r="2"/><circle cx="20" cy="7" r="2"/>
      <circle cx="4" cy="17" r="2"/><circle cx="20" cy="17" r="2"/>
      <line x1="6" y1="7" x2="9" y2="10"/><line x1="18" y1="7" x2="15" y2="10"/>
      <line x1="6" y1="17" x2="9" y2="14"/><line x1="18" y1="17" x2="15" y2="14"/>
    </svg>
  ),
  "/reports": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  "/query": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  "/topics": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
  "/anomalies": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  "/validation": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  ),
  "/admin": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/>
    </svg>
  ),
};

/* ── Section groupings for visual separation ─────────────────────────── */
const NAV_SECTIONS = [
  { label: "Overview",     routes: ["/", "/ingestion"] },
  { label: "Intelligence", routes: ["/knowledge", "/reports", "/query", "/topics"] },
  { label: "Operations",   routes: ["/anomalies", "/validation", "/admin"] },
];

function SidebarNav() {
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-2">
      {NAV_SECTIONS.map((section, si) => {
        const items = NAV.filter((n) => section.routes.includes(n.to));
        return (
          <div key={section.label} className={si > 0 ? "mt-4" : ""}>
            <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-faint select-none">
              {section.label}
            </div>
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      [
                        "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-all duration-150",
                        isActive
                          ? "bg-brand text-brand-fg shadow-sm"
                          : "text-fg hover:bg-surface-2 hover:text-fg",
                      ].join(" ")
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className={`shrink-0 transition-opacity ${isActive ? "opacity-100" : "opacity-50 group-hover:opacity-80"}`}>
                          {NAV_ICONS[item.to]}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {!item.built && (
                          <span className="ml-auto shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-faint">
                            {item.milestone}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Breadcrumb() {
  const location = useLocation();
  const active = NAV.find((n) =>
    n.to === "/" ? location.pathname === "/" : location.pathname.startsWith(n.to),
  );
  return (
    <nav className="flex items-center gap-1.5 text-[12px] text-muted" aria-label="breadcrumb">
      <span className="text-faint">CoalMind</span>
      {active && active.to !== "/" && (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 opacity-40">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <span className="font-medium text-fg">{active.label}</span>
        </>
      )}
      {active?.to === "/" && <span className="font-medium text-fg">Dashboard</span>}
    </nav>
  );
}

export function AppShell() {
  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <aside className="hidden w-[210px] shrink-0 flex-col border-r border-border bg-surface md:flex" style={{ boxShadow: "var(--shadow-xs)" }}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand text-brand-fg">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold tracking-tight text-fg">CoalMind AI</div>
            <div className="text-[10px] text-faint">CMPDI · CIL</div>
          </div>
        </div>

        <SidebarNav />

        {/* Footer */}
        <div className="border-t border-border px-3 py-2.5">
          <div className="text-[10px] text-faint">SIH 2026 · Problem Statement 26023</div>
          <div className="mt-0.5 text-[10px] text-faint">Intelligent Geological & Mining Platform</div>
        </div>
      </aside>

      {/* ── Main column ──────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-5 py-2.5" style={{ boxShadow: "var(--shadow-xs)" }}>
          {/* Breadcrumb */}
          <Breadcrumb />

          <div className="ml-auto flex items-center gap-2">
            <HealthBadge />
            <UserMenu />
            <ThemeToggle />
          </div>
        </header>

        {/* Page content */}
        <main className="min-w-0 flex-1 overflow-y-auto bg-bg p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
