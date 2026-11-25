import { describe, expect, it } from "vitest";

import { Disjoncteur, DisjoncteurOuvert } from "./disjoncteur.js";

const reussir = () => Promise.resolve("ok");
const echouer = () => Promise.reject(new Error("panne"));

function preparer() {
  let maintenant = 0;
  const disjoncteur = new Disjoncteur({ horloge: () => maintenant });
  return { disjoncteur, avancer: (ms: number) => (maintenant += ms) };
}

async function echouerFois(disjoncteur: Disjoncteur, fois: number) {
  for (let i = 0; i < fois; i++) await disjoncteur.executer(echouer).catch(() => undefined);
}

describe("Disjoncteur", () => {
  it("reste fermé tant qu'il n'a pas observé assez d'appels", async () => {
    const { disjoncteur } = preparer();
    await echouerFois(disjoncteur, 4);
    expect(disjoncteur.etat).toBe("ferme");
  });

  it("s'ouvre au-delà de 50 % d'échecs, puis refuse sans appeler le service", async () => {
    const { disjoncteur } = preparer();
    await echouerFois(disjoncteur, 5);
    expect(disjoncteur.etat).toBe("ouvert");

    let appele = false;
    await expect(
      disjoncteur.executer(async () => {
        appele = true;
      }),
    ).rejects.toBeInstanceOf(DisjoncteurOuvert);
    expect(appele).toBe(false);
  });

  it("ne s'ouvre pas avec 50 % d'échecs tout juste", async () => {
    const { disjoncteur } = preparer();
    for (let i = 0; i < 5; i++) {
      await disjoncteur.executer(reussir);
      await disjoncteur.executer(echouer).catch(() => undefined);
    }
    expect(disjoncteur.etat).toBe("ferme");
  });

  it("après 30 s, laisse passer un appel d'essai ; réussi, il se referme", async () => {
    const { disjoncteur, avancer } = preparer();
    await echouerFois(disjoncteur, 5);
    avancer(30_000);

    expect(await disjoncteur.executer(reussir)).toBe("ok");
    expect(disjoncteur.etat).toBe("ferme");
  });

  it("si l'appel d'essai échoue, il se rouvre pour 30 s", async () => {
    const { disjoncteur, avancer } = preparer();
    await echouerFois(disjoncteur, 5);
    avancer(30_000);
    await echouerFois(disjoncteur, 1);

    expect(disjoncteur.etat).toBe("ouvert");
    await expect(disjoncteur.executer(reussir)).rejects.toBeInstanceOf(DisjoncteurOuvert);
  });

  it("en semi-ouvert, un seul appel d'essai à la fois", async () => {
    const { disjoncteur, avancer } = preparer();
    await echouerFois(disjoncteur, 5);
    avancer(30_000);

    let liberer: () => void = () => undefined;
    const essai = disjoncteur.executer(() => new Promise<void>((r) => (liberer = r)));
    await expect(disjoncteur.executer(reussir)).rejects.toBeInstanceOf(DisjoncteurOuvert);
    liberer();
    await essai;
    expect(disjoncteur.etat).toBe("ferme");
  });
});
