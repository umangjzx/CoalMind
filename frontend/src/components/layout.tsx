import type { ReactNode } from "react";

/** Consistent page shell — a wide-but-capped container so data fills the screen
 *  on a monitor without the text measure running away. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1440px] space-y-5">{children}</div>;
}

/** Standard title block. `actions` sits on the right on wide screens. */
export function PageHeader({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {children && (
          <p className="mt-1 max-w-[70ch] text-sm text-muted">{children}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
