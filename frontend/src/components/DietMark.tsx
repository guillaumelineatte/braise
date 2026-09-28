import { cx } from "@/lib/cx";

export function DietMark({ className }: { className?: string }) {
  return <span className={cx("diet-mark", className)}>Diététique</span>;
}
