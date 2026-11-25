import { describe, expect, it, vi } from "vitest";

import { ActionInterdite, type Organisateur, RegleNonRespectee } from "../domaine/evenement.js";
import type { DepotEvenements, LectureVentes } from "../domaine/ports.js";
import { GestionEvenements } from "./gestion-evenements.js";

const gestionnaire: Organisateur = {
  organisationId: "org-a",
  utilisateurId: "u",
  roles: ["organisateur-gestionnaire"],
};
const lecteur: Organisateur = { ...gestionnaire, roles: ["organisateur-lecteur"] };

function preparer() {
  const depot: DepotEvenements = {
    salles: vi.fn(async () => []),
    salle: vi.fn(async (id) => (id === "salle" ? { id, nom: "Arène", ville: "Lyon" } : null)),
    lister: vi.fn(async () => []),
    trouver: vi.fn(async () => null),
    creer: vi.fn(async () => undefined),
    appliquer: vi.fn(),
    journal: vi.fn(async () => []),
  };
  const ventes: LectureVentes = { parEvenement: vi.fn(async () => new Map()) };
  let n = 0;
  const cas = new GestionEvenements(
    depot,
    ventes,
    () => `id-${++n}`,
    () => new Date("2026-12-01"),
  );
  return { depot, ventes, cas };
}

const demande = {
  titre: "Concert",
  artiste: null,
  genre: null,
  salleId: "salle",
  debutLe: new Date("2027-01-01"),
  tarifs: [{ libelle: "Fosse", placement: "libre" as const, capacite: 100, prixCentimes: 4500 }],
};

describe("GestionEvenements", () => {
  it("crée un brouillon dans l'organisation du jeton", async () => {
    const { cas, depot } = preparer();

    const evenement = await cas.creer(gestionnaire, demande);

    expect(evenement).toMatchObject({ organisationId: "org-a", statut: "brouillon" });
    expect(depot.creer).toHaveBeenCalledWith(gestionnaire, evenement);
  });

  it("un lecteur ne peut ni créer, ni modifier, ni publier", async () => {
    const { cas, depot } = preparer();

    await expect(cas.creer(lecteur, demande)).rejects.toBeInstanceOf(ActionInterdite);
    await expect(cas.publier(lecteur, "evt")).rejects.toBeInstanceOf(ActionInterdite);
    await expect(cas.changerPrix(lecteur, "evt", "t", 1)).rejects.toBeInstanceOf(ActionInterdite);
    await expect(cas.modifier(lecteur, "evt", { titre: "x" })).rejects.toBeInstanceOf(
      ActionInterdite,
    );
    expect(depot.creer).not.toHaveBeenCalled();
    expect(depot.appliquer).not.toHaveBeenCalled();
  });

  it("refuse une salle inconnue", async () => {
    const { cas } = preparer();
    await expect(cas.creer(gestionnaire, { ...demande, salleId: "autre" })).rejects.toBeInstanceOf(
      RegleNonRespectee,
    );
  });

  it("ne demande les ventes que des événements de son organisation", async () => {
    const { cas, depot, ventes } = preparer();
    vi.mocked(depot.lister).mockResolvedValue([{ id: "evt-a" } as never]);

    const liste = await cas.lister(lecteur);

    expect(ventes.parEvenement).toHaveBeenCalledWith(["evt-a"]);
    expect(liste[0]?.ventes).toEqual({ places: 0, vendues: 0, bloquees: 0, recetteCentimes: 0 });
  });
});
