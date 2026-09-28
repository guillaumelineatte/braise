import { useId } from "react";
import { cx } from "@/lib/cx";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  tone?: "olive" | "accent";
  // juste le bouton, sans libellé visible (dans les tableaux)
  compact?: boolean;
  className?: string;
}
export function Toggle({ checked, onChange, label, description, disabled, tone = "olive", compact, className }: ToggleProps) {
  const id = useId();
  const button = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={compact ? undefined : `${id}-label`}
      aria-label={compact ? label : undefined}
      aria-describedby={description && !compact ? `${id}-desc` : undefined}
      className={cx("toggle", tone === "accent" && "--accent", compact && className)}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
  if (compact) return button;
  return (
    <div className={cx("toggle-row", className)}>
      <div>
        <span className="label" id={`${id}-label`}>
          {label}
        </span>
        {description && (
          <p className="desc" id={`${id}-desc`}>
            {description}
          </p>
        )}
      </div>
      {button}
    </div>
  );
}
