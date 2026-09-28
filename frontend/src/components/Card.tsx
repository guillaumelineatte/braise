import { useQueryClient } from "@tanstack/react-query";
import type { ElementType } from "react";
import { Link } from "react-router";
import { fetchRecipe, keys } from "@/api/public";
import type { RecipeCard } from "@/api/schemas";
import { cx } from "@/lib/cx";
import { formatDuration, formatServings } from "@/lib/format";
import { DietMark } from "./DietMark";
import { Photo, toneFor } from "./Photo";

type Size = "big" | "medium" | "small";

const TITLE_CLASS: Record<Size, string> = { big: "h1", medium: "h3", small: "h4" };

export function loadRecipePage() {
  return import("@/pages/RecipePage");
}

// au survol d'une carte on charge déjà la page et la recette, le clic est instantané
export function usePrefetchRecipe() {
  const client = useQueryClient();
  return (slug: string) => {
    void loadRecipePage();
    void client.prefetchQuery({
      queryKey: keys.detail(slug),
      queryFn: () => fetchRecipe(slug),
      staleTime: 60_000,
    });
  };
}

interface CardProps {
  recipe: RecipeCard;
  size?: Size;
  sizes?: string;
  headingLevel?: 2 | 3 | 4;
  className?: string;
  showCategory?: boolean;
  // sinon c'est la grille parente qui fixe le ratio en CSS
  ratio?: string;
}

export function Card({
  recipe,
  size = "medium",
  sizes = "(min-width: 840px) 40vw, 100vw",
  headingLevel = 3,
  className,
  showCategory = true,
  ratio,
}: CardProps) {
  const prefetch = usePrefetchRecipe();
  const Heading = `h${headingLevel}` as ElementType;
  return (
    <Link
      to={`/recettes/${recipe.slug}`}
      className={cx("card", size === "big" && "big", className)}
      onMouseEnter={() => prefetch(recipe.slug)}
      onFocus={() => prefetch(recipe.slug)}
    >
      <Photo
        image={recipe.image}
        sizes={sizes}
        tone={toneFor(recipe.id)}
        layoutId={`recipe-photo-${recipe.id}`}
        style={ratio ? { aspectRatio: ratio } : undefined}
        alt=""
      />
      {showCategory && <p className="label">{recipe.category.name}</p>}
      <Heading className={cx("serif", TITLE_CLASS[size])}>
        <span className="title-link">{recipe.title}</span>
      </Heading>
      <span className="meta">
        {formatDuration(recipe.prep_time_minutes)} — {formatServings(recipe.servings)}
        {recipe.is_dietetic && (
          <>
            {" — "}
            <DietMark />
          </>
        )}
      </span>
    </Link>
  );
}

export function CardSkeleton({ ratio = "4/5" }: { ratio?: string }) {
  return (
    <div className="card" aria-hidden="true">
      <div className="skel" style={{ aspectRatio: ratio }} />
      <div className="skel-line" style={{ width: 72, margin: "20px 0 14px" }} />
      <div className="skel-line" style={{ width: "80%", height: 22, marginBottom: 10 }} />
      <div className="skel-line" style={{ width: "40%" }} />
    </div>
  );
}
