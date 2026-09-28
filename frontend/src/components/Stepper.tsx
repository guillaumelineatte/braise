interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
}

// sélecteur - n + (1 à 24 par défaut)
export function Stepper({ value, onChange, min = 1, max = 24, label = "Nombre de portions" }: StepperProps) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="Moins de portions" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <span className="n" aria-live="polite" aria-atomic="true">
        {value}
      </span>
      <button type="button" aria-label="Plus de portions" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}
