import { useState } from "react";
import { currentTheme, toggleTheme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState(() => currentTheme());
  return (
    <button
      type="button"
      className="theme"
      aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
      onClick={() => setTheme(toggleTheme())}
    />
  );
}
