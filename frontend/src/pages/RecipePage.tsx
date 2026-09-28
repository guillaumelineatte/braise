import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useParams } from "react-router";
import { ApiError } from "@/api/client";
import { findCachedCard, useRecipe } from "@/api/public";
import type { RecipeDetail } from "@/api/schemas";
import { RecipeView } from "@/components/recipe/RecipeView";
import { formatNumber, unitLabel } from "@/lib/format";
import { useMeta } from "@/lib/meta";
import NotFound from "./NotFound";

function isoDuration(minutes: number | null): string | undefined {
  if (!minutes) return undefined;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}`;
}

// JSON-LD schema.org/Recipe pour Google
function recipeJsonLd(recipe: RecipeDetail) {
  const n = recipe.nutrition;
  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    description: recipe.description,
    image: recipe.image ? [new URL(recipe.image.variants["1600"], window.location.origin).toString()] : undefined,
    recipeCategory: recipe.category.name,
    recipeYield: recipe.servings ? `${recipe.servings} portions` : undefined,
    totalTime: isoDuration(recipe.prep_time_minutes),
    datePublished: recipe.published_at ?? undefined,
    recipeIngredient: recipe.ingredients.map((line) =>
      [line.quantity == null ? "" : formatNumber(line.quantity), unitLabel(line.unit, line.quantity), line.name].filter(Boolean).join(" "),
    ),
    recipeInstructions: recipe.steps.map((step) => ({ "@type": "HowToStep", text: step.content })),
    nutrition: n.calories
      ? {
          "@type": "NutritionInformation",
          calories: `${Math.round(n.calories)} kcal`,
          proteinContent: n.protein_g != null ? `${n.protein_g} g` : undefined,
          carbohydrateContent: n.carbs_g != null ? `${n.carbs_g} g` : undefined,
          fatContent: n.fat_g != null ? `${n.fat_g} g` : undefined,
        }
      : undefined,
    suitableForDiet: recipe.is_dietetic ? "https://schema.org/LowCalorieDiet" : undefined,
  };
}

export default function RecipePage() {
  const { slug = "" } = useParams();
  const client = useQueryClient();
  const placeholder = useMemo(() => findCachedCard(client, slug), [client, slug]);
  const { data, error, isPending, isPlaceholderData } = useRecipe(slug, placeholder);

  const jsonLd = useMemo(() => (data && !isPlaceholderData ? recipeJsonLd(data) : null), [data, isPlaceholderData]);
  useMeta({
    title: data?.title,
    description: data?.description,
    image: data?.image?.variants["1600"] ?? null,
    type: "article",
    jsonLd,
  });

  if (error instanceof ApiError && error.status === 404) return <NotFound />;
  if (error && !data) {
    return (
      <div className="wrap empty">
        <h1 className="serif h2">Cette recette n'a pas pu être chargée.</h1>
        <p>Vérifiez votre connexion, puis rechargez la page.</p>
      </div>
    );
  }
  if (isPending || !data) return <RecipeSkeleton />;

  return (
    <div className="wrap" style={{ paddingTop: "clamp(40px, 5vw, 72px)", paddingBottom: "clamp(96px, 12vw, 180px)" }}>
      <RecipeView key={data.slug} recipe={data} bodyPending={isPlaceholderData} />
    </div>
  );
}

function RecipeSkeleton() {
  return (
    <div className="wrap" style={{ paddingTop: "clamp(40px, 5vw, 72px)", minHeight: "100svh" }} aria-busy="true" aria-label="Chargement de la recette">
      <div className="recipe">
        <div className="recipe-head">
          <div className="photo skel" style={{ aspectRatio: "5/4" }} />
          <div className="text" style={{ display: "grid", gap: 16 }}>
            <div className="skel-line" style={{ width: 80 }} />
            <div className="skel-line" style={{ height: 48, width: "90%" }} />
            <div className="skel-line" style={{ height: 48, width: "60%" }} />
            <div className="skel-line" style={{ width: "80%", marginTop: 12 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
