import { NavLink, Outlet } from "react-router-dom";
import { NAV } from "@/app/nav";
import { HealthBadge } from "@/components/HealthBadge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";

export function AppShell() {
  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-brand text-brand-fg font-bold">
            C
          </div>
          <div className="leading-tight">
            <div className="font-semibold">CoalMind AI</div>
            <div className="text-xs text-muted">CMPDI / CIL</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                [
                  "block rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-brand text-brand-fg"
                    : "text-fg hover:bg-surface-2",
                ].join(" ")
              }
            >
              <div className="flex items-center justify-between">
                <span>{item.label}</span>
                {!item.built && (
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                    {item.milestone}
                  </span>
                )}
              </div>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3 text-xs text-muted">
          SIH 2026 · PS 26023
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-6 py-3">
          <div className="text-sm text-muted">
            Intelligent Geological, Mining &amp; Reporting Platform
          </div>
          <div className="flex items-center gap-3">
            <HealthBadge />
            <UserMenu />
            <ThemeToggle />
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
