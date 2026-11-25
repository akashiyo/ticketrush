import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { demarrerPostgres, dockerDisponible } from "../../test/postgres-de-test.js";
import { creerVenteDeTest } from "../../test/vente-de-test.js";
import { DUREE_BLOCAGE_SEC } from "../domaine/blocage.js";
import { DepotReservationsPostgres } from "./depot-reservations-postgres.js";
import { DepotSiegesPostgres } from "./depot-sieges-postgres.js";
import { migrerReservation } from "./migrations-reservation.js";
import { billet, outbox, siege } from "./schema.js";

/** Émission du billet (ADR 003, 007) sur un vrai PostgreSQL. */
describe.skipIf(!(await dockerDisponible()))("DepotReservationsPostgres (PostgreSQL réel)", () => {
  let db: NodePgDatabase;
  let sieges: DepotSiegesPostgres;
  let reservations: DepotReservationsPostgres;
  let arreter: () => Promise<void>;

  beforeAll(async () => {
    ({ db, arreter } = await demarrerPostgres());
    await migrerReservation(db);
    sieges = new DepotSiegesPostgres(db, randomUUID);
    reservations = new DepotReservationsPostgres(db, randomUUID);
  });

  afterAll(async () => arreter?.());

  async function bloquerUnePlace() {
    const vente = await creerVenteDeTest(db, { places: 1 });
    const blocage = await sieges.bloquer(
      { type: "siege", evenementId: vente.evenementId, siegeId: vente.sieges[0]! },
      { reservationId: randomUUID(), acheteurId: "acheteur-1" },
      DUREE_BLOCAGE_SEC,
    );
    return { ...vente, reservationId: blocage!.reservationId };
  }

  it("émet le billet : place vendue, réservation payée, BilletEmis dans l'Outbox", async () => {
    const { evenementId, sieges: places, reservationId } = await bloquerUnePlace();

    const emis = await reservations.emettreBillet(reservationId, "pai-1");

    expect(emis).toMatchObject({ reservationId, siegeId: places[0], prixCentimes: 6500 });
    const [place] = await db.select().from(siege).where(eq(siege.id, places[0]!));
    expect(place?.statut).toBe("vendu");
    expect(await reservations.trouver(reservationId)).toMatchObject({
      statut: "payee",
      billet: { billetId: emis?.billetId },
    });
    const evenements = await db.select().from(outbox).where(eq(outbox.cle, evenementId));
    expect(evenements.map((e) => e.type)).toEqual(["PlaceBloquee", "BilletEmis"]);
  });

  it("une seconde émission pour la même réservation ne crée pas de second billet", async () => {
    const { evenementId, reservationId } = await bloquerUnePlace();
    await reservations.emettreBillet(reservationId, "pai-1");

    expect(await reservations.emettreBillet(reservationId, "pai-1")).toBeNull();
    expect(await db.select().from(billet).where(eq(billet.evenementId, evenementId))).toHaveLength(
      1,
    );
  });

  it("aucun billet si la place a été reprise par un autre acheteur après expiration", async () => {
    const { evenementId, sieges: places, reservationId } = await bloquerUnePlace();
    await db
      .update(siege)
      .set({ bloqueJusqua: sql`now() - interval '1 second'` })
      .where(eq(siege.id, places[0]!));
    await sieges.bloquer(
      { type: "siege", evenementId, siegeId: places[0]! },
      { reservationId: randomUUID(), acheteurId: "acheteur-2" },
      DUREE_BLOCAGE_SEC,
    );

    expect(await reservations.emettreBillet(reservationId, "pai-1")).toBeNull();
    await reservations.marquerARembourser(reservationId, "pai-1");
    expect((await reservations.trouver(reservationId))?.statut).toBe("a_rembourser");
  });
});
