import { forwardRef, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { api } from "@/api/client";
import { cx } from "@/lib/cx";

const cache = new Map<string, Promise<string[]>>();

// GET /ingredients?q=, 10 résultats max, avec un petit cache
export function suggestIngredients(q: string): Promise<string[]> {
  const key = q.trim().toLowerCase();
  if (!key) return Promise.resolve([]);
  if (!cache.has(key)) {
    const request = api<string[]>(`/ingredients?q=${encodeURIComponent(key)}`).catch(() => {
      cache.delete(key);
      return [];
    });
    cache.set(key, request);
  }
  return cache.get(key)!;
}

interface ComboboxProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
  // Entrée sans suggestion sélectionnée (pour passer au champ suivant)
  onEnter?: () => void;
}

export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  { id, value, onChange, onBlur, invalid, describedBy, placeholder, onEnter },
  ref,
) {
  const listId = useId();
  const [options, setOptions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current) return;
    const query = value.trim();
    if (query.length < 1) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const names = await suggestIngredients(query);
      if (cancelled) return;
      const filtered = names.filter((name) => name.toLowerCase() !== query.toLowerCase());
      setOptions(filtered);
      setActive(-1);
      setOpen(filtered.length > 0);
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value]);

  const choose = (name: string) => {
    typed.current = false;
    onChange(name);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && options.length) {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % options.length);
    } else if (event.key === "ArrowUp" && options.length) {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (event.key === "Enter") {
      if (open && active >= 0) {
        event.preventDefault();
        choose(options[active]);
      } else if (onEnter) {
        event.preventDefault();
        setOpen(false);
        onEnter();
      }
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  // surligne ce qui a été tapé
  const highlight = (name: string) => {
    const index = name.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").indexOf(value.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, ""));
    if (index < 0 || !value.trim()) return name;
    const end = index + value.trim().length;
    return (
      <>
        {name.slice(0, index)}
        <mark>{name.slice(index, end)}</mark>
        {name.slice(end)}
      </>
    );
  };

  return (
    <div className="combo">
      <input
        ref={ref}
        id={id}
        className="input"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          typed.current = true;
          onChange(event.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
          onBlur?.();
        }}
      />
      <ul id={listId} role="listbox" className={cx("select-list", open && "is-open")} aria-label="Suggestions d'ingrédients">
        {options.map((name, index) => (
          <li
            key={name}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            className={cx(index === active && "is-active")}
            onMouseDown={(event) => {
              event.preventDefault();
              choose(name);
            }}
            onMouseEnter={() => setActive(index)}
          >
            <span>{highlight(name)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});
