import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useCategories, useRecipes, type RecipeFilters } from "@/api/public";
import { Button } from "@/components/Button";
import { Card, CardSkeleton } from "@/components/Card";
import { DietMark } from "@/components/DietMark";
import { Drawer } from "@/components/Dialog";
import { Select } from "@/components/Select";
import { useDebouncedValue } from "@/lib/hooks";
import { plural } from "@/lib/format";
import { useMeta } from "@/lib/meta";

const SORTS = [
  { value: "date:desc", label: "Plus récentes" },
  { value: "date:asc", label: "Plus anciennes" },
  { value: "calories:asc", label: "Moins caloriques" },
  { value: "calories:desc", label: "Plus caloriques" },
];

const TIMES = [
  { value: 0, label: "Tous les temps" },
  { value: 30, label: "30 min ou moins" },
  { value: 60, label: "1 h ou moins" },
  { value: 120, label: "2 h ou moins" },
];

function readFilters(params: URLSearchParams): RecipeFilters {
  const [sort, order] = (params.get("sort") ?? "date:desc").split(":") as [RecipeFilters["sort"], RecipeFilters["order"]];
  const time = Number(params.get("max_prep_time"));
  return {
    category: params.get("category") || null,
    dietetic: params.get("dietetic") === "true" || undefined,
    max_prep_time: time > 0 ? time : null,
    q: params.get("q") ?? "",
    sort: sort === "calories" ? "calories" : "date",
    order: order === "asc" ? "asc" : "desc",
  };
}

export default function RecipeList() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);
  const [search, setSearch] = useState(filters.q ?? "");
  const debounced = useDebouncedValue(search, 250);
  const [panel, setPanel] = useState(false);
  const categories = useCategories();
  const recipes = useRecipes(filters);
  const sentinel = useRef<HTMLDivElement>(null);

  const update = (changes: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace, preventScrollReset: true });
  };

  // la recherche part 250 ms après la dernière frappe (replace pour ne pas polluer l'historique)
  useEffect(() => {
    if ((filters.q ?? "") !== debounced.trim()) update({ q: debounced.trim() || null }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => {
    // bouton retour du navigateur : on remet le champ à jour
    if ((filters.q ?? "") !== search.trim()) setSearch(filters.q ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending, isError, isPlaceholderData } = recipes;
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && !isFetchingNextPage && void fetchNextPage(),
      { rootMargin: "800px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const category = categories.data?.find((c) => c.slug === filters.category);
  const title = category?.name ?? "Toutes les recettes";
  const sortValue = `${filters.sort}:${filters.order}`;
  const activeFilters = Number(Boolean(filters.category)) + Number(Boolean(filters.dietetic)) + Number(Boolean(filters.max_prep_time));

  useMeta({
    title: [category?.name ?? "Recettes", filters.dietetic ? "diététiques" : null].filter(Boolean).join(" "),
    description: category
      ? `Les recettes ${category.name.toLowerCase()} de Braise${filters.dietetic ? ", version diététique" : ""}.`
      : "Toutes les recettes de Braise : entrées, plats, pâtisserie, pains et apéritif.",
  });

  const reset = () => {
    setSearch("");
    setParams(new URLSearchParams(), { preventScrollReset: true });
  };

  const categoryChips = (
    <>
      <button type="button" className="chip" aria-pressed={!filters.category} onClick={() => update({ category: null })}>
        Toutes
      </button>
      {categories.data?.map((c) => (
        <button
          key={c.id}
          type="button"
          className="chip"
          aria-pressed={filters.category === c.slug}
          onClick={() => update({ category: filters.category === c.slug ? null : c.slug })}
        >
          {c.name}
        </button>
      ))}
    </>
  );
  const dieteticChip = (
    <button type="button" className="chip --diet" aria-pressed={Boolean(filters.dietetic)} onClick={() => update({ dietetic: filters.dietetic ? null : "true" })}>
      Diététique
    </button>
  );
  const sortSelect = (
    <Select label="Trier" value={sortValue} options={SORTS} onChange={(value) => update({ sort: value === "date:desc" ? null : value })} align="right" />
  );
  const timeSelect = (
    <Select
      label="Temps de préparation"
      value={filters.max_prep_time ?? 0}
      options={TIMES}
      onChange={(value) => update({ max_prep_time: value ? String(value) : null })}
    />
  );

  return (
    <>
      <header className="wrap">
        <div className="list-head">
        <div>
          <p className="label" style={{ margin: "0 0 20px", display: "flex", gap: 14 }}>
            Recettes {filters.dietetic && <DietMark />}
          </p>
          <h1 className="serif h1" style={{ margin: 0 }}>
            {title}
          </h1>
        </div>
        <p aria-live="polite">
          {isPending ? " " : total === 0 ? "Aucune recette" : plural(total, "recette")}
          {filters.q ? ` pour « ${filters.q} »` : ""}
          {filters.max_prep_time ? `, ${TIMES.find((t) => t.value === filters.max_prep_time)?.label.toLowerCase() ?? ""}` : ""}.
        </p>
        </div>
      </header>

      <div className="filters">
        <div className="wrap">
          <div className="search">
            <input
              className="input"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Recette, ingrédient…"
              aria-label="Rechercher une recette ou un ingrédient"
              enterKeyHint="search"
            />
            {search ? (
              <button type="button" onClick={() => setSearch("")} aria-label="Effacer la recherche">
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>
            ) : (
              <span aria-hidden="true" style={{ position: "absolute", right: 2, top: "50%", translate: "0 -50%", color: "var(--ink-2)", display: "grid" }}>
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
                  <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.1" />
                </svg>
              </span>
            )}
          </div>
          <div className="chips" role="group" aria-label="Catégories">
            {categoryChips}
          </div>
          <span className="vr" aria-hidden="true" />
          <div className="chips --fixed">{dieteticChip}</div>
          <span className="vr" aria-hidden="true" />
          {timeSelect}
          {sortSelect}
          <Button className="filters-mobile" onClick={() => setPanel(true)} aria-haspopup="dialog">
            Filtres{activeFilters ? ` · ${activeFilters}` : ""}
          </Button>
        </div>
      </div>

      <Drawer
        open={panel}
        onClose={() => setPanel(false)}
        title="Filtres"
        footer={
          <div style={{ display: "flex", gap: 8, padding: 20, borderTop: "1px solid var(--line)" }}>
            <Button onClick={reset}>Tout effacer</Button>
            <Button variant="primary" onClick={() => setPanel(false)} style={{ flex: 1 }}>
              {isPending ? "Voir les recettes" : total ? `Voir ${plural(total, "recette")}` : "Aucune recette"}
            </Button>
          </div>
        }
      >
        <div className="panel-section">
          <p className="label">Catégorie</p>
          <div className="chips">{categoryChips}</div>
        </div>
        <div className="panel-section">
          <p className="label">Option</p>
          <div className="chips">{dieteticChip}</div>
        </div>
        <div className="panel-section">
          <p className="label">Temps</p>
          {timeSelect}
        </div>
        <div className="panel-section">
          <p className="label">Tri</p>
          <Select label="Trier" value={sortValue} options={SORTS} onChange={(value) => update({ sort: value === "date:desc" ? null : value })} />
        </div>
      </Drawer>

      <div className="wrap" style={{ paddingBottom: "clamp(64px, 8vw, 120px)" }}>
        {isError && !data ? (
          <div className="empty">
            <h2 className="serif h2">La liste n'a pas pu être chargée.</h2>
            <p>Vérifiez votre connexion, puis réessayez.</p>
            <Button onClick={() => void recipes.refetch()}>Réessayer</Button>
          </div>
        ) : !isPending && items.length === 0 ? (
          <div className="empty">
            <h2 className="serif h2">Rien ne mijote sous ces critères.</h2>
            <p>
              {filters.q
                ? `Aucune recette ne parle de « ${filters.q} ». Essayez un ingrédient, ou un mot plus court.`
                : "Aucune recette ne réunit ces filtres pour l'instant. Retirez-en un, ou revenez bientôt."}
            </p>
            <Button onClick={reset}>Voir toutes les recettes</Button>
          </div>
        ) : (
          <div className="rhythm" style={{ opacity: isPlaceholderData ? 0.55 : 1, transition: "opacity 300ms var(--ease)" }} aria-busy={isPending || isFetchingNextPage}>
            {isPending
              ? Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)
              : items.map((recipe, index) => (
                  <Card
                    key={recipe.id}
                    recipe={recipe}
                    headingLevel={2}
                    size={index % 6 < 2 ? "medium" : "small"}
                    sizes={index % 6 < 2 ? "(min-width: 1000px) 45vw, (min-width: 720px) 45vw, 100vw" : "(min-width: 1000px) 22vw, (min-width: 720px) 45vw, 100vw"}
                  />
                ))}
            {isFetchingNextPage && Array.from({ length: 6 }, (_, i) => <CardSkeleton key={`next-${i}`} />)}
          </div>
        )}
        <div ref={sentinel} aria-hidden="true" />
        {!hasNextPage && items.length > 6 && <p className="list-end">Vous avez tout vu. De quoi cuisiner un moment.</p>}
      </div>
    </>
  );
}
