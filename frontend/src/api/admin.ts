import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { getToken } from "@/lib/auth";
import { api, API_BASE, ApiError, query } from "./client";
import {
  AdminMe,
  CategoryAdmin,
  Dashboard,
  ImageOut,
  PageRecipeAdminRow,
  RecipeAdmin,
  Token,
  type RecipeCreate,
  type RecipeUpdate,
} from "./schemas";

export interface AdminRecipeFilters {
  q?: string;
  status?: "published" | "draft" | "all";
  category?: string | null;
  dietetic?: boolean | null;
  sort?: "updated_at" | "title" | "calories" | "published_at";
  order?: "asc" | "desc";
  page?: number;
}

export const adminKeys = {
  all: ["admin"] as const,
  me: ["admin", "me"] as const,
  dashboard: ["admin", "dashboard"] as const,
  recipes: (filters: AdminRecipeFilters) => ["admin", "recipes", filters] as const,
  recipesAll: ["admin", "recipes"] as const,
  recipe: (id: number) => ["admin", "recipe", id] as const,
  categories: ["admin", "categories"] as const,
};

const auth = { auth: true } as const;

// ---------------------------------------------------------------- requêtes

export function useMe() {
  return useQuery({ queryKey: adminKeys.me, queryFn: () => api("/auth/me", { ...auth, schema: AdminMe }), staleTime: 5 * 60_000, retry: false });
}

export function useDashboard() {
  return useQuery({ queryKey: adminKeys.dashboard, queryFn: () => api("/admin/dashboard", { ...auth, schema: Dashboard }), staleTime: 0 });
}

export function useAdminRecipes(filters: AdminRecipeFilters) {
  return useQuery({
    queryKey: adminKeys.recipes(filters),
    queryFn: () =>
      api(
        `/admin/recipes${query({
          q: filters.q?.trim(),
          status: filters.status && filters.status !== "all" ? filters.status : undefined,
          category: filters.category,
          dietetic: filters.dietetic == null ? undefined : String(filters.dietetic),
          sort: filters.sort,
          order: filters.order,
          page: filters.page && filters.page > 1 ? filters.page : undefined,
          page_size: 25,
        })}`,
        { ...auth, schema: PageRecipeAdminRow },
      ),
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
}

export function useAdminRecipe(id: number | null) {
  return useQuery({
    queryKey: adminKeys.recipe(id ?? 0),
    queryFn: () => api(`/admin/recipes/${id}`, { ...auth, schema: RecipeAdmin }),
    enabled: id != null,
    staleTime: Infinity, // c'est l'éditeur qui met le cache à jour après chaque sauvegarde
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
  });
}

export function useAdminCategories() {
  return useQuery({ queryKey: adminKeys.categories, queryFn: () => api("/admin/categories", { ...auth, schema: z.array(CategoryAdmin) }), staleTime: 0 });
}

// ---------------------------------------------------------------- actions

export const login = (email: string, password: string) => api("/auth/login", { method: "POST", body: { email, password }, schema: Token });

export const recipeApi = {
  create: (body: RecipeCreate) => api("/admin/recipes", { ...auth, method: "POST", body, schema: RecipeAdmin }),
  patch: (id: number, body: RecipeUpdate, keepalive = false) =>
    api(`/admin/recipes/${id}`, { ...auth, method: "PATCH", body, schema: RecipeAdmin, keepalive }),
  put: (id: number, body: RecipeCreate) => api(`/admin/recipes/${id}`, { ...auth, method: "PUT", body, schema: RecipeAdmin }),
  action: (id: number, action: "publish" | "unpublish" | "feature" | "unfeature" | "duplicate") =>
    api(`/admin/recipes/${id}/${action}`, { ...auth, method: "POST", schema: RecipeAdmin }),
  remove: (id: number) => api<void>(`/admin/recipes/${id}`, { ...auth, method: "DELETE" }),
};

export const categoryApi = {
  create: (name: string) => api("/admin/categories", { ...auth, method: "POST", body: { name }, schema: CategoryAdmin }),
  rename: (id: number, name: string) => api(`/admin/categories/${id}`, { ...auth, method: "PATCH", body: { name }, schema: CategoryAdmin }),
  remove: (id: number) => api<void>(`/admin/categories/${id}`, { ...auth, method: "DELETE" }),
  reorder: (ids: number[]) => api("/admin/categories/reorder", { ...auth, method: "POST", body: { ids }, schema: z.array(CategoryAdmin) }),
};

export const updateImageAlt = (id: number, alt: string) =>
  api(`/admin/images/${id}`, { ...auth, method: "PATCH", body: { alt }, schema: ImageOut });

export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

// XHR et pas fetch : fetch ne donne pas la progression de l'upload
export function uploadImage(
  file: File,
  options: { alt?: string; crop?: Crop | null; onProgress?: (ratio: number) => void; signal?: AbortSignal } = {},
): Promise<ImageOut> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    if (options.alt) form.append("alt", options.alt);
    if (options.crop) {
      form.append("crop_x", String(Math.round(options.crop.x)));
      form.append("crop_y", String(Math.round(options.crop.y)));
      form.append("crop_w", String(Math.round(options.crop.w)));
      form.append("crop_h", String(Math.round(options.crop.h)));
    }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/admin/uploads`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => event.lengthComputable && options.onProgress?.(event.loaded / event.total);
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // réponse vide
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const parsed = ImageOut.safeParse(data);
        if (parsed.success) resolve(parsed.data);
        else reject(new ApiError(500, "Réponse inattendue du serveur."));
      } else {
        const detail = (data as { detail?: string } | null)?.detail;
        reject(new ApiError(xhr.status, typeof detail === "string" ? detail : `Erreur ${xhr.status}`, data));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "Envoi impossible : vérifiez votre connexion."));
    xhr.onabort = () => reject(new DOMException("Envoi annulé", "AbortError"));
    options.signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}

// à appeler après chaque modif : les listes (admin et site) seront rechargées à leur prochain affichage
export function invalidateAfterChange(client: QueryClient, recipe?: z.infer<typeof RecipeAdmin>) {
  if (recipe) client.setQueryData(adminKeys.recipe(recipe.id), recipe);
  void client.invalidateQueries({ queryKey: adminKeys.recipesAll });
  void client.invalidateQueries({ queryKey: adminKeys.dashboard });
  void client.invalidateQueries({ queryKey: adminKeys.categories });
  void client.invalidateQueries({ queryKey: ["recipes"] });
  void client.invalidateQueries({ queryKey: ["categories"] });
}
