import type { z } from "zod";
import { clearSession, getSession, getToken } from "@/lib/auth";
import type { FieldError } from "./schemas";

export const API_BASE = `${(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")}/api`;

declare global {
  interface Window {
    // requêtes lancées par index.html avant que le JS soit chargé, et leurs réponses
    __BRAISE_PREFETCH__?: Record<string, Promise<unknown>>;
    __BRAISE_DATA__?: Record<string, unknown>;
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly errors: FieldError[];
  readonly missing: string[];
  readonly payload: unknown;

  constructor(status: number, detail: string, payload: unknown = null) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.payload = payload;
    const body = (payload ?? {}) as { errors?: FieldError[] | null; missing?: string[] | null };
    this.errors = body.errors ?? [];
    this.missing = body.missing ?? [];
  }

  // texte à afficher dans un toast
  get userMessage(): string {
    if (this.detail === "incomplete") return "Recette incomplète : complétez les sections signalées.";
    if (this.detail === "invalid" || this.detail === "slug_locked") return this.errors[0]?.message ?? "Saisie invalide.";
    if (this.detail === "not_published") return this.errors[0]?.message ?? "Recette non publiée.";
    return this.detail;
  }
}

// si index.html a déjà reçu la réponse, on s'en sert pour le 1er rendu (pas de skeleton)
export function prefetchedData<T>(path: string): T | undefined {
  if (getSession()) return undefined; // connecté en admin : on veut des données fraîches
  return window.__BRAISE_DATA__?.[API_BASE + path] as T | undefined;
}

function takePrefetched(url: string): Promise<unknown> | undefined {
  const store = window.__BRAISE_PREFETCH__;
  if (!store || !(url in store)) return undefined;
  const pending = store[url];
  delete store[url];
  return pending;
}

export interface RequestOptions<T> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  schema?: z.ZodType<T>;
  auth?: boolean;
  signal?: AbortSignal;
  keepalive?: boolean;
}

export function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api<T = unknown>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const { method = "GET", body, schema, auth = false, signal, keepalive } = options;
  const url = API_BASE + path;
  const parse = (data: unknown) => (schema ? schema.parse(data) : (data as T));

  if (method === "GET" && !auth && !getSession()) {
    const prefetched = takePrefetched(url);
    if (prefetched) {
      try {
        return parse(await prefetched);
      } catch {
        // le préchargement a échoué, on refait la requête
      }
    }
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (!token) {
      clearSession();
      throw new ApiError(401, "Session expirée : reconnectez-vous.");
    }
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal,
      keepalive,
      // l'admin doit voir ce qu'il vient de publier, sans attendre la fin du cache HTTP (60 s)
      cache: method === "GET" && !auth && getSession() ? "no-cache" : undefined,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(0, "Connexion au serveur impossible. Vérifiez votre réseau, puis réessayez.");
  }

  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (auth && (response.status === 401 || response.status === 403)) clearSession();
    const detail = (data as { detail?: unknown } | null)?.detail;
    throw new ApiError(response.status, typeof detail === "string" ? detail : `Erreur ${response.status}`, data);
  }
  return parse(data);
}

// query string sans les valeurs vides (l'ordre compte : il doit coller au préchargement)
export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

// message affichable, quelle que soit l'erreur
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.userMessage;
  if (error instanceof Error && error.name !== "ZodError") return error.message;
  return "Une erreur inattendue est survenue.";
}
