import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { setSession } from "@/lib/auth";
import { Card } from "@/components/primitives";

const DEMO = [
  ["admin@coalindia.in", "CIL IT Admin"],
  ["officer@cmpdi.co.in", "CMPDI Reporting Officer"],
  ["ministry@coal.gov.in", "Ministry of Coal"],
  ["geologist@ccl.co.in", "CCL Geologist (scoped)"],
];

export function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("coalmind");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api.login(email.trim(), password);
      setSession(r.access_token, r.user);
      nav("/");
    } catch {
      setErr("Invalid email or password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-full place-items-center bg-bg p-6">
      <Card className="w-full max-w-sm p-6">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-brand text-brand-fg font-bold">
            C
          </div>
          <div>
            <div className="font-semibold">CoalMind AI</div>
            <div className="text-xs text-muted">Sign in</div>
          </div>
        </div>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            className="w-full rounded border border-border bg-bg px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            className="w-full rounded border border-border bg-bg px-3 py-2 text-sm"
          />
          {err && <div className="text-xs text-danger">{err}</div>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-brand px-3 py-2 text-sm text-brand-fg disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="mt-4 border-t border-border pt-3 text-xs text-muted">
          Demo accounts (password <code>coalmind</code>):
          <ul className="mt-1 space-y-0.5">
            {DEMO.map(([e, label]) => (
              <li key={e}>
                <button
                  onClick={() => setEmail(e)}
                  className="text-brand hover:underline"
                >
                  {e}
                </button>{" "}
                — {label}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Or just <button onClick={() => nav("/")} className="text-brand hover:underline">
              continue without signing in
            </button> (dev mode).
          </p>
        </div>
      </Card>
    </div>
  );
}
