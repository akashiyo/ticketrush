import { describe, expect, it, vi } from "vitest";

import type { FicheEvenement } from "../domaine/evenement.js";
import { type Cache, LectureFicheEnCache } from "./lecture-fiche-en-cache.js";

const fiche: FicheEvenement = {
  evenementId: "evt-1",
  titre: "Concert",
  artiste: null,
  genre: null,
  salle: { nom: "Arène", ville: "Lyon" },
  debutLe: "2027-03-12T19:00:00.000Z",
  categories: [],
};

/** Cache en mémoire, avec le même comportement que Redis pour les verrous (SET NX). */
function cacheEnMemoire(): Cache & { valeurs: Map<string, string>; durees: Map<string, number> } {
  const valeurs = new Map<string, string>();
  const durees = new Map<string, number>();
  return {
    valeurs,
    durees,
    lire: async (cle) => valeurs.get(cle) ?? null,
    ecrire: async (cle, valeur, dureeSec) => {
      valeurs.set(cle, valeur);
      durees.set(cle, dureeSec);
    },
    prendreVerrou: async (cle) => {
      if (valeurs.has(cle)) return false;
      valeurs.set(cle, "1");
      return true;
    },
    supprimer: async (cle) => void valeurs.delete(cle),
  };
}

const lenteur = () => new Promise((r) => setTimeout(r, 20));

describe("LectureFicheEnCache", () => {
  it("lit la base une fois, puis sert la fiche depuis le cache", async () => {
    const interne = { lire: vi.fn(async () => fiche) };
    const lecture = new LectureFicheEnCache(interne, cacheEnMemoire(), {
      attendre: async () => {},
    });

    expect(await lecture.lire("evt-1")).toEqual(fiche);
    expect(await lecture.lire("evt-1")).toEqual(fiche);
    expect(interne.lire).toHaveBeenCalledTimes(1);
  });

  it("contre l'avalanche : 200 lectures simultanées d'une fiche absente, une seule en base", async () => {
    const interne = {
      lire: vi.fn(async () => {
        await lenteur();
        return fiche;
      }),
    };
    const lecture = new LectureFicheEnCache(interne, cacheEnMemoire(), {
      attendre: () => new Promise((r) => setTimeout(r, 5)),
    });

    const fiches = await Promise.all(Array.from({ length: 200 }, () => lecture.lire("evt-1")));

    expect(fiches.every((f) => f?.titre === "Concert")).toBe(true);
    expect(interne.lire).toHaveBeenCalledTimes(1);
  });

  it("durée de vie de 10 min ± 10 %", async () => {
    const cache = cacheEnMemoire();
    for (const aleatoire of [0, 1]) {
      const lecture = new LectureFicheEnCache({ lire: async () => fiche }, cache, {
        aleatoire: () => aleatoire,
      });
      await lecture.invalider("evt-1");
      await lecture.lire("evt-1");
      expect(cache.durees.get("catalogue:fiche:evt-1")).toBe(aleatoire === 0 ? 540 : 660);
    }
  });

  it("une fiche inconnue est retenue 30 s seulement", async () => {
    const cache = cacheEnMemoire();
    const interne = { lire: vi.fn(async () => null) };
    const lecture = new LectureFicheEnCache(interne, cache);

    expect(await lecture.lire("inconnu")).toBeNull();
    expect(await lecture.lire("inconnu")).toBeNull();
    expect(interne.lire).toHaveBeenCalledTimes(1);
    expect(cache.durees.get("catalogue:fiche:inconnu")).toBe(30);
  });

  it("l'invalidation force une nouvelle lecture en base", async () => {
    const interne = { lire: vi.fn(async () => fiche) };
    const lecture = new LectureFicheEnCache(interne, cacheEnMemoire());
    await lecture.lire("evt-1");

    await lecture.invalider("evt-1");
    await lecture.lire("evt-1");

    expect(interne.lire).toHaveBeenCalledTimes(2);
  });

  it("Redis en panne : la fiche est lue directement en base, sans erreur", async () => {
    const enPanne: Cache = {
      lire: async () => Promise.reject(new Error("connexion refusée")),
      ecrire: async () => undefined,
      prendreVerrou: async () => false,
      supprimer: async () => undefined,
    };
    const lecture = new LectureFicheEnCache({ lire: async () => fiche }, enPanne);

    expect(await lecture.lire("evt-1")).toEqual(fiche);
  });
});
