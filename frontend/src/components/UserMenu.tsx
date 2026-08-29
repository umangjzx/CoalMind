import { useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearSession, getUser, onAuthChange } from "@/lib/auth";

export function UserMenu() {
  const user = useSyncExternalStore(onAuthChange, getUser, () => null);
  const nav = useNavigate();

  if (!user) {
    return (
      <Link
        to="/login"
        className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-surface-2"
      >
        Sign in
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="hidden sm:block text-muted">
        {user.email} · <span className="capitalize">{user.role.replace(/_/g, " ")}</span>
      </span>
      <button
        onClick={() => {
          clearSession();
          nav("/login");
        }}
        className="rounded-md border border-border px-2.5 py-1.5 hover:bg-surface-2"
      >
        Logout
      </button>
    </div>
  );
}
