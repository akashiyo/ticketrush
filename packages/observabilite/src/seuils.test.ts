import { describe, expect, it } from "vitest";

import { BORNES_DUREE_HTTP_SECONDES, SEUILS_SLO_SECONDES } from "./seuils.js";

describe("bornes de l'histogramme HTTP", () => {
  it("contiennent exactement chaque seuil de SLO (ADR 018)", () => {
    for (const seuil of Object.values(SEUILS_SLO_SECONDES)) {
      expect(BORNES_DUREE_HTTP_SECONDES).toContain(seuil);
    }
  });

  it("sont strictement croissantes", () => {
    const bornes = [...BORNES_DUREE_HTTP_SECONDES];
    expect(bornes).toEqual([...bornes].sort((a, b) => a - b));
    expect(new Set(bornes).size).toBe(bornes.length);
  });
});
