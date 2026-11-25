import { describe, expect, it } from "vitest";

import { estimerAttenteSec, prochainAppelDansSec, scoreEntree, type Vente } from "./file.js";

const vente: Vente = {
  evenementId: "concert-1",
  ouvertureLe: new Date("2026-12-01T10:00:00Z"),
  debitParSeconde: 100,
};

describe("scoreEntree", () => {
  it("tire au sort le score avant l'ouverture (salle d'attente)", () => {
    expect(scoreEntree(new Date("2026-12-01T08:00:00Z"), vente, () => 0.42)).toBe(0.42);
  });

  it("utilise l'heure d'arrivée après l'ouverture", () => {
    const arrivee = new Date("2026-12-01T10:00:05Z");
    expect(scoreEntree(arrivee, vente, () => 0.42)).toBe(arrivee.getTime());
  });

  it("fait passer tous les arrivés d'avant l'ouverture avant ceux d'après", () => {
    const avant = scoreEntree(new Date("2026-12-01T09:59:59Z"), vente, () => 0.999999);
    const apres = scoreEntree(vente.ouvertureLe, vente, () => 0);
    expect(avant).toBeLessThan(apres);
  });
});

describe("estimerAttenteSec", () => {
  it("divise la position par le débit d'admission, arrondi au-dessus", () => {
    expect(estimerAttenteSec(1, 100)).toBe(1);
    expect(estimerAttenteSec(250, 100)).toBe(3);
    expect(estimerAttenteSec(18_342, 200)).toBe(92);
  });
});

describe("prochainAppelDansSec", () => {
  it("interroge souvent près de l'admission et rarement loin dans la file", () => {
    expect(prochainAppelDansSec(100, 100)).toBe(2);
    expect(prochainAppelDansSec(3_000, 100)).toBe(5);
    expect(prochainAppelDansSec(20_000, 100)).toBe(15);
    expect(prochainAppelDansSec(200_000, 100)).toBe(30);
  });
});
