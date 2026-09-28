import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";

export interface SelectOption<V extends string | number> {
  value: V;
  label: string;
  hint?: ReactNode;
}

interface SelectProps<V extends string | number> {
  value: V | null;
  options: SelectOption<V>[];
  onChange: (value: V) => void;
  // aria-label, ou labelledBy si le libellé est déjà affiché à côté
  label?: string;
  labelledBy?: string;
  placeholder?: string;
  className?: string;
  bare?: boolean;
  align?: "left" | "right";
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  display?: (option: SelectOption<V> | undefined) => ReactNode;
}

/**
 * Select maison (pattern listbox ARIA) pour coller au design.
 * Clavier : flèches, Début/Fin, Entrée/Espace, Échap, et on peut taper les premières lettres.
 */
export function Select<V extends string | number>({
  value,
  options,
  onChange,
  label,
  labelledBy,
  placeholder = "Choisir…",
  className,
  bare,
  align = "left",
  invalid,
  disabled,
  id,
  display,
}: SelectProps<V>) {
  const autoId = useId();
  const baseId = id ?? `select${autoId.replace(/:/g, "")}`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus({ preventScroll: true });
    listRef.current?.querySelector<HTMLElement>(`#${baseId}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, baseId]);

  const openList = (index = selectedIndex >= 0 ? selectedIndex : 0) => {
    if (disabled) return;
    setActive(index);
    setOpen(true);
  };
  const close = (focusButton = true) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus({ preventScroll: true });
  };
  const choose = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    close();
  };

  const typeahead = (key: string) => {
    const now = Date.now();
    typed.current.text = now - typed.current.at > 600 ? key : typed.current.text + key;
    typed.current.at = now;
    const needle = typed.current.text.toLowerCase();
    const index = options.findIndex((o) => o.label.toLowerCase().startsWith(needle));
    if (index >= 0) setActive(index);
  };

  const onButtonKey = (event: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openList(event.key === "ArrowUp" ? Math.max(0, selectedIndex - 1) : undefined);
    }
  };

  const onListKey = (event: KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) typeahead(event.key);
    }
  };

  return (
    <div ref={rootRef} className={cx("select", bare && "--bare", className)} data-open={open}>
      <button
        ref={buttonRef}
        type="button"
        id={`${baseId}-btn`}
        className="select-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${baseId}-list`}
        aria-labelledby={labelledBy ? `${labelledBy} ${baseId}-btn` : undefined}
        aria-label={labelledBy ? undefined : label ? `${label} : ${selected?.label ?? placeholder}` : undefined}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onButtonKey}
        style={invalid ? { borderColor: "var(--danger)" } : undefined}
      >
        <span>{display ? display(selected) : (selected?.label ?? placeholder)}</span>
      </button>
      <ul
        ref={listRef}
        id={`${baseId}-list`}
        className={cx("select-list", align === "right" && "--right")}
        role="listbox"
        tabIndex={-1}
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        aria-activedescendant={open ? `${baseId}-opt-${active}` : undefined}
        onKeyDown={onListKey}
        onBlur={(event) => {
          if (!rootRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
        }}
      >
        {options.map((option, index) => (
          <li
            key={String(option.value)}
            id={`${baseId}-opt-${index}`}
            role="option"
            aria-selected={option.value === value}
            className={cx(open && index === active && "is-active")}
            onMouseEnter={() => setActive(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(index)}
          >
            <span>{option.label}</span>
            {option.hint && <small>{option.hint}</small>}
          </li>
        ))}
      </ul>
    </div>
  );
}
