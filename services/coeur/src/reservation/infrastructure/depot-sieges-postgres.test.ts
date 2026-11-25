import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { demarrerPostgres, dockerDisponible } from "../../test/postgres-de-test.js";
import { DUREE_BLOCAGE_SEC } from "../domaine/blocage.js";
import { DepotSiegesPostgres } from "./depot-sieges-postgres.js";
import { migrerReservation } from "./migrations-reservation.js";
import { billet, outbox, reservation, siege } from "./schema.js";

const ORGANISATION = randomUUID();
const CATEGORIE = randomUUID();

/**
 * Preuve de cohérence à petite échelle (scénario C-1, ADR 003), sur un vrai PostgreSQL :
 * des acheteurs concurrents ne peuvent jamais bloquer deux fois la même place.
 * Le test de charge k6 rejoue la même preuve à 50 000 acheteurs.
 */
describe.skipIf(!(await dockerDisponible()))("DepotSiegesPostgres (PostgreSQL réel)", () => {
  let db: NodePgDatabase;
  let depot: DepotSiegesPostgres;
  let arreter: () => Promise<void>;
  let evenementId: string;

  beforeAll(async () => {
    ({ db, arreter } = await demarrerPostgres());
    await migrerReservation(db);
    depot = new DepotSiegesPostgres(db, randomUUID);
  });

  afterAll(async () => arreter?.());

  beforeEach(() => {
    evenementId = randomUUID();
  });

  async function creerPlaces(nombre: number, numerotees = true): Promise<string[]> {
    const ids = Array.from({ length: nombre }, () => randomUUID());
    await db.insert(siege).values(
      ids.map((id, i) => ({
        id,
        evenementId,
        organisationId: ORGANISATION,
        categorieId: CATEGORIE,
        numero: numerotees ? `A-${i + 1}` : null,
      })),
    );
    return ids;
  }

  const bloquerPar = (acheteurId: string, demande: Parameters<DepotSiegesPostgres["bloquer"]>[0]) =>
    depot.bloquer(demande, { reservationId: randomUUID(), acheteurId }, DUREE_BLOCAGE_SEC);

  it("50 acheteurs visent le même siège en même temps : un seul l'obtient", async () => {
    const [siegeId] = await creerPlaces(1);

    const resultats = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        bloquerPar(`acheteur-${i}`, { type: "siege", evenementId, siegeId: siegeId! }),
      ),
    );

    expect(resultats.filter((r) => r !== null)).toHaveLength(1);
    const [ligne] = await db.select().from(siege).where(eq(siege.id, siegeId!));
    expect(ligne?.statut).toBe("bloque");
  });

  it("placement libre : 100 acheteurs pour 20 places, exactement 20 places distinctes bloquées", async () => {
    await creerPlaces(20, false);

    const resultats = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        bloquerPar(`acheteur-${i}`, {
          type: "placement-libre",
          evenementId,
          categorieId: CATEGORIE,
        }),
      ),
    );

    const gagnants = resultats.filter((r) => r !== null);
    expect(gagnants).toHaveLength(20);
    expect(new Set(gagnants.map((b) => b.siegeId)).size).toBe(20);
  });

  it("écrit un événement PlaceBloquee dans l'Outbox pour chaque blocage, et seulement pour lui", async () => {
    const [siegeId] = await creerPlaces(1);
    const demande = { type: "siege", evenementId, siegeId: siegeId! } as const;

    const blocage = await bloquerPar("acheteur-1", demande);
    await bloquerPar("acheteur-2", demande); // perdu : aucune écriture

    const evenements = await db
      .select()
      .from(outbox)
      .where(sql`${outbox.contenu}->>'evenementId' = ${evenementId}`);
    expect(evenements).toHaveLength(1);
    expect(evenements[0]).toMatchObject({ type: "PlaceBloquee", cle: evenementId });
    expect(evenements[0]?.contenu).toMatchObject({
      organisationId: ORGANISATION,
      donnees: { reservationId: blocage?.reservationId, siegeId },
    });
    expect(
      await db.select().from(reservation).where(eq(reservation.evenementId, evenementId)),
    ).toHaveLength(1);
  });

  it("une place dont le blocage a expiré redevient réservable immédiatement", async () => {
    const [siegeId] = await creerPlaces(1);
    const demande = { type: "siege", evenementId, siegeId: siegeId! } as const;
    await bloquerPar("acheteur-1", demande);
    // On simule les 10 minutes écoulées.
    await db
      .update(siege)
      .set({ bloqueJusqua: sql`now() - interval '1 second'` })
      .where(eq(siege.id, siegeId!));

    expect(await bloquerPar("acheteur-2", demande)).not.toBeNull();
  });

  it("la base refuse un second billet pour la même place, même si le code se trompe", async () => {
    const [siegeId] = await creerPlaces(1);
    const blocage = await bloquerPar("acheteur-1", {
      type: "siege",
      evenementId,
      siegeId: siegeId!,
    });
    const unBillet = () => ({
      id: randomUUID(),
      evenementId,
      siegeId: siegeId!,
      reservationId: blocage!.reservationId,
      acheteurId: "acheteur-1",
      prixCentimes: 6500,
    });

    await db.insert(billet).values(unBillet());
    await expect(db.insert(billet).values(unBillet())).rejects.toMatchObject({
      cause: { code: "23505" }, // violation d'unicité
    });
  });
});
