import { useEffect, useState } from "react";

function getInitial(): boolean {
  try {
    const saved = localStorage.getItem("coalmind-theme");
    if (saved) return saved === "dark";
  } catch {
    /* storage may be unavailable */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function ThemeToggle() {
  const [dark, setDark] = useState(getInitial);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("coalmind-theme", dark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }, [dark]);

  return (
    <button
      type="button"
      onClick={() => setDark((d) => !d)}
      className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-fg hover:bg-surface-2"
      aria-label="Toggle color theme"
    >
      {dark ? "☾ Dark" : "☀ Light"}
    </button>
  );
}
