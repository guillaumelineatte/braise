import { keepPreviousData, useInfiniteQuery, useQuery, type QueryClient } from "@tanstack/react-query";
import { api, prefetchedData, query } from "./client";
import type { CategoryOut, Page, RecipeCard, RecipeDetail } from "./schemas";

type SchemaName = "RecipeCard" | "RecipeDetail" | "Page_RecipeCard_" | "CategoryOut[]";

// Pas de Zod en prod côté public (30 Ko de gagnés au chargement).
// En dev, on valide quand même chaque réponse pour repérer les écarts avec l'API.
async function get<T>(path: string, schema: SchemaName, signal?: AbortSignal): Promise<T> {
  const data = await api<T>(path, { signal });
  if (import.meta.env.DEV) {
    const schemas = await import("./schemas");
    const { z } = await import("zod");
    const validator = schema === "CategoryOut[]" ? z.array(schemas.CategoryOut) : schema === "Page_RecipeCard_" ? schemas.PageRecipeCard : schemas[schema];
    const result = validator.safeParse(data);
    if (!result.success) console.error(`Réponse ${path} non conforme au schéma ${schema}`, result.error.issues);
  }
  return data;
}

export const PAGE_SIZE = 12;

export interface RecipeFilters {
  category?: string | null;
  dietetic?: boolean;
  max_prep_time?: number | null;
  q?: string;
  sort?: "date" | "calories";
  order?: "asc" | "desc";
}

export const keys = {
  featured: ["recipes", "featured"] as const,
  list: (filters: RecipeFilters) => ["recipes", "list", filters] as const,
  latest: (size: number) => ["recipes", "latest", size] as const,
  detail: (slug: string) => ["recipes", "detail", slug] as const,
  categories: ["categories"] as const,
};

// ne pas changer l'ordre des paramètres : l'URL doit être identique à celle préchargée dans index.html
function listPath(filters: RecipeFilters, page: number, pageSize = PAGE_SIZE): string {
  return `/recipes${query({
    category: filters.category,
    dietetic: filters.dietetic,
    max_prep_time: filters.max_prep_time,
    q: filters.q?.trim(),
    sort: filters.sort && filters.sort !== "date" ? filters.sort : undefined,
    order: filters.order && filters.order !== "desc" ? filters.order : undefined,
    page: page > 1 ? page : undefined,
    page_size: pageSize,
  })}`;
}

export const fetchRecipe = (slug: string) => get<RecipeDetail>(`/recipes/${encodeURIComponent(slug)}`, "RecipeDetail");

// réutilise la réponse préchargée pour que le 1er rendu soit direct (sinon la page saute)
function initial<T>(path: string) {
  const data = prefetchedData<T>(path);
  return data === undefined ? {} : { initialData: data, initialDataUpdatedAt: Date.now() };
}

export function useFeatured() {
  return useQuery({
    queryKey: keys.featured,
    ...initial<RecipeCard>("/recipes/featured"),
    queryFn: () => get<RecipeCard>("/recipes/featured", "RecipeCard"),
    retry: (count, error) => (error as { status?: number }).status !== 404 && count < 2,
  });
}

export function useLatest(size = PAGE_SIZE) {
  return useQuery({
    queryKey: keys.latest(size),
    ...initial<Page<RecipeCard>>(listPath({}, 1, size)),
    queryFn: () => get<Page<RecipeCard>>(listPath({}, 1, size), "Page_RecipeCard_"),
  });
}

export function useRecipes(filters: RecipeFilters) {
  const first = prefetchedData<Page<RecipeCard>>(listPath(filters, 1));
  return useInfiniteQuery({
    queryKey: keys.list(filters),
    ...(first ? { initialData: { pages: [first], pageParams: [1] }, initialDataUpdatedAt: Date.now() } : {}),
    queryFn: ({ pageParam, signal }) => get<Page<RecipeCard>>(listPath(filters, pageParam), "Page_RecipeCard_", signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
}

export function useRecipe(slug: string, placeholder?: RecipeCard) {
  return useQuery({
    queryKey: keys.detail(slug),
    ...initial<RecipeDetail>(`/recipes/${encodeURIComponent(slug)}`),
    queryFn: () => fetchRecipe(slug),
    retry: (count, error) => (error as { status?: number }).status !== 404 && count < 2,
    // avec la carte déjà en cache on peut afficher le haut de la page tout de suite
    placeholderData: placeholder ? () => ({ ...placeholder, updated_at: "", ingredients: [], steps: [], nutrition: emptyNutrition(placeholder.calories), related: [] }) : undefined,
  });
}

function emptyNutrition(calories: number | null) {
  return { calories, protein_g: null, carbs_g: null, fat_g: null, estimated_calories: null, deviation_pct: null };
}

export function useCategories() {
  return useQuery({
    queryKey: keys.categories,
    ...initial<CategoryOut[]>("/categories"),
    queryFn: () => get<CategoryOut[]>("/categories", "CategoryOut[]"),
  });
}

// sort les cartes de n'importe quelle donnée en cache (liste infinie, page, détail...)
// attention : une Page a aussi un champ "pages", mais c'est un nombre
function cardsIn(data: unknown): RecipeCard[] {
  if (!data || typeof data !== "object") return [];
  const value = data as { pages?: unknown; items?: unknown; slug?: unknown; related?: unknown };
  if (Array.isArray(value.pages)) return value.pages.flatMap(cardsIn);
  if (Array.isArray(value.items)) return value.items as RecipeCard[];
  const cards: RecipeCard[] = typeof value.slug === "string" ? [value as RecipeCard] : [];
  if (Array.isArray(value.related)) cards.push(...(value.related as RecipeCard[]));
  return cards;
}

// cherche la recette dans ce qu'on a déjà chargé (accueil, liste...)
export function findCachedCard(client: QueryClient, slug: string): RecipeCard | undefined {
  for (const [, data] of client.getQueriesData<unknown>({ queryKey: ["recipes"] })) {
    const found = cardsIn(data).find((card) => card.slug === slug);
    if (found) return found;
  }
  return undefined;
}
