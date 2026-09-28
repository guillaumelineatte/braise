export type Theme = "light" | "dark";
const KEY = "braise-theme";

export function currentTheme(): Theme {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "dark" || explicit === "light") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// tant que l'utilisateur n'a pas cliqué, on suit le réglage du système
export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // pas de localStorage : le choix ne sera pas retenu, pas grave
  }
  return next;
}
