import { useEffect } from "react";

const SITE = "Braise";
const DEFAULT_DESCRIPTION =
  "Braise rassemble des recettes que l'on prend le temps de faire. Des gestes justes, expliqués une fois pour toutes.";

interface Meta {
  title?: string;
  description?: string;
  image?: string | null;
  type?: "website" | "article";
  noindex?: boolean;
  jsonLd?: object | null;
}

function setMeta(attr: "name" | "property", key: string, content: string | null) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (content == null) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attr, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function absolute(url: string): string {
  return new URL(url, window.location.origin).toString();
}

// titre de l'onglet, description, balises Open Graph et canonical
export function useMeta({ title, description, image, type = "website", noindex = false, jsonLd = null }: Meta) {
  useEffect(() => {
    const fullTitle = title ? `${title} — ${SITE}` : `${SITE} — recettes que l'on prend le temps de faire`;
    const desc = description || DEFAULT_DESCRIPTION;
    const url = window.location.origin + window.location.pathname + window.location.search;
    document.title = fullTitle;
    setMeta("name", "description", desc);
    setMeta("property", "og:title", title ?? SITE);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:type", type);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", image ? absolute(image) : null);
    setMeta("name", "twitter:card", image ? "summary_large_image" : "summary");
    setMeta("name", "robots", noindex ? "noindex" : null);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;

    let script = document.getElementById("ld-json") as HTMLScriptElement | null;
    if (jsonLd) {
      if (!script) {
        script = document.createElement("script");
        script.type = "application/ld+json";
        script.id = "ld-json";
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(jsonLd);
    } else {
      script?.remove();
    }
  }, [title, description, image, type, noindex, jsonLd]);
}
