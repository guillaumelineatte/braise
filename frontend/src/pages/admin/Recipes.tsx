import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { invalidateAfterChange, recipeApi, useAdminCategories, useAdminRecipes, adminKeys, type AdminRecipeFilters } from "@/api/admin";
import { ApiError, errorMessage } from "@/api/client";
import type { Page, RecipeAdminRow } from "@/api/schemas";
import { Thumb } from "@/components/admin/RecipeRowLink";
import { Button, ButtonLink } from "@/components/Button";
import { ConfirmDialog } from "@/components/Dialog";
import { Select } from "@/components/Select";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { formatInteger, formatRelative, plural } from "@/lib/format";
import { useDebouncedValue, useNow } from "@/lib/hooks";
import { missingSentence } from "@/lib/missing";

type ToggleField = "is_published" | "is_featured" | "is_dietetic";
type SortKey = NonNullable<AdminRecipeFilters["sort"]>;

const STATUS = [
  { value: "all", label: "Tous les statuts" },
  { value: "published", label: "Publiées" },
  { value: "draft", label: "Brouillons" },
];
const DIET = [
  { value: "all", label: "Diététique ou non" },
  { value: "true", label: "Diététiques" },
  { value: "false", label: "Non diététiques" },
];

// interrupteurs du tableau : on met à jour tout de suite, et on annule si l'API refuse
function useRowToggle() {
  const client = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ row, field, value }: { row: RecipeAdminRow; field: ToggleField; value: boolean }) => {
      if (field === "is_published") return recipeApi.action(row.id, value ? "publish" : "unpublish");
      if (field === "is_featured") return recipeApi.action(row.id, value ? "feature" : "unfeature");
      return recipeApi.patch(row.id, { is_dietetic: value });
    },
    onMutate: async ({ row, field, value }) => {
      await client.cancelQueries({ queryKey: adminKeys.recipesAll });
      const snapshot = client.getQueriesData<Page<RecipeAdminRow>>({ queryKey: adminKeys.recipesAll });
      client.setQueriesData<Page<RecipeAdminRow>>({ queryKey: adminKeys.recipesAll }, (page) =>
        page
          ? {
              ...page,
              items: page.items.map((item) => {
                if (item.id === row.id) {
                  const next = { ...item, [field]: value };
                  if (field === "is_published" && !value) next.is_featured = false;
                  return next;
                }
                return field === "is_featured" && value ? { ...item, is_featured: false } : item;
              }),
            }
          : page,
      );
      return { snapshot };
    },
    onError: (error, { row }, context) => {
      context?.snapshot.forEach(([key, data]) => client.setQueryData(key, data));
      if (error instanceof ApiError && error.detail === "incomplete") {
        toast.show(`« ${row.title} » ne peut pas être publiée : ${missingSentence(error.missing)}.`, {
          tone: "error",
          action: { label: "Compléter", onClick: () => navigate(`/admin/recipes/${row.id}`) },
        });
      } else {
        toast.error(errorMessage(error));
      }
    },
    onSuccess: (recipe, { field, value }) => {
      invalidateAfterChange(client, recipe);
      if (field === "is_published") toast.show(value ? `« ${recipe.title} » est en ligne.` : `« ${recipe.title} » est retirée du site.`);
      if (field === "is_featured" && value) toast.show(`« ${recipe.title} » est désormais en avant.`);
    },
  });
}

export default function Recipes() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const now = useNow(30_000);
  const filters: AdminRecipeFilters = useMemo(
    () => ({
      q: params.get("q") ?? "",
      status: (params.get("status") as AdminRecipeFilters["status"]) ?? "all",
      category: params.get("category"),
      dietetic: params.get("dietetic") == null ? null : params.get("dietetic") === "true",
      sort: (params.get("sort") as SortKey) ?? "updated_at",
      order: (params.get("order") as "asc" | "desc") ?? "desc",
      page: Number(params.get("page") ?? 1) || 1,
    }),
    [params],
  );
  const [search, setSearch] = useState(filters.q ?? "");
  const debounced = useDebouncedValue(search, 250);
  const { data, isPending, error, isPlaceholderData } = useAdminRecipes(filters);
  const categories = useAdminCategories();
  const toggle = useRowToggle();
  const [toDelete, setToDelete] = useState<RecipeAdminRow | null>(null);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((filters.q ?? "") !== debounced.trim()) update({ q: debounced.trim() || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const duplicate = useMutation({
    mutationFn: (row: RecipeAdminRow) => recipeApi.action(row.id, "duplicate"),
    onSuccess: (copy) => {
      invalidateAfterChange(client, copy);
      toast.show("Copie créée : vous éditez le brouillon.");
      navigate(`/admin/recipes/${copy.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (row: RecipeAdminRow) => recipeApi.remove(row.id),
    onSuccess: (_, row) => {
      invalidateAfterChange(client);
      client.removeQueries({ queryKey: adminKeys.recipe(row.id) });
      toast.show(`« ${row.title} » a été supprimée.`);
      setToDelete(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const sortHeader = (key: SortKey, label: string, className?: string) => {
    const active = filters.sort === key;
    const nextOrder = active && filters.order === "desc" ? "asc" : active ? "desc" : key === "title" ? "asc" : "desc";
    return (
      <th className={className} aria-sort={active ? (filters.order === "asc" ? "ascending" : "descending") : undefined}>
        <button type="button" onClick={() => update({ sort: key, order: nextOrder })}>
          {label}
          <span className="arrow" aria-hidden="true" />
        </button>
      </th>
    );
  };

  const categoryOptions = [{ value: "", label: "Toutes les catégories" }, ...(categories.data ?? []).map((c) => ({ value: c.slug, label: c.name }))];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="serif">Recettes</h1>
          <p aria-live="polite">{data ? plural(data.total, "recette") : " "}</p>
        </div>
        <ButtonLink to="/admin/recipes/new" variant="primary">
          Nouvelle recette
        </ButtonLink>
      </div>

      <section className="panel">
        <div className="toolbar">
          <div className="field search">
            <label className="label" htmlFor="admin-search">
              Rechercher
            </label>
            <input id="admin-search" className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Titre, description, ingrédient…" />
          </div>
          <Select label="Statut" value={filters.status ?? "all"} options={STATUS} onChange={(value) => update({ status: value === "all" ? null : value })} />
          <Select label="Catégorie" value={filters.category ?? ""} options={categoryOptions} onChange={(value) => update({ category: value || null })} />
          <Select
            label="Diététique"
            value={filters.dietetic == null ? "all" : String(filters.dietetic)}
            options={DIET}
            onChange={(value) => update({ dietetic: value === "all" ? null : value })}
          />
        </div>

        {error ? (
          <p className="empty-row" role="alert">
            {errorMessage(error)}
          </p>
        ) : (
          <div className="table-wrap" style={{ opacity: isPlaceholderData ? 0.6 : 1, transition: "opacity 300ms var(--ease)" }}>
            <table className="table">
              <thead>
                <tr>
                  {sortHeader("title", "Titre")}
                  <th className="opt">Catégorie</th>
                  {sortHeader("calories", "Calories", "opt num")}
                  {sortHeader("published_at", "Publiée")}
                  <th>En avant</th>
                  <th>Diététique</th>
                  {sortHeader("updated_at", "Modifiée", "opt")}
                  <th className="actions">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {isPending
                  ? Array.from({ length: 6 }, (_, i) => (
                      <tr key={i}>
                        <td colSpan={8}>
                          <Skeleton line style={{ width: `${40 + i * 7}%`, margin: "8px 0" }} />
                        </td>
                      </tr>
                    ))
                  : data?.items.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <div className="title-cell">
                            <Thumb thumbnail={row.thumbnail} />
                            <Link to={`/admin/recipes/${row.id}`}>{row.title}</Link>
                          </div>
                        </td>
                        <td className="opt muted">{row.category.name}</td>
                        <td className="opt num">{row.calories == null ? "—" : formatInteger(row.calories)}</td>
                        <td>
                          <Toggle
                            compact
                            tone="accent"
                            label={`Publier « ${row.title} »`}
                            checked={row.is_published}
                            onChange={(value) => toggle.mutate({ row, field: "is_published", value })}
                          />
                        </td>
                        <td>
                          <Toggle
                            compact
                            tone="accent"
                            label={`Mettre « ${row.title} » en avant`}
                            checked={row.is_featured}
                            disabled={!row.is_published}
                            onChange={(value) => toggle.mutate({ row, field: "is_featured", value })}
                          />
                        </td>
                        <td>
                          <Toggle compact label={`« ${row.title} » diététique`} checked={row.is_dietetic} onChange={(value) => toggle.mutate({ row, field: "is_dietetic", value })} />
                        </td>
                        <td className="opt muted">{formatRelative(row.updated_at, now)}</td>
                        <td className="actions">
                          <Link className="btn quiet small" to={`/admin/recipes/${row.id}`} aria-label={`Éditer « ${row.title} »`}>
                            Éditer
                          </Link>
                          <Button variant="quiet" small onClick={() => duplicate.mutate(row)} disabled={duplicate.isPending} aria-label={`Dupliquer « ${row.title} »`}>
                            Dupliquer
                          </Button>
                          <Button variant="quiet" small danger onClick={() => setToDelete(row)} aria-label={`Supprimer « ${row.title} »`}>
                            Supprimer
                          </Button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {data && data.items.length === 0 && (
              <p className="empty-row">
                {filters.q || filters.category || filters.status !== "all" || filters.dietetic != null
                  ? "Aucune recette ne correspond à ces critères."
                  : "Aucune recette pour l'instant. La première commence par un titre."}
              </p>
            )}
          </div>
        )}
        {data && data.pages > 1 && (
          <div className="pager">
            <Button small disabled={data.page <= 1} onClick={() => update({ page: String(data.page - 1) })}>
              Précédente
            </Button>
            <span>
              Page {data.page} sur {data.pages}
            </span>
            <Button small disabled={data.page >= data.pages} onClick={() => update({ page: String(data.page + 1) })}>
              Suivante
            </Button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={toDelete != null}
        title={`Supprimer « ${toDelete?.title ?? ""} » ?`}
        message="La recette, ses ingrédients et ses étapes seront supprimés définitivement. Son image reste dans la médiathèque jusqu'au prochain nettoyage."
        confirmLabel="Supprimer"
        danger
        busy={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
