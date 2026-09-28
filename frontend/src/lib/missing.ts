// Pour afficher ce qui manque quand l'API refuse une publication (422 "incomplete").
export type SectionId = "general" | "image" | "ingredients" | "nutrition" | "steps";

export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "general", label: "Général" },
  { id: "image", label: "Image" },
  { id: "ingredients", label: "Ingrédients" },
  { id: "nutrition", label: "Nutrition" },
  { id: "steps", label: "Étapes" },
];

const FIELDS: Record<string, { label: string; section: SectionId }> = {
  title: { label: "le titre", section: "general" },
  description: { label: "la description", section: "general" },
  category_id: { label: "la catégorie", section: "general" },
  prep_time_minutes: { label: "le temps de préparation", section: "general" },
  servings: { label: "les portions", section: "general" },
  image_id: { label: "l'image", section: "image" },
  ingredients: { label: "les ingrédients", section: "ingredients" },
  calories: { label: "les calories", section: "nutrition" },
  protein_g: { label: "les protéines", section: "nutrition" },
  carbs_g: { label: "les glucides", section: "nutrition" },
  fat_g: { label: "les lipides", section: "nutrition" },
  nutrition_coherence: { label: "des macros cohérentes", section: "nutrition" },
  steps: { label: "les étapes", section: "steps" },
};

export function sectionOf(field: string): SectionId | undefined {
  return FIELDS[field.split(".")[0]]?.section;
}

export function missingSentence(missing: string[]): string {
  const labels = [...new Set(missing.map((f) => FIELDS[f]?.label ?? f))];
  if (labels.length === 0) return "";
  const text = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
  return `il manque ${text}`;
}
