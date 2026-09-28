import type { Modifier } from "@dnd-kit/core";

// on ne déplace que de haut en bas dans nos listes
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });
