import type { CSSProperties } from "react";
import { cx } from "@/lib/cx";

export function Skeleton({ className, style, line }: { className?: string; style?: CSSProperties; line?: boolean }) {
  return <div className={cx(line ? "skel-line" : "skel", className)} style={style} aria-hidden="true" />;
}
