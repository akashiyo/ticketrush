import { describe, expect, it, vi } from "vitest";

import type { DepotReservations, PasserelleDePaiement } from "../domaine/ports.js";
import {
  type Billet,
  DelaiDePaiementDepasse,
  PaiementIndisponible,
  PaiementRefuse,
  PlacePerdueApresPaiement,
  type Reservation,
  ReservationIntrouvable,
  type ResultatPaiement,
} from "../domaine/reservation.js";
import { PayerReservation } from "./payer-reservation.js";

const MAINTENANT = new Date("2026-12-01T10:00:00Z");
const dans = (sec: number) => new Date(MAINTENANT.getTime() + sec * 1000);

const billet: Billet = {
  billetId: "billet-1",
  reservationId: "res-1",
  evenementId: "evt-1",
  siegeId: "siege-1",
  acheteurId: "acheteur-1",
  prixCentimes: 6500,
  emisLe: MAINTENANT,
};

const reservation = (modif: Partial<Reservation> = {}): Reservation => ({
  id: "res-1",
  evenementId: "evt-1",
  acheteurId: "acheteur-1",
  siegeId: "siege-1",
  prixCentimes: 6500,
  bloqueJusqua: dans(300),
  statut: "en_attente_paiement",
  billet: null,
  ...modif,
});

function preparer(options: {
  reservations?: (Reservation | null)[];
  resultat?: ResultatPaiement | Error;
  billetEmis?: Billet | null;
}) {
  const lectures = [...(options.reservations ?? [reservation()])];
  const depot: DepotReservations = {
    trouver: vi.fn(async () => (lectures.length > 1 ? lectures.shift()! : lectures[0]!)),
    emettreBillet: vi.fn(async () =>
      options.billetEmis === undefined ? billet : options.billetEmis,
    ),
    marquerARembourser: vi.fn(async () => undefined),
  };
  const passerelle: PasserelleDePaiement = {
    payer: vi.fn(async () => {
      const r = options.resultat ?? { statut: "accepte", paiementId: "pai-1" };
      if (r instanceof Error) throw r;
      return r;
    }),
  };
  return { depot, passerelle, cas: new PayerReservation(depot, passerelle, () => MAINTENANT) };
}

const commande = {
  acheteurId: "acheteur-1",
  reservationId: "res-1",
  cleIdempotence: "cle-navigateur",
  moyenDePaiement: { jeton: "carte-acceptee" },
};

describe("PayerReservation", () => {
  it("paie le prix figé au blocage, avec une clé d'idempotence dérivée, puis émet le billet", async () => {
    const { cas, passerelle, depot } = preparer({});

    expect(await cas.executer(commande)).toEqual(billet);
    expect(passerelle.payer).toHaveBeenCalledWith({
      reference: "res-1",
      montantCentimes: 6500,
      cleIdempotence: "res-1:cle-navigateur",
      moyenDePaiement: { jeton: "carte-acceptee" },
    });
    expect(depot.emettreBillet).toHaveBeenCalledWith("res-1", "pai-1");
  });

  it("une réservation déjà payée renvoie son billet sans payer à nouveau (idempotence)", async () => {
    const { cas, passerelle } = preparer({
      reservations: [reservation({ statut: "payee", billet })],
    });

    expect(await cas.executer(commande)).toEqual(billet);
    expect(passerelle.payer).not.toHaveBeenCalled();
  });

  it("refuse la réservation d'un autre acheteur, comme une réservation inconnue", async () => {
    const { cas, passerelle } = preparer({});

    await expect(cas.executer({ ...commande, acheteurId: "acheteur-2" })).rejects.toBeInstanceOf(
      ReservationIntrouvable,
    );
    expect(passerelle.payer).not.toHaveBeenCalled();
  });

  it("refuse de payer quand le blocage expire dans moins de 15 s", async () => {
    const { cas, passerelle } = preparer({
      reservations: [reservation({ bloqueJusqua: dans(10) })],
    });

    await expect(cas.executer(commande)).rejects.toBeInstanceOf(DelaiDePaiementDepasse);
    expect(passerelle.payer).not.toHaveBeenCalled();
  });

  it("un paiement refusé n'émet pas de billet ; la place reste bloquée", async () => {
    const { cas, depot } = preparer({ resultat: { statut: "refuse", motif: "carte refusée" } });

    await expect(cas.executer(commande)).rejects.toBeInstanceOf(PaiementRefuse);
    expect(depot.emettreBillet).not.toHaveBeenCalled();
  });

  it("prestataire indisponible : l'erreur remonte, aucun billet (D-1)", async () => {
    const { cas, depot } = preparer({ resultat: new PaiementIndisponible() });

    await expect(cas.executer(commande)).rejects.toBeInstanceOf(PaiementIndisponible);
    expect(depot.emettreBillet).not.toHaveBeenCalled();
  });

  it("double clic : si l'autre requête a déjà émis le billet, on le renvoie", async () => {
    const { cas, depot } = preparer({
      reservations: [reservation(), reservation({ statut: "payee", billet })],
      billetEmis: null,
    });

    expect(await cas.executer(commande)).toEqual(billet);
    expect(depot.marquerARembourser).not.toHaveBeenCalled();
  });

  it("place perdue après un paiement accepté : réservation à rembourser, aucun billet", async () => {
    const { cas, depot } = preparer({
      reservations: [reservation(), reservation({ statut: "expiree" })],
      billetEmis: null,
    });

    await expect(cas.executer(commande)).rejects.toBeInstanceOf(PlacePerdueApresPaiement);
    expect(depot.marquerARembourser).toHaveBeenCalledWith("res-1", "pai-1");
  });
});
