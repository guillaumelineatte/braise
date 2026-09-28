/**
 * Découpage du bouton "Coller un texte" de l'éditeur.
 *
 * On cherche une numérotation (1. / 1) / 1 - / Étape 1) en suivant 1, 2, 3... pour ne pas couper
 * sur "cuire 2 minutes". S'il n'y en a pas : un paragraphe par étape, ou à défaut une ligne.
 */

const MARKER = /(?:^|(?<=\s))(?:(?:[ÉéEe]tape|Step)\s*(\d+)\s*[.):–—-]?|(\d+)\s*[.)]|(\d+)\s+[–—-])(?=\s)/gu;
const BULLET = /^\s*(?:[-–—•*·]\s+)/;

function clean(step: string): string {
  return step
    .split("\n")
    .map((line) => line.replace(BULLET, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function findMarkers(text: string, lineStartOnly: boolean): { start: number; end: number }[] {
  const markers: { start: number; end: number }[] = [];
  let expected = 1;
  for (const match of text.matchAll(MARKER)) {
    if (lineStartOnly && match.index > 0 && !/\n[ \t]*$/.test(text.slice(0, match.index))) continue;
    const value = Number(match[1] ?? match[2] ?? match[3]);
    if (value === expected) {
      markers.push({ start: match.index, end: match.index + match[0].length });
      expected += 1;
    }
  }
  return markers;
}

export function splitSteps(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  // on préfère les numéros en début de ligne, sinon on prend ceux au milieu du texte
  const atLineStart = findMarkers(normalized, true);
  const markers = atLineStart.length >= 2 ? atLineStart : findMarkers(normalized, false);

  if (markers.length >= 2 || (markers.length === 1 && markers[0].start === 0)) {
    const steps: string[] = [];
    const preamble = clean(normalized.slice(0, markers[0].start));
    if (preamble) steps.push(preamble);
    markers.forEach((marker, i) => {
      const next = markers[i + 1]?.start ?? normalized.length;
      const step = clean(normalized.slice(marker.end, next));
      if (step) steps.push(step);
    });
    return steps;
  }

  const blocks = /\n\s*\n/.test(normalized) ? normalized.split(/\n\s*\n/) : normalized.split("\n");
  return blocks.map(clean).filter(Boolean);
}
