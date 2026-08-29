import type { AuthUser } from "./types";

const TOKEN_KEY = "coalmind-token";
const USER_KEY = "coalmind-user";

let listeners: (() => void)[] = [];
const notify = () => listeners.forEach((f) => f());

export function onAuthChange(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((f) => f !== fn);
  };
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// useSyncExternalStore requires a stable snapshot — cache the parsed object and
// only re-parse when the underlying string actually changes.
let _raw: string | null = null;
let _user: AuthUser | null = null;

export function getUser(): AuthUser | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(USER_KEY);
  } catch {
    raw = null;
  }
  if (raw !== _raw) {
    _raw = raw;
    try {
      _user = raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      _user = null;
    }
  }
  return _user;
}

export function setSession(token: string, user: AuthUser): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* storage unavailable */
  }
  notify();
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
  notify();
}
