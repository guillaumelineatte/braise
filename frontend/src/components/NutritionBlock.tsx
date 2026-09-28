import { formatInteger, formatNumber } from "@/lib/format";

interface NutritionValues {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

const MACROS = [
  { key: "protein_g", label: "Protéines", color: "var(--accent)", factor: 4 },
  { key: "carbs_g", label: "Glucides", color: "var(--ocre)", factor: 4 },
  { key: "fat_g", label: "Lipides", color: "var(--olive)", factor: 9 },
] as const;

// la barre montre la part de chaque macro dans les calories, pas en grammes
export function NutritionBlock({ nutrition }: { nutrition: NutritionValues }) {
  const energy = MACROS.map((macro) => (nutrition[macro.key] ?? 0) * macro.factor);
  const total = energy.reduce((sum, value) => sum + value, 0);
  return (
    <div className="nutri" role="group" aria-label="Valeurs nutritionnelles par portion">
      <div className="kcal">
        {nutrition.calories == null ? "—" : formatInteger(nutrition.calories)}
        <small>kcal par portion</small>
      </div>
      <div className="row">
        {MACROS.map((macro) => (
          <div key={macro.key}>
            <p className="label">
              <span className="dot" style={{ background: macro.color }} />
              {macro.label}
            </p>
            <div className="val">{nutrition[macro.key] == null ? "—" : `${formatNumber(nutrition[macro.key]!)} g`}</div>
          </div>
        ))}
      </div>
      {total > 0 && (
        <div className="bar" aria-hidden="true">
          {MACROS.map((macro, i) => (
            <span key={macro.key} style={{ width: `${((energy[i] / total) * 100).toFixed(1)}%`, background: macro.color }} />
          ))}
        </div>
      )}
    </div>
  );
}
