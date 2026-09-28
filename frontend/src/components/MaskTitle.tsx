import { Fragment, useLayoutEffect, useRef, useState, type ElementType } from "react";
import { cx } from "@/lib/cx";

interface MaskTitleProps {
  id?: string;
  text: string;
  as?: ElementType;
  className?: string;
  active: boolean;
  delay?: number;
  stagger?: number;
}

/**
 * Titre qui apparaît ligne par ligne, comme dans le prototype.
 * Comme on ne sait pas où le texte va passer à la ligne, chaque mot a son propre masque
 * et on mesure après coup sur quelle ligne il tombe pour lui donner le bon délai.
 */
export function MaskTitle({ id, text, as: Tag = "h1", className, active, delay = 250, stagger = 80 }: MaskTitleProps) {
  const ref = useRef<HTMLElement>(null);
  const [delays, setDelays] = useState<number[]>([]);
  const words = text.trim().split(/\s+/);

  useLayoutEffect(() => {
    const spans = ref.current?.querySelectorAll<HTMLElement>(".mask-w");
    if (!spans) return;
    let line = -1;
    let top = Number.NEGATIVE_INFINITY;
    const next: number[] = [];
    spans.forEach((span) => {
      if (span.offsetTop > top + 4) {
        line += 1;
        top = span.offsetTop;
      }
      next.push(delay + line * stagger);
    });
    setDelays(next);
  }, [text, delay, stagger]);

  return (
    <Tag ref={ref} id={id} className={cx(className, active && delays.length > 0 && "is-in")}>
      {words.map((word, i) => (
        <Fragment key={`${word}-${i}`}>
          <span className="mask-w">
            <span style={{ ["--d" as string]: `${delays[i] ?? delay}ms` }}>{word}</span>
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </Tag>
  );
}
