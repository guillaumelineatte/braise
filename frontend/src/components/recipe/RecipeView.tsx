import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { ImageOut, RecipeCard, Unit } from "@/api/schemas";
import { Card, CardSkeleton } from "@/components/Card";
import { DietMark } from "@/components/DietMark";
import { MaskTitle } from "@/components/MaskTitle";
import { NutritionBlock } from "@/components/NutritionBlock";
import { Photo, toneFor } from "@/components/Photo";
import { Step } from "@/components/Step";
import { Stepper } from "@/components/Stepper";
import { cx } from "@/lib/cx";
import { formatDuration, formatKcal, formatNumber, scaleQuantity, unitLabel } from "@/lib/format";
import { useSessionState } from "@/lib/hooks";

// ce qu'il faut pour afficher une recette (sert à la page publique et à l'aperçu de l'admin)
export interface RecipeViewData {
  id: number;
  slug: string;
  title: string;
  description: string;
  category: { name: string; slug: string };
  prep_time_minutes: number | null;
  servings: number | null;
  is_dietetic: boolean;
  image: ImageOut | null;
  ingredients: { name: string; quantity: number | null; unit: Unit }[];
  steps: { content: string }[];
  nutrition: { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null };
  related?: RecipeCard[];
}

interface RecipeViewProps {
  recipe: RecipeViewData;
  // aperçu admin : pas de liens, pas de mode cuisine, pas de suggestions
  preview?: boolean;
  // on a la carte mais pas encore les ingrédients / étapes
  bodyPending?: boolean;
  previewImageUrl?: string | null;
}

type WakeState = "idle" | "on" | "unsupported" | "denied";

function useWakeLock(active: boolean): WakeState {
  const [state, setState] = useState<WakeState>("idle");
  useEffect(() => {
    if (!active) {
      setState("idle");
      return;
    }
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      if (!("wakeLock" in navigator)) {
        setState("unsupported");
        return;
      }
      try {
        lock = await navigator.wakeLock.request("screen");
        if (cancelled) void lock.release();
        else setState("on");
      } catch {
        setState("denied");
      }
    };
    void request();
    // le navigateur relâche le verrou quand on change d'onglet, on le redemande au retour
    const onVisible = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
  return state;
}

export function RecipeView({ recipe, preview = false, bodyPending = false, previewImageUrl }: RecipeViewProps) {
  const base = recipe.servings && recipe.servings > 0 ? recipe.servings : 4;
  const [servings, setServings] = useState(base);
  const [rolled, setRolled] = useState(false);
  const [done, setDone] = useSessionState<number[]>(preview ? "braise-preview-steps" : `braise-steps:${recipe.slug}`, []);
  const [cooking, setCooking] = useState(false);
  const [entered, setEntered] = useState(false);
  const wake = useWakeLock(cooking);

  useEffect(() => {
    setServings(base);
    setRolled(false);
  }, [recipe.slug, base]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!cooking) return;
    const root = document.documentElement;
    root.classList.add("cook-mode");
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setCooking(false);
    window.addEventListener("keydown", onKey);
    window.scrollTo({ top: 0 });
    return () => {
      root.classList.remove("cook-mode");
      window.removeEventListener("keydown", onKey);
    };
  }, [cooking]);

  const changeServings = (value: number) => {
    setServings(value);
    setRolled(true);
  };
  const toggleStep = (index: number) =>
    setDone((current) => (current.includes(index) ? current.filter((i) => i !== index) : [...current, index]));

  const categoryLabel = preview ? (
    <p className="label">{recipe.category.name}</p>
  ) : (
    <Link to={`/recettes?category=${recipe.category.slug}`} className="label u">
      {recipe.category.name}
    </Link>
  );

  return (
    <article className={cx("recipe", entered && "is-in")} aria-labelledby={`recipe-title-${recipe.id}`}>
      {cooking && (
        <div className="cook-bar">
          <div className="wrap">
            <span role="status">
              {wake === "on"
                ? "Mode cuisine — l'écran reste allumé."
                : wake === "idle"
                  ? "Mode cuisine."
                  : "Mode cuisine — votre navigateur ne peut pas garder l'écran allumé : désactivez la mise en veille."}
            </span>
            <button type="button" className="btn small" onClick={() => setCooking(false)}>
              Quitter le mode cuisine
            </button>
          </div>
        </div>
      )}

      <div className="recipe-head">
        <Photo
          image={recipe.image}
          previewUrl={previewImageUrl}
          priority={!preview}
          reveal={preview}
          sizes="(min-width: 840px) 58vw, 100vw"
          tone={toneFor(recipe.id)}
          layoutId={preview ? undefined : `recipe-photo-${recipe.id}`}
          alt={recipe.image?.alt ?? ""}
        />
        <div className="text">
          <div className="kicker fade">
            {categoryLabel}
            {recipe.is_dietetic && <DietMark />}
          </div>
          <MaskTitle id={`recipe-title-${recipe.id}`} className="serif h1" text={recipe.title || "Sans titre"} active={entered} delay={80} />
          {recipe.description && <p className="lede fade" style={{ transitionDelay: "250ms" }}>{recipe.description}</p>}
          <div className="metas fade" style={{ transitionDelay: "350ms" }}>
            <div>
              <p className="label">Préparation</p>
              <div className="val">{formatDuration(recipe.prep_time_minutes)}</div>
            </div>
            <div>
              <p className="label">Portions</p>
              <div className="val">{servings}</div>
            </div>
            <div>
              <p className="label">Par portion</p>
              <div className="val">{formatKcal(recipe.nutrition.calories)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="recipe-body">
        <aside className="ingredients" aria-labelledby={`ingredients-${recipe.id}`}>
          <div className="serv">
            <h2 className="h4" id={`ingredients-${recipe.id}`}>
              Ingrédients
            </h2>
            <Stepper value={servings} onChange={changeServings} />
          </div>
          {bodyPending ? (
            <div aria-busy="true" style={{ display: "grid", gap: 18, paddingTop: 18 }}>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="skel-line" style={{ width: `${60 + ((i * 13) % 35)}%` }} />
              ))}
            </div>
          ) : (
            <ul className="ing">
              {recipe.ingredients.map((line, index) => {
                const quantity = scaleQuantity(line.quantity, base, servings);
                const unit = unitLabel(line.unit, quantity);
                return (
                  <li key={`${line.name}-${index}`}>
                    <span className={cx("q", rolled && "roll")}>
                      <span key={servings}>{quantity == null ? "" : formatNumber(quantity)}</span>
                      {unit && quantity != null && <span className="unit">{unit}</span>}
                    </span>
                    <span>{line.name}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {!bodyPending && <NutritionBlock nutrition={recipe.nutrition} />}
          {!preview && !bodyPending && (
            <button type="button" className="cook u" onClick={() => setCooking((value) => !value)} aria-pressed={cooking}>
              {cooking ? "Quitter le mode cuisine" : "Passer en mode cuisine"}
            </button>
          )}
        </aside>

        <section className="steps" aria-label="Étapes">
          {bodyPending ? (
            <div aria-busy="true">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="step">
                  <div className="skel-line" style={{ width: 32, height: 40 }} />
                  <div style={{ display: "grid", gap: 10 }}>
                    <div className="skel-line" />
                    <div className="skel-line" style={{ width: "70%" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {recipe.steps.map((step, index) => (
                <Step key={index} number={index + 1} content={step.content} done={done.includes(index)} onToggle={() => toggleStep(index)} />
              ))}
            </ol>
          )}
        </section>
      </div>

      {!preview && (recipe.related?.length || bodyPending) ? (
        <section className="continue" aria-labelledby={`continue-${recipe.id}`}>
          <div className="continue-head">
            <h2 className="serif h2" id={`continue-${recipe.id}`}>
              À poursuivre
            </h2>
            <Link to={`/recettes?category=${recipe.category.slug}`} className="u small">
              Toute la catégorie {recipe.category.name}
            </Link>
          </div>
          <div className="related">
            {bodyPending
              ? Array.from({ length: 3 }, (_, i) => <CardSkeleton key={i} ratio="4/3" />)
              : recipe.related!.map((card) => <Card key={card.id} recipe={card} sizes="(min-width: 840px) 30vw, 100vw" />)}
          </div>
        </section>
      ) : null}
    </article>
  );
}
