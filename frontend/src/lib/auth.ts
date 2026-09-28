import { useSyncExternalStore } from "react";

// le JWT de l'admin (valable 24 h), gardé dans le localStorage
const KEY = "braise-admin-session";

export interface Session {
  token: string;
  expiresAt: string;
  email?: string;
}

const listeners = new Set<() => void>();
let cached: Session | null | undefined;

function read(): Session | null {
  if (cached !== undefined) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    cached = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    cached = null;
  }
  return cached;
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function getSession(): Session | null {
  const session = read();
  if (!session) return null;
  if (Date.parse(session.expiresAt) <= Date.now()) return null;
  return session;
}

export function getToken(): string | null {
  return getSession()?.token ?? null;
}

export function saveSession(session: Session) {
  cached = session;
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // pas de localStorage : la session ne survivra pas au rechargement
  }
  emit();
}

export function clearSession() {
  cached = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // rien à faire
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      cached = undefined;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession, () => null);
}
