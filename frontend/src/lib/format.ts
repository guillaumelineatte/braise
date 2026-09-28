import type { Unit } from "@/api/schemas";

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

// 1.6 -> "1,6", 2 décimales max
export function formatNumber(value: number): string {
  return number.format(Math.round(value * 100) / 100);
}

export function formatInteger(value: number): string {
  return integer.format(Math.round(value));
}

// 45 -> "45 min", 90 -> "1 h 30", 1440 -> "24 h"
export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

export function formatKcal(value: number | null | undefined): string {
  return value == null ? "—" : `${formatInteger(value)} kcal`;
}

export function formatServings(value: number | null | undefined): string {
  if (!value) return "—";
  return `${value} portion${value > 1 ? "s" : ""}`;
}

export const UNIT_OPTIONS: { value: Unit; label: string; hint?: string }[] = [
  { value: "UNIT", label: "unité(s)" },
  { value: "G", label: "g", hint: "gramme" },
  { value: "KG", label: "kg", hint: "kilogramme" },
  { value: "ML", label: "ml", hint: "millilitre" },
  { value: "L", label: "L", hint: "litre" },
  { value: "TBSP", label: "cuillère à soupe" },
  { value: "TSP", label: "cuillère à café" },
  { value: "PINCH", label: "pincée" },
];

const SHORT_UNITS: Record<Unit, string> = {
  UNIT: "",
  G: "g",
  KG: "kg",
  ML: "ml",
  L: "L",
  TBSP: "c. à s.",
  TSP: "c. à c.",
  PINCH: "pincée",
};

// unité affichée après la quantité (et "pincées" au pluriel)
export function unitLabel(unit: Unit, quantity: number | null | undefined): string {
  if (unit === "PINCH" && quantity != null && quantity > 1) return "pincées";
  return SHORT_UNITS[unit];
}

// recalcule une quantité pour un autre nombre de portions
export function scaleQuantity(quantity: number | null, from: number | null, to: number): number | null {
  if (quantity == null) return null;
  if (!from || from === to) return quantity;
  return (quantity * to) / from;
}

// "1,5", "1.5" ou "1 500" -> nombre. Vide -> null, n'importe quoi d'autre -> NaN.
export function parseDecimal(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === "number") return input;
  const cleaned = input.replace(/[\s  ]/g, "").replace(",", ".");
  if (cleaned === "") return null;
  if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

// pour pré-remplir un input : virgule, pas d'espace entre les milliers
export function toInputDecimal(value: number | null | undefined): string {
  if (value == null) return "";
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

// "à l'instant", "il y a 12 s", "il y a 3 min"... puis la date au-delà de 24 h
export function formatRelative(iso: string | Date, now: number = Date.now()): string {
  const time = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 3) return "à l'instant";
  if (seconds < 60) return `il y a ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return formatDate(new Date(time));
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

export function formatDate(value: string | Date): string {
  return dateFormat.format(typeof value === "string" ? new Date(value) : value);
}

export function formatShortDate(value: string | Date): string {
  return shortDate.format(typeof value === "string" ? new Date(value) : value);
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatInteger(count)} ${count > 1 ? pluralForm : singular}`;
}
