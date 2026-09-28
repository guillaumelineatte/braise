/**
 * Copie à la main des schémas Pydantic (backend/app/schemas.py).
 * schemas.test.ts vérifie qu'on n'a oublié aucun champ par rapport à openapi.json.
 * Les décimaux arrivent en nombres, les dates en ISO (UTC).
 */
import { z } from "zod";

export const UNITS = ["UNIT", "G", "KG", "ML", "L", "TBSP", "TSP", "PINCH"] as const;
export const Unit = z.enum(UNITS);
export type Unit = z.infer<typeof Unit>;

const isoDate = z.string();

// ---------------------------------------------------------------- images

export const ImageOut = z.object({
  id: z.number().int(),
  url: z.string(),
  variants: z.record(z.string(), z.string()),
  srcset: z.string(),
  lqip: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  alt: z.string(),
});
export type ImageOut = z.infer<typeof ImageOut>;

export const ImageUpdate = z.object({ alt: z.string().max(300) });

export const Thumbnail = z.object({ url: z.string(), lqip: z.string() });
export type Thumbnail = z.infer<typeof Thumbnail>;

// ---------------------------------------------------------------- catégories

export const CategoryBrief = z.object({ id: z.number().int(), name: z.string(), slug: z.string() });
export type CategoryBrief = z.infer<typeof CategoryBrief>;

export const CategoryOut = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
  position: z.number().int(),
  recipe_count: z.number().int(),
  dietetic_count: z.number().int(),
  cover: ImageOut.nullable().optional(),
});
export type CategoryOut = z.infer<typeof CategoryOut>;

export const CategoryAdmin = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
  position: z.number().int(),
  recipe_count: z.number().int(),
  published_count: z.number().int(),
  dietetic_count: z.number().int(),
  slug_locked: z.boolean(),
});
export type CategoryAdmin = z.infer<typeof CategoryAdmin>;

export const CategoryCreate = z.object({ name: z.string().trim().min(1, "Donnez un nom.").max(80) });
export const CategoryUpdate = z.object({ name: z.string().trim().min(1).max(80).nullable().optional() });
export const CategoryReorder = z.object({ ids: z.array(z.number().int()).min(1) });

// ---------------------------------------------------------------- lignes de recette

export const IngredientLineIn = z.object({
  name: z.string().trim().min(1, "Nommez l'ingrédient.").max(120),
  quantity: z.number().min(0).nullable().optional(),
  unit: Unit.optional(),
});
export type IngredientLineIn = z.infer<typeof IngredientLineIn>;

export const IngredientLineOut = z.object({
  ingredient_id: z.number().int(),
  name: z.string(),
  quantity: z.number().nullable(),
  unit: Unit,
  position: z.number().int(),
});
export type IngredientLineOut = z.infer<typeof IngredientLineOut>;

export const StepIn = z.object({ content: z.string().trim().min(1, "Une étape ne peut pas être vide.").max(4000) });
export type StepIn = z.infer<typeof StepIn>;

export const StepOut = z.object({ id: z.number().int(), position: z.number().int(), content: z.string() });
export type StepOut = z.infer<typeof StepOut>;

export const Nutrition = z.object({
  calories: z.number().nullable(),
  protein_g: z.number().nullable(),
  carbs_g: z.number().nullable(),
  fat_g: z.number().nullable(),
  estimated_calories: z.number().nullable(),
  deviation_pct: z.number().nullable(),
});
export type Nutrition = z.infer<typeof Nutrition>;

export const NutritionWarning = z.object({ estimated: z.number(), deviation_pct: z.number() });
export type NutritionWarning = z.infer<typeof NutritionWarning>;

// ---------------------------------------------------------------- recettes publiques

export const RecipeCard = z.object({
  id: z.number().int(),
  title: z.string(),
  slug: z.string(),
  description: z.string(),
  category: CategoryBrief,
  prep_time_minutes: z.number().int().nullable(),
  servings: z.number().int().nullable(),
  calories: z.number().nullable(),
  is_dietetic: z.boolean(),
  is_featured: z.boolean(),
  published_at: isoDate.nullable(),
  image: ImageOut.nullable(),
});
export type RecipeCard = z.infer<typeof RecipeCard>;

export const RecipeDetail = RecipeCard.extend({
  updated_at: isoDate,
  ingredients: z.array(IngredientLineOut),
  steps: z.array(StepOut),
  nutrition: Nutrition,
  related: z.array(RecipeCard),
});
export type RecipeDetail = z.infer<typeof RecipeDetail>;

// ---------------------------------------------------------------- administration

export const RecipeAdmin = z.object({
  id: z.number().int(),
  title: z.string(),
  slug: z.string(),
  slug_locked: z.boolean(),
  description: z.string(),
  category_id: z.number().int(),
  category: CategoryBrief,
  prep_time_minutes: z.number().int().nullable(),
  servings: z.number().int().nullable(),
  image_id: z.number().int().nullable(),
  image: ImageOut.nullable(),
  calories: z.number().nullable(),
  protein_g: z.number().nullable(),
  carbs_g: z.number().nullable(),
  fat_g: z.number().nullable(),
  is_dietetic: z.boolean(),
  is_published: z.boolean(),
  is_featured: z.boolean(),
  published_at: isoDate.nullable(),
  created_at: isoDate,
  updated_at: isoDate,
  ingredients: z.array(IngredientLineOut),
  steps: z.array(StepOut),
  nutrition: Nutrition,
  nutrition_warning: NutritionWarning.nullable(),
  missing: z.array(z.string()),
});
export type RecipeAdmin = z.infer<typeof RecipeAdmin>;

export const RecipeAdminRow = z.object({
  id: z.number().int(),
  title: z.string(),
  slug: z.string(),
  category: CategoryBrief,
  is_published: z.boolean(),
  is_featured: z.boolean(),
  is_dietetic: z.boolean(),
  calories: z.number().nullable(),
  updated_at: isoDate,
  published_at: isoDate.nullable(),
  thumbnail: Thumbnail.nullable(),
});
export type RecipeAdminRow = z.infer<typeof RecipeAdminRow>;

const recipeFields = {
  description: z.string().max(2000).nullable().optional(),
  category_id: z.number().int().nullable().optional(),
  prep_time_minutes: z.number().int().min(0).max(100_000).nullable().optional(),
  servings: z.number().int().min(1).max(24).nullable().optional(),
  image_id: z.number().int().nullable().optional(),
  calories: z.number().min(0).max(99999.9).nullable().optional(),
  protein_g: z.number().min(0).max(99999.9).nullable().optional(),
  carbs_g: z.number().min(0).max(99999.9).nullable().optional(),
  fat_g: z.number().min(0).max(99999.9).nullable().optional(),
  is_dietetic: z.boolean().nullable().optional(),
  ingredients: z.array(IngredientLineIn).max(100).nullable().optional(),
  steps: z.array(StepIn).max(60).nullable().optional(),
  slug: z.string().max(120).nullable().optional(),
  force_slug: z.boolean().optional(),
};

export const RecipeCreate = z.object({ ...recipeFields, title: z.string().trim().min(1).max(160) });
export type RecipeCreate = z.infer<typeof RecipeCreate>;

export const RecipeUpdate = z.object({
  ...recipeFields,
  title: z.string().trim().min(1).max(160).optional(),
  is_published: z.boolean().optional(),
  is_featured: z.boolean().optional(),
});
export type RecipeUpdate = z.infer<typeof RecipeUpdate>;

export const Page = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int(),
    page: z.number().int(),
    page_size: z.number().int(),
    pages: z.number().int(),
  });
export type Page<T> = { items: T[]; total: number; page: number; page_size: number; pages: number };

export const PageRecipeCard = Page(RecipeCard);
export const PageRecipeAdminRow = Page(RecipeAdminRow);

export const Dashboard = z.object({
  published_count: z.number().int(),
  draft_count: z.number().int(),
  category_count: z.number().int(),
  recent: z.array(RecipeAdminRow),
  drafts: z.array(RecipeAdminRow),
});
export type Dashboard = z.infer<typeof Dashboard>;

// ---------------------------------------------------------------- authentification, erreurs

export const LoginIn = z.object({
  email: z.string().trim().min(3, "Saisissez votre adresse.").regex(/^[^@\s]+@[^@\s]+$/, "Adresse e-mail invalide."),
  password: z.string().min(1, "Saisissez votre mot de passe."),
});
export type LoginIn = z.infer<typeof LoginIn>;

export const Token = z.object({
  access_token: z.string(),
  token_type: z.literal("bearer").optional(),
  expires_at: isoDate,
});
export type Token = z.infer<typeof Token>;

export const AdminMe = z.object({ id: z.number().int(), email: z.string(), created_at: isoDate });
export type AdminMe = z.infer<typeof AdminMe>;

export const FieldError = z.object({ field: z.string(), message: z.string() });
export type FieldError = z.infer<typeof FieldError>;

export const ErrorOut = z.object({
  detail: z.string(),
  errors: z.array(FieldError).nullable().optional(),
  missing: z.array(z.string()).nullable().optional(),
});
export type ErrorOut = z.infer<typeof ErrorOut>;

// nom dans openapi.json -> schéma Zod (pour schemas.test.ts)
export const schemaRegistry = {
  AdminMe,
  CategoryAdmin,
  CategoryBrief,
  CategoryCreate,
  CategoryOut,
  CategoryReorder,
  CategoryUpdate,
  Dashboard,
  ErrorOut,
  FieldError,
  ImageOut,
  ImageUpdate,
  IngredientLineIn,
  IngredientLineOut,
  LoginIn,
  Nutrition,
  NutritionWarning,
  Page_RecipeAdminRow_: PageRecipeAdminRow,
  Page_RecipeCard_: PageRecipeCard,
  RecipeAdmin,
  RecipeAdminRow,
  RecipeCard,
  RecipeCreate,
  RecipeDetail,
  RecipeUpdate,
  StepIn,
  StepOut,
  Thumbnail,
  Token,
} as const;
