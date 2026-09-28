// Formulaire de l'éditeur + conversion vers l'API.
// Les nombres sont tapés en texte (avec virgule possible) et convertis au moment d'envoyer.
import { z } from "zod";
import type { RecipeAdmin, RecipeCreate, RecipeUpdate, Unit } from "@/api/schemas";
import { parseDecimal, toInputDecimal } from "@/lib/format";

export interface IngredientRow {
  key: string;
  name: string;
  quantity: string;
  unit: Unit;
}
export interface StepRow {
  key: string;
  content: string;
}
export interface EditorValues {
  title: string;
  slug: string;
  description: string;
  category_id: number | null;
  prep_time_minutes: string;
  servings: number;
  is_dietetic: boolean;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  ingredients: IngredientRow[];
  steps: StepRow[];
}
export type FieldKey = keyof EditorValues;
export const ALL_FIELDS: FieldKey[] = [
  "title",
  "slug",
  "description",
  "category_id",
  "prep_time_minutes",
  "servings",
  "is_dietetic",
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "ingredients",
  "steps",
];
export const MACROS = ["calories", "protein_g", "carbs_g", "fat_g"] as const;

let counter = 0;
export const newKey = () => `k${Date.now().toString(36)}${(counter++).toString(36)}`;

export const emptyIngredient = (): IngredientRow => ({ key: newKey(), name: "", quantity: "", unit: "UNIT" });
export const emptyStep = (): StepRow => ({ key: newKey(), content: "" });

export function emptyValues(): EditorValues {
  return {
    title: "",
    slug: "",
    description: "",
    category_id: null,
    prep_time_minutes: "",
    servings: 4,
    is_dietetic: false,
    calories: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
    ingredients: [emptyIngredient()],
    steps: [emptyStep()],
  };
}

export function toValues(recipe: RecipeAdmin): EditorValues {
  return {
    title: recipe.title,
    slug: recipe.slug,
    description: recipe.description,
    category_id: recipe.category_id,
    prep_time_minutes: recipe.prep_time_minutes == null ? "" : String(recipe.prep_time_minutes),
    servings: recipe.servings ?? 4,
    is_dietetic: recipe.is_dietetic,
    calories: toInputDecimal(recipe.calories),
    protein_g: toInputDecimal(recipe.protein_g),
    carbs_g: toInputDecimal(recipe.carbs_g),
    fat_g: toInputDecimal(recipe.fat_g),
    ingredients: recipe.ingredients.length
      ? recipe.ingredients.map((line) => ({ key: newKey(), name: line.name, quantity: toInputDecimal(line.quantity), unit: line.unit }))
      : [emptyIngredient()],
    steps: recipe.steps.length ? recipe.steps.map((step) => ({ key: newKey(), content: step.content })) : [emptyStep()],
  };
}

const decimalText = z
  .string()
  .refine((value) => {
    const parsed = parseDecimal(value);
    return parsed === null || (Number.isFinite(parsed) && parsed >= 0 && parsed <= 99999.9);
  }, "Nombre positif attendu (virgule acceptée).");

// mêmes règles que côté Pydantic, pour afficher les erreurs sous les champs
export const EditorSchema = z.object({
  title: z.string().trim().min(1, "Donnez un titre à la recette.").max(160, "160 caractères au maximum."),
  slug: z.string().max(120),
  description: z.string().max(2000, "2 000 caractères au maximum."),
  category_id: z.number().int().nullable(),
  prep_time_minutes: z.string().refine((v) => v.trim() === "" || /^\d{1,5}$/.test(v.trim()), "Nombre entier de minutes."),
  servings: z.number().int().min(1).max(24),
  is_dietetic: z.boolean(),
  calories: decimalText,
  protein_g: decimalText,
  carbs_g: decimalText,
  fat_g: decimalText,
  ingredients: z.array(
    z
      .object({ key: z.string(), name: z.string().max(120, "120 caractères au maximum."), quantity: z.string(), unit: z.string() })
      .superRefine((row, ctx) => {
        if (!row.name.trim() && row.quantity.trim()) ctx.addIssue({ code: "custom", path: ["name"], message: "Nommez l'ingrédient." });
        const quantity = parseDecimal(row.quantity);
        if (quantity !== null && !(Number.isFinite(quantity) && quantity >= 0))
          ctx.addIssue({ code: "custom", path: ["quantity"], message: "Quantité invalide." });
      }),
  ),
  steps: z.array(z.object({ key: z.string(), content: z.string().max(4000, "4 000 caractères au maximum.") })),
});

export interface IndexMap {
  ingredients: number[];
  steps: number[];
}

export interface BuiltPayload<T> {
  body: T;
  // index dans le payload -> index dans le formulaire (les lignes vides ne sont pas envoyées)
  indexMap: IndexMap;
  // champs invalides, pas envoyés : ils restent en attente
  invalid: FieldKey[];
}

function number(value: string): number | null | "invalid" {
  const parsed = parseDecimal(value);
  if (parsed === null) return null;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : "invalid";
}

// PATCH avec seulement les champs modifiés
export function buildPatch(
  values: EditorValues,
  fields: Iterable<FieldKey>,
  slug: { edited: boolean; force: boolean },
): BuiltPayload<RecipeUpdate> {
  const body: RecipeUpdate = {};
  const invalid: FieldKey[] = [];
  const indexMap: IndexMap = { ingredients: [], steps: [] };
  for (const field of new Set(fields)) {
    switch (field) {
      case "title": {
        const title = values.title.trim();
        if (title && title.length <= 160) body.title = title;
        else invalid.push(field);
        break;
      }
      case "slug":
        if (slug.edited && values.slug.trim()) {
          body.slug = values.slug.trim();
          if (slug.force) body.force_slug = true;
        }
        break;
      case "description":
        if (values.description.length <= 2000) body.description = values.description;
        else invalid.push(field);
        break;
      case "category_id":
        if (values.category_id != null) body.category_id = values.category_id;
        break;
      case "prep_time_minutes": {
        const text = values.prep_time_minutes.trim();
        if (text === "") body.prep_time_minutes = null;
        else if (/^\d{1,5}$/.test(text)) body.prep_time_minutes = Number(text);
        else invalid.push(field);
        break;
      }
      case "servings":
        body.servings = values.servings;
        break;
      case "is_dietetic":
        body.is_dietetic = values.is_dietetic;
        break;
      case "calories":
      case "protein_g":
      case "carbs_g":
      case "fat_g": {
        const parsed = number(values[field]);
        if (parsed === "invalid" || (parsed != null && parsed > 99999.9)) invalid.push(field);
        else body[field] = parsed;
        break;
      }
      case "ingredients": {
        const lines: NonNullable<RecipeUpdate["ingredients"]> = [];
        let broken = false;
        values.ingredients.forEach((row, index) => {
          const name = row.name.trim();
          const quantity = number(row.quantity);
          if (!name && quantity === null) return; // ligne vide, on saute
          if (!name || quantity === "invalid") broken = true;
          else {
            lines.push({ name, quantity, unit: row.unit });
            indexMap.ingredients.push(index);
          }
        });
        if (broken) invalid.push(field);
        else body.ingredients = lines;
        break;
      }
      case "steps": {
        const steps: NonNullable<RecipeUpdate["steps"]> = [];
        values.steps.forEach((row, index) => {
          if (!row.content.trim()) return;
          steps.push({ content: row.content.trim() });
          indexMap.steps.push(index);
        });
        body.steps = steps;
        break;
      }
    }
  }
  return { body, indexMap, invalid };
}

// PUT (⌘S) : on renvoie tout
export function buildPut(values: EditorValues, imageId: number | null, slug: { edited: boolean; force: boolean }): BuiltPayload<RecipeCreate> | null {
  const built = buildPatch(values, ALL_FIELDS, slug);
  if (built.invalid.length || !built.body.title) return null;
  const { title, is_published: _p, is_featured: _f, ...rest } = built.body;
  void _p;
  void _f;
  return { ...built, body: { ...rest, title, image_id: imageId } };
}

// écart entre les kcal saisies et 4P + 4G + 9L (même calcul que le back)
export function nutritionCheck(values: Pick<EditorValues, (typeof MACROS)[number]>) {
  const [calories, protein, carbs, fat] = MACROS.map((f) => parseDecimal(values[f]));
  if ([protein, carbs, fat].some((v) => v == null || !Number.isFinite(v))) return null;
  const estimated = Math.round((4 * protein! + 4 * carbs! + 9 * fat!) * 10) / 10;
  if (calories == null || !Number.isFinite(calories) || calories === 0) return { estimated, deviation: null };
  return { estimated, deviation: Math.round(((estimated - calories) / calories) * 1000) / 10 };
}
