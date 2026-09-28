import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useCategories, useFeatured, useLatest } from "@/api/public";
import type { RecipeCard } from "@/api/schemas";
import { Card, CardSkeleton, usePrefetchRecipe } from "@/components/Card";
import { CategoryRow, CategoryRowSkeleton } from "@/components/CategoryRow";
import { MaskTitle } from "@/components/MaskTitle";
import { Photo } from "@/components/Photo";
import { cx } from "@/lib/cx";
import { formatDuration, formatKcal, formatServings } from "@/lib/format";
import { useMediaQuery } from "@/lib/hooks";
import { useMeta } from "@/lib/meta";

function Hero({ recipe, pending }: { recipe: RecipeCard | undefined; pending: boolean }) {
  const [entered, setEntered] = useState(false);
  const prefetch = usePrefetchRecipe();
  useEffect(() => {
    if (!recipe) return;
    // double rAF, sinon la transition ne se joue pas (l'état caché n'a jamais été peint)
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [recipe]);

  if (!recipe) {
    return (
      <section className="hero is-in" aria-label="Braise">
        <Photo priority reveal={false} tone="a" />
        <div className="hero-scrim" aria-hidden="true" />
        <div className="wrap">
          <div className="hero-inner">
            <div>{!pending && <h1 className="serif display">Les premières recettes mijotent.</h1>}</div>
          </div>
        </div>
      </section>
    );
  }

  const url = `/recettes/${recipe.slug}`;
  return (
    <section className={cx("hero", entered && "is-in")} aria-labelledby="hero-title">
      <Photo image={recipe.image} priority reveal={false} sizes="100vw" alt="" layoutId={`recipe-photo-${recipe.id}`} />
      <div className="hero-scrim" aria-hidden="true" />
      <div className="wrap">
        <div className="hero-inner">
          <div>
            <p className="label mask">
              <span style={{ transitionDelay: "150ms" }}>{recipe.is_featured ? "Recette de la semaine" : "Dernière recette"}</span>
            </p>
            <MaskTitle id="hero-title" className="serif display" text={recipe.title} active={entered} delay={250} />
            <p className="meta fade" style={{ transitionDelay: "600ms" }}>
              <span>{recipe.category.name}</span>
              <span>{formatDuration(recipe.prep_time_minutes)}</span>
              <span>{formatServings(recipe.servings)}</span>
              <span>{formatKcal(recipe.calories)}</span>
              {recipe.is_dietetic && <span className="diet-mark">Diététique</span>}
            </p>
          </div>
          <Link
            to={url}
            className="hero-cta fade"
            style={{ transitionDelay: "700ms" }}
            onMouseEnter={() => prefetch(recipe.slug)}
            onFocus={() => prefetch(recipe.slug)}
          >
            Voir la recette
          </Link>
        </div>
      </div>
    </section>
  );
}

function Selection({ recipes, pending }: { recipes: RecipeCard[]; pending: boolean }) {
  if (!pending && recipes.length === 0) return null;
  const [big, ...side] = recipes;
  return (
    <section className="section" aria-labelledby="selection-title">
      <div className="wrap">
        <div className="sel-head">
          <h2 className="serif h2" id="selection-title">
            Ce que nous cuisinons en ce moment
          </h2>
          <p>Une sélection courte, renouvelée chaque mois. Des recettes que l'on refait, pas que l'on essaie.</p>
        </div>
        <div className="sel">
          {pending || !big ? (
            <>
              <div className="big">
                <CardSkeleton ratio="4/5" />
              </div>
              <div className="side">
                <CardSkeleton ratio="4/3" />
                <CardSkeleton ratio="4/3" />
              </div>
            </>
          ) : (
            <>
              <Card recipe={big} size="big" sizes="(min-width: 840px) 55vw, 100vw" />
              <div className="side">
                {side.map((recipe) => (
                  <Card key={recipe.id} recipe={recipe} sizes="(min-width: 840px) 38vw, 100vw" />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

const RATIOS = ["4/5", "1/1", "5/4", "3/4", "4/3", "4/5"];

function Latest({ recipes }: { recipes: RecipeCard[] }) {
  const three = useMediaQuery("(min-width: 840px)");
  const two = useMediaQuery("(min-width: 600px)");
  const count = three ? 3 : two ? 2 : 1;
  // répartition à la main en colonnes (façon masonry) en gardant l'ordre de lecture
  const columns = useMemo(() => {
    const cols: { recipe: RecipeCard; ratio: string }[][] = Array.from({ length: count }, () => []);
    recipes.forEach((recipe, i) => cols[i % count].push({ recipe, ratio: RATIOS[i % RATIOS.length] }));
    return cols;
  }, [recipes, count]);
  if (recipes.length === 0) return null;
  return (
    <section className="section" aria-labelledby="latest-title">
      <div className="wrap">
        <div className="latest-head">
          <h2 className="serif h2" id="latest-title">
            Dernières recettes
          </h2>
          <Link to="/recettes" className="u small">
            Toutes les recettes
          </Link>
        </div>
        <div className="masonry" style={{ ["--cols" as string]: count }}>
          {columns.map((column, i) => (
            <div className="masonry-col" key={i}>
              {column.map(({ recipe, ratio }) => (
                <Card key={recipe.id} recipe={recipe} ratio={ratio} sizes={`(min-width: 840px) 30vw, (min-width: 600px) 45vw, 100vw`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const featured = useFeatured();
  const latest = useLatest();
  const categories = useCategories();
  const hero = featured.data;

  useMeta({ image: hero?.image?.variants["1600"] ?? null });

  const rest = useMemo(() => (latest.data?.items ?? []).filter((recipe) => recipe.id !== hero?.id), [latest.data, hero?.id]);
  const selection = rest.slice(0, 3);
  const more = rest.slice(3, 9);

  return (
    <>
      <Hero recipe={hero} pending={featured.isPending} />
      <Selection recipes={selection} pending={latest.isPending} />
      <section className="section cats" id="categories" aria-labelledby="categories-title">
        <div className="wrap">
          <h2 className="sr-only" id="categories-title">
            Catégories
          </h2>
          {categories.isPending
            ? Array.from({ length: 5 }, (_, i) => <CategoryRowSkeleton key={i} />)
            : categories.data?.map((category) => <CategoryRow key={category.id} category={category} />)}
        </div>
      </section>
      <Latest recipes={more} />
    </>
  );
}
