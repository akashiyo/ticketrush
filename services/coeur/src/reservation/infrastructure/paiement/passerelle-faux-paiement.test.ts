import { afterEach, describe, expect, it, vi } from "vitest";

import { PaiementIndisponible } from "../../domaine/reservation.js";
import { Disjoncteur } from "./disjoncteur.js";
import { PasserelleFauxPaiement } from "./passerelle-faux-paiement.js";

const demande = {
  reference: "res-1",
  montantCentimes: 6500,
  cleIdempotence: "res-1:cle",
  moyenDePaiement: { jeton: "carte-acceptee" },
};

const json = (statut: number, corps: unknown) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { "content-type": "application/json" },
  });

function preparer(reponses: (Response | Error)[]) {
  const fetchSimule = vi.fn(async () => {
    const suivante = reponses.shift() ?? new Error("plus de réponse prévue");
    if (suivante instanceof Error) throw suivante;
    return suivante;
  });
  vi.stubGlobal("fetch", fetchSimule);
  const attentes: number[] = [];
  const passerelle = new PasserelleFauxPaiement({
    url: "http://faux-paiement:3000",
    obtenirJeton: async () => "jeton-service",
    disjoncteur: new Disjoncteur(),
    attendre: async (ms) => void attentes.push(ms),
    aleatoire: () => 0.5,
  });
  return { passerelle, fetchSimule, attentes };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PasserelleFauxPaiement", () => {
  it("traduit un paiement accepté, avec le jeton de service et la clé d'idempotence", async () => {
    const { passerelle, fetchSimule } = preparer([
      json(201, { id: "pai-1", statut: "accepte", motifRefus: null }),
    ]);

    expect(await passerelle.payer(demande)).toEqual({ statut: "accepte", paiementId: "pai-1" });
    const [url, init] = fetchSimule.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://faux-paiement:3000/paiements");
    expect(init.headers).toMatchObject({
      authorization: "Bearer jeton-service",
      "idempotency-key": "res-1:cle",
    });
  });

  it("traduit un refus", async () => {
    const { passerelle } = preparer([
      json(201, { id: "pai-1", statut: "refuse", motifRefus: "Carte refusée" }),
    ]);
    expect(await passerelle.payer(demande)).toEqual({ statut: "refuse", motif: "Carte refusée" });
  });

  it("réessaie après une erreur 5xx ou un délai dépassé, avec un délai croissant (jitter)", async () => {
    const { passerelle, fetchSimule, attentes } = preparer([
      json(503, {}),
      new DOMException("délai dépassé", "TimeoutError"),
      json(201, { id: "pai-1", statut: "accepte", motifRefus: null }),
    ]);

    expect(await passerelle.payer(demande)).toEqual({ statut: "accepte", paiementId: "pai-1" });
    expect(fetchSimule).toHaveBeenCalledTimes(3);
    expect(attentes).toEqual([150, 300]); // 100 puis 200 ms, + 50 % d'aléatoire
  });

  it("abandonne après 3 appels : paiement indisponible", async () => {
    const { passerelle, fetchSimule } = preparer([json(500, {}), json(500, {}), json(500, {})]);

    await expect(passerelle.payer(demande)).rejects.toBeInstanceOf(PaiementIndisponible);
    expect(fetchSimule).toHaveBeenCalledTimes(3);
  });

  it("ne réessaie pas une erreur 4xx (requête fautive)", async () => {
    const { passerelle, fetchSimule } = preparer([json(422, {})]);

    await expect(passerelle.payer(demande)).rejects.toBeInstanceOf(PaiementIndisponible);
    expect(fetchSimule).toHaveBeenCalledTimes(1);
  });

  it("prestataire en panne : le disjoncteur s'ouvre et les paiements suivants échouent sans appel (D-1)", async () => {
    const { passerelle, fetchSimule } = preparer(
      Array.from({ length: 15 }, () => new TypeError("fetch failed")),
    );
    for (let i = 0; i < 5; i++) await passerelle.payer(demande).catch(() => undefined);
    const appelsAvant = fetchSimule.mock.calls.length;

    await expect(passerelle.payer(demande)).rejects.toBeInstanceOf(PaiementIndisponible);
    expect(fetchSimule.mock.calls.length).toBe(appelsAvant);
  });
});
