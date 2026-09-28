import type { ElementType, ReactNode } from "react";
import { cx } from "@/lib/cx";

export function Label({ as: Tag = "p", className, children, id }: { as?: ElementType; className?: string; children: ReactNode; id?: string }) {
  return (
    <Tag className={cx("label", className)} id={id}>
      {children}
    </Tag>
  );
}
