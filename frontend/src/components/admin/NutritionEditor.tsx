import { useId } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { formatInteger } from "@/lib/format";
import { nutritionCheck, type EditorValues } from "./editorForm";

const FIELDS = [
  { name: "calories", label: "Calories (kcal)" },
  { name: "protein_g", label: "Protéines (g)" },
  { name: "carbs_g", label: "Glucides (g)" },
  { name: "fat_g", label: "Lipides (g)" },
] as const;

// avertissement à partir de 15 % d'écart, blocage au-dessus de 40 %
export function NutritionEditor({ form }: { form: UseFormReturn<EditorValues> }) {
  const uid = useId();
  const [calories, protein_g, carbs_g, fat_g] = useWatch({ control: form.control, name: ["calories", "protein_g", "carbs_g", "fat_g"] });
  const check = nutritionCheck({ calories, protein_g, carbs_g, fat_g });
  const deviation = check?.deviation ?? null;
  const errors = form.formState.errors;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="nut-grid">
        {FIELDS.map((field) => {
          const error = errors[field.name]?.message;
          return (
            <div className="field" key={field.name}>
              <label className="label" htmlFor={`${uid}-${field.name}`}>
                {field.label}
              </label>
              <input
                id={`${uid}-${field.name}`}
                className="input tnum"
                inputMode="decimal"
                autoComplete="off"
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? `${uid}-${field.name}-error` : undefined}
                {...form.register(field.name)}
              />
              {error && (
                <p className="field-error" id={`${uid}-${field.name}-error`}>
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {check && deviation != null && Math.abs(deviation) > 15 && (
        <div className={Math.abs(deviation) > 40 ? "warn --error" : "warn"} role="status">
          <span>
            Les macros donnent {formatInteger(check.estimated)} kcal, soit {formatInteger(Math.abs(deviation))} % de {deviation < 0 ? "moins" : "plus"} que
            la valeur saisie.
            {Math.abs(deviation) > 40 && " Au-delà de 40 %, la publication est bloquée."}
          </span>
          <button
            type="button"
            onClick={() => form.setValue("calories", String(Math.round(check.estimated)), { shouldDirty: true, shouldValidate: true })}
          >
            Corriger à {formatInteger(check.estimated)}
          </button>
        </div>
      )}
      <p className="field-hint">Valeurs par portion. Estimation : 4 × protéines + 4 × glucides + 9 × lipides.</p>
    </div>
  );
}
