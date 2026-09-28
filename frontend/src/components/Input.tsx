import { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cx } from "@/lib/cx";

interface FieldProps {
  label: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
  className?: string;
  labelAction?: ReactNode;
}

// label + champ + erreur ou aide ; les id sont passés au champ pour le aria-describedby
export function Field({ label, error, hint, children, className, labelAction }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cx("field", className)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <label className="label" htmlFor={id}>
          {label}
        </label>
        {labelAction}
      </div>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cx("input", className)} {...props} />;
});

// textarea qui s'agrandit toute seule (recalculée à chaque rendu et à chaque frappe)
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, onInput, ...props },
  forwarded,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const resize = useCallback(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useLayoutEffect(resize);
  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);
  return (
    <textarea
      ref={(node) => {
        inner.current = node;
        if (typeof forwarded === "function") forwarded(node);
        else if (forwarded) forwarded.current = node;
        resize();
      }}
      rows={1}
      className={cx("input", className)}
      onInput={(event) => {
        resize();
        onInput?.(event);
      }}
      {...props}
    />
  );
});
