import { m } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ImageOut } from "@/api/schemas";
import { cx } from "@/lib/cx";
import { useReveal } from "@/lib/hooks";

export type Tone = "a" | "b" | "c" | "d";

interface PhotoProps {
  image?: Pick<ImageOut, "url" | "srcset" | "lqip" | "width" | "height" | "alt"> | null;
  sizes?: string;
  // image du haut de page : chargée en priorité, sans animation d'apparition
  priority?: boolean;
  reveal?: boolean;
  // couleur du dégradé quand il n'y a pas encore de photo
  tone?: Tone;
  // pour l'animation carte -> page recette
  layoutId?: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  // blob local pendant l'upload
  previewUrl?: string | null;
}

export function toneFor(id: number): Tone {
  return (["a", "b", "c", "d"] as const)[id % 4];
}

export function Photo({
  image,
  sizes = "100vw",
  priority = false,
  reveal = true,
  tone = "a",
  layoutId,
  alt,
  className,
  style,
  previewUrl,
}: PhotoProps) {
  const [revealRef, inView] = useReveal<HTMLDivElement>();
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(priority);
  const src = previewUrl ?? image?.url;

  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth) setLoaded(true);
  }, [src]);

  const classes = cx(
    "photo",
    tone !== "a" && `--${tone}`,
    image && "has-img",
    reveal && !priority && "reveal-img",
    reveal && !priority && inView && "is-in",
    className,
  );
  const cssVars = { ...(image ? { "--lqip": `url("${image.lqip}")` } : {}), ...style } as CSSProperties;
  const content = src ? (
    <img
      ref={imgRef}
      src={src}
      srcSet={previewUrl ? undefined : image?.srcset}
      sizes={previewUrl ? undefined : sizes}
      width={image?.width}
      height={image?.height}
      alt={alt ?? image?.alt ?? ""}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      {...(priority ? { fetchpriority: "high" } : {})}
      onLoad={() => setLoaded(true)}
      className={loaded ? "is-loaded" : undefined}
      draggable={false}
    />
  ) : null;

  if (layoutId) {
    return (
      <m.div
        ref={revealRef}
        layoutId={layoutId}
        className={classes}
        style={cssVars}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        {content}
      </m.div>
    );
  }
  return (
    <div ref={revealRef} className={classes} style={cssVars} aria-hidden={!src || undefined}>
      {content}
    </div>
  );
}
