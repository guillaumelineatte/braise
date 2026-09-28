/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";

// pages dont index.html précharge le code selon l'URL
const ROUTE_PAGES = ["Home", "RecipeList", "RecipePage"];
// sans preload, les fontes arrivent tard et la page bouge
const PRELOADED_FONTS = /(fraunces-latin-opsz-normal|inter-latin-wght-normal)-.*\.woff2$/;

/**
 * Petit plugin pour index.html :
 * - remplace __API_BASE__ par VITE_API_URL (vide = même domaine) ;
 * - au build, injecte la liste des fichiers JS de chaque page (pour le script de préchargement)
 *   et les preload des fontes.
 */
function braiseHtml(apiBase: string): Plugin {
  return {
    name: "braise-html",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        html = html.replaceAll("__API_BASE__", apiBase.replace(/\/$/, ""));
        if (!ctx.bundle) return html.replace("__ROUTE_CHUNKS__", "{}");
        const bundle = ctx.bundle;
        const routes: Record<string, string[]> = {};
        const fonts: string[] = [];
        // tous les imports statiques d'un chunk, récursivement
        const closure = (file: string, seen = new Set<string>()): Set<string> => {
          const output = bundle[file];
          if (seen.has(file) || !output || output.type !== "chunk") return seen;
          seen.add(file);
          output.imports.forEach((dep) => closure(dep, seen));
          return seen;
        };
        const entry = Object.entries(bundle).find(([, o]) => o.type === "chunk" && o.isEntry)?.[0];
        const inEntry = entry ? closure(entry) : new Set<string>();
        for (const [file, output] of Object.entries(bundle)) {
          if (output.type === "chunk" && output.facadeModuleId) {
            const page = ROUTE_PAGES.find((name) => output.facadeModuleId!.endsWith(`/pages/${name}.tsx`));
            if (page) routes[page] = [...closure(file)].filter((f) => !inEntry.has(f)).map((f) => `/${f}`);
          }
          if (output.type === "asset" && PRELOADED_FONTS.test(file)) fonts.push(`/${file}`);
        }
        // boot.ts charge l'appli en import() : on la précharge quand même pour qu'elle arrive tôt
        const app = new Set<string>();
        if (entry) {
          const output = bundle[entry];
          if (output.type === "chunk") output.dynamicImports.forEach((dep) => closure(dep, app));
        }
        const appFiles = [...app].filter((file) => !inEntry.has(file));
        return {
          html: html.replace("__ROUTE_CHUNKS__", JSON.stringify(routes)),
          tags: [
            ...appFiles.map((file) => ({ tag: "link", attrs: { rel: "modulepreload", crossorigin: "", href: `/${file}` }, injectTo: "head" as const })),
            ...fonts.map((href) => ({
              tag: "link",
              attrs: { rel: "preload", as: "font", type: "font/woff2", href, crossorigin: "" },
              // en fin de head, pour que les appels API partent avant
              injectTo: "head" as const,
            })),
          ],
        };
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.API_PROXY_TARGET || "http://localhost:8000";
  const proxy = {
    "/api": { target, changeOrigin: false },
    "/media": { target, changeOrigin: false },
    "/sitemap.xml": { target, changeOrigin: false },
    "/robots.txt": { target, changeOrigin: false },
  };
  return {
    plugins: [react(), braiseHtml(env.VITE_API_URL ?? "")],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    build: {
      target: "es2022",
      cssCodeSplit: true,
      sourcemap: false,
      rolldownOptions: {
        output: {
          // Tout le commun du site public (React, router, Query, composants...) dans un seul
          // fichier "site" : 2 requêtes au lieu d'une quinzaine au premier chargement.
          // Les pages, l'admin, Lenis et les animations restent chargés à part.
          codeSplitting: {
            groups: [
              // à part, sinon l'entrée dépend de "site" et l'évalue trop tôt
              { name: "preload", test: /preload-helper|modulepreload-polyfill/, priority: 10 },
              { name: "site", test: /\/src\/(api\/(client|public)\.ts|lib\/(?!motion-features)|components\/(?!admin\/))/ },
            ],
          },
        },
      },
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  };
});
