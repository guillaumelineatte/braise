import { describe, expect, it } from "vitest";
import { formatDuration, formatNumber, formatRelative, parseDecimal, scaleQuantity, toInputDecimal, unitLabel } from "./format";
import { splitSteps } from "./steps";

describe("splitSteps", () => {
  it("découpe par numérotation « 1. »", () => {
    expect(splitSteps("1. Rincez les lentilles.\n2. Faites-les cuire\nvingt minutes.\n3. Salez.")).toEqual([
      "Rincez les lentilles.",
      "Faites-les cuire vingt minutes.",
      "Salez.",
    ]);
  });

  it("reconnaît « 1) » et « Étape 1 : », y compris dans le fil du texte", () => {
    expect(splitSteps("1) Préchauffez. 2) Enfournez à 180 °C. 3) Servez.")).toEqual([
      "Préchauffez.",
      "Enfournez à 180 °C.",
      "Servez.",
    ]);
    expect(splitSteps("Étape 1 : Sablez.\nÉtape 2 : Foncez.\n\nEtape 3. Cuisez.")).toEqual(["Sablez.", "Foncez.", "Cuisez."]);
  });

  it("ignore les nombres qui ne suivent pas la séquence", () => {
    expect(splitSteps("1. Cuire 2) minutes à 3. degrés\n2. Égoutter.")).toEqual(["Cuire 2) minutes à 3. degrés", "Égoutter."]);
  });

  it("sans numérotation : paragraphes, sinon lignes, puces retirées", () => {
    expect(splitSteps("Épluchez.\n\nCoupez en dés,\nsans trop serrer.\n\nServez.")).toEqual([
      "Épluchez.",
      "Coupez en dés, sans trop serrer.",
      "Servez.",
    ]);
    expect(splitSteps("- Épluchez.\n- Coupez.\n\n")).toEqual(["Épluchez.", "Coupez."]);
    expect(splitSteps("   ")).toEqual([]);
  });
});

describe("format", () => {
  it("durées", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(90)).toBe("1 h 30");
    expect(formatDuration(65)).toBe("1 h 05");
    expect(formatDuration(1440)).toBe("24 h");
    expect(formatDuration(null)).toBe("—");
  });

  it("quantités et portions", () => {
    expect(formatNumber(1.6)).toBe("1,6");
    expect(formatNumber(2 / 3)).toBe("0,67");
    expect(scaleQuantity(1.6, 4, 6)).toBeCloseTo(2.4);
    expect(scaleQuantity(null, 4, 6)).toBeNull();
    expect(unitLabel("PINCH", 2)).toBe("pincées");
    expect(unitLabel("TBSP", 3)).toBe("c. à s.");
    expect(unitLabel("UNIT", 3)).toBe("");
  });

  it("saisie décimale", () => {
    expect(parseDecimal("1,5")).toBe(1.5);
    expect(parseDecimal(" 1 500 ")).toBe(1500);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNaN();
    expect(parseDecimal("-2")).toBeNaN();
    expect(toInputDecimal(1.25)).toBe("1,25");
  });

  it("temps relatif", () => {
    const now = Date.parse("2026-09-27T12:00:00Z");
    expect(formatRelative("2026-09-27T11:59:48Z", now)).toBe("il y a 12 s");
    expect(formatRelative("2026-09-27T11:57:00Z", now)).toBe("il y a 3 min");
    expect(formatRelative("2026-09-27T11:59:59Z", now)).toBe("à l'instant");
  });
});
