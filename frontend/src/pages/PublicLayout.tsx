import { useEffect, useLayoutEffect } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router";
import { Cursor } from "@/components/Cursor";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { useReducedMotion } from "@/lib/hooks";

// scroll doux (Lenis), pas dans l'admin ni si l'utilisateur a demandé moins d'animations
function useLenis(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let lenis: { destroy: () => void } | null = null;
    let cancelled = false;
    // pas besoin de Lenis pour le premier affichage, on le charge après le load
    const start = () =>
      import("lenis").then(({ default: Lenis }) => {
        if (!cancelled) lenis = new Lenis({ autoRaf: true, duration: 1.1, anchors: { offset: -80 } });
      });
    if (document.readyState === "complete") void start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", start);
      lenis?.destroy();
    };
  }, [enabled]);
}

// pour /#categories : la section n'existe qu'une fois les données chargées, donc on attend un peu
function useHashScroll() {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (!hash) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target || ++tries > 40) {
        window.clearInterval(timer);
        target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [hash, pathname]);
}

export default function PublicLayout() {
  // on enlève le haut de page statique d'index.html avant que React ne s'affiche
  useLayoutEffect(() => document.getElementById("shell")?.remove(), []);
  const reduced = useReducedMotion();
  useLenis(!reduced);
  useHashScroll();
  return (
    <>
      <a href="#main" className="skip-link">
        Aller au contenu
      </a>
      <Nav />
      <main id="main" tabIndex={-1} style={{ outline: "none" }}>
        <Outlet />
      </main>
      <Footer />
      <Cursor />
      <ScrollRestoration getKey={(location) => (location.hash ? location.key : location.pathname + location.search)} />
    </>
  );
}
