import { describe, expect, it, vi } from "vitest";

import {
  type Admission,
  AdmissionRefusee,
  type Blocage,
  DUREE_BLOCAGE_SEC,
  PlaceIndisponible,
} from "../domaine/blocage.js";
import type { DepotSieges, VerificateurAdmission } from "../domaine/ports.js";
import { BloquerPlace } from "./bloquer-place.js";

const admission: Admission = {
  acheteurId: "acheteur-1",
  evenementId: "evt-1",
  jti: "jti-1",
  expireLe: new Date("2026-12-01T10:10:00Z"),
};

const blocage: Blocage = {
  reservationId: "res-1",
  evenementId: "evt-1",
  organisationId: "org-1",
  siegeId: "siege-1",
  categorieId: "cat-1",
  bloqueJusqua: new Date("2026-12-01T10:15:00Z"),
};

function preparer(options: { blocage?: Blocage | null; admission?: Admission } = {}) {
  const verificateur: VerificateurAdmission = {
    verifier: vi.fn(async () => options.admission ?? admission),
  };
  const depot: DepotSieges = {
    bloquer: vi.fn(async () => (options.blocage === undefined ? blocage : options.blocage)),
  };
  return { depot, cas: new BloquerPlace(verificateur, depot, () => "res-1") };
}

const demande = { type: "siege", evenementId: "evt-1", siegeId: "siege-1" } as const;

describe("BloquerPlace", () => {
  it("bloque la place pour 10 minutes quand le jeton est valide", async () => {
    const { cas, depot } = preparer();

    const resultat = await cas.executer({ acheteurId: "acheteur-1", jetonAcces: "jeton", demande });

    expect(resultat).toEqual(blocage);
    expect(depot.bloquer).toHaveBeenCalledWith(
      demande,
      { reservationId: "res-1", acheteurId: "acheteur-1" },
      DUREE_BLOCAGE_SEC,
    );
  });

  it("refuse un jeton émis pour un autre acheteur, sans toucher au stock (S-2)", async () => {
    const { cas, depot } = preparer();

    await expect(
      cas.executer({ acheteurId: "acheteur-2", jetonAcces: "jeton", demande }),
    ).rejects.toBeInstanceOf(AdmissionRefusee);
    expect(depot.bloquer).not.toHaveBeenCalled();
  });

  it("refuse un jeton émis pour une autre vente (S-2)", async () => {
    const { cas, depot } = preparer({ admission: { ...admission, evenementId: "evt-2" } });

    await expect(
      cas.executer({ acheteurId: "acheteur-1", jetonAcces: "jeton", demande }),
    ).rejects.toBeInstanceOf(AdmissionRefusee);
    expect(depot.bloquer).not.toHaveBeenCalled();
  });

  it("répond « place déjà prise » quand le dépôt ne bloque rien (C-1)", async () => {
    const { cas } = preparer({ blocage: null });

    await expect(
      cas.executer({ acheteurId: "acheteur-1", jetonAcces: "jeton", demande }),
    ).rejects.toBeInstanceOf(PlaceIndisponible);
  });
});
