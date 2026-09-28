import type { Config } from "tailwindcss";

/**
 * On remplace le thème par défaut (theme et pas extend) : seuls les tokens de DESIGN.md existent.
 * Les couleurs pointent vers les variables CSS de tokens.css, donc le mode sombre suit tout seul.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  corePlugins: {
    // on garde le reset du prototype (base.css)
    preflight: false,
  },
  theme: {
    screens: {
      sm: "600px",
      md: "720px",
      lg: "840px",
      xl: "1200px",
      "2xl": "1440px",
    },
    colors: {
      transparent: "transparent",
      current: "currentColor",
      inherit: "inherit",
      bg: "var(--bg)",
      surface: "var(--surface)",
      "surface-2": "var(--surface-2)",
      ink: "var(--ink)",
      "ink-2": "var(--ink-2)",
      "ink-3": "var(--ink-3)",
      accent: "var(--accent)",
      "accent-hover": "var(--accent-hover)",
      "accent-text": "var(--accent-text)",
      ocre: "var(--ocre)",
      olive: "var(--olive)",
      danger: "var(--danger)",
      line: "var(--line)",
      "line-strong": "var(--line-strong)",
      cream: "var(--cream)",
      "photo-a": "var(--photo-a)",
      "photo-b": "var(--photo-b)",
      "photo-c": "var(--photo-c)",
      "photo-d": "var(--photo-d)",
    },
    fontFamily: {
      serif: "var(--serif)",
      sans: "var(--sans)",
    },
    fontSize: {
      label: ["11.5px", { lineHeight: "1", letterSpacing: ".12em" }],
      xs: ["12px", { lineHeight: "1.5" }],
      "admin-meta": ["13px", { lineHeight: "1.5" }],
      sm: ["14px", { lineHeight: "1.55" }],
      base: ["15px", { lineHeight: "1.6" }],
      body: ["17px", { lineHeight: "1.6" }],
      lede: ["21px", { lineHeight: "1.4" }],
      h4: ["21px", { lineHeight: "1.15", letterSpacing: "-.015em" }],
      h3: ["27px", { lineHeight: "1.05", letterSpacing: "-.02em" }],
      h2: ["clamp(34px, 3.6vw, 54px)", { lineHeight: ".95", letterSpacing: "-.03em" }],
      h1: ["clamp(43px, 5vw, 68px)", { lineHeight: ".95", letterSpacing: "-.03em" }],
      kcal: ["54px", { lineHeight: "1", letterSpacing: "-.03em" }],
      display: ["clamp(54px, 8vw, 128px)", { lineHeight: ".95", letterSpacing: "-.03em" }],
    },
    fontWeight: {
      light: "300",
      normal: "400",
      medium: "500",
      semibold: "600",
    },
    borderRadius: {
      none: "0",
      sm: "2px",
      DEFAULT: "4px",
      full: "9999px",
    },
    boxShadow: {
      none: "none",
      DEFAULT: "var(--shadow)",
    },
    transitionTimingFunction: {
      DEFAULT: "var(--ease)",
    },
    transitionDuration: {
      0: "0ms",
      DEFAULT: "300ms",
      1: "300ms",
      2: "500ms",
      3: "700ms",
    },
    extend: {
      maxWidth: {
        wrap: "1440px",
        prose: "640px",
      },
      spacing: {
        gutter: "24px",
        nav: "64px",
      },
    },
  },
  plugins: [],
} satisfies Config;
