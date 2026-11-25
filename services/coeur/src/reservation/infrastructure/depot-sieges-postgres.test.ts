import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { demarrerPostgres, dockerDisponible } from "../../test/postgres-de-test.js";
import { creerVenteDeTest, ORGANISATION_TEST } from "../../test/vente-de-test.js";
import { type DemandeBlocage, DUREE_BLOCAGE_SEC } from "../domaine/blocage.js";
import { DepotSiegesPostgres } from "./depot-sieges-postgres.js";
import { migrerReservation } from "./migrations-reservation.js";
import { billet, outbox, reservation, siege } from "./schema.js";

/**
 * Preuve de cohérence à petite échelle (scénario C-1, ADR 003), sur un vrai PostgreSQL :
 * des acheteurs concurrents ne peuvent jamais bloquer deux fois la même place.
 * Le test de charge k6 rejoue la même preuve à 50 000 acheteurs.
 */
describe.skipIf(!(await dockerDisponible()))("DepotSiegesPostgres (PostgreSQL réel)", () => {
  let db: NodePgDatabase;
  let depot: DepotSiegesPostgres;
  let arreter: () => Promise<void>;

  beforeAll(async () => {
    ({ db, arreter } = await demarrerPostgres());
    await migrerReservation(db);
    depot = new DepotSiegesPostgres(db, randomUUID);
  });

  afterAll(async () => arreter?.());

  const bloquerPar = (acheteurId: string, demande: DemandeBlocage) =>
    depot.bloquer(demande, { reservationId: randomUUID(), acheteurId }, DUREE_BLOCAGE_SEC);

  const evenementsDe = (evenementId: string) =>
    db.select().from(outbox).where(eq(outbox.cle, evenementId)).orderBy(outbox.ordre);

  const expirerMaintenant = (siegeId: string) =>
    db
      .update(siege)
      .set({ bloqueJusqua: sql`now() - interval '1 second'` })
      .where(eq(siege.id, siegeId));

  it("50 acheteurs visent le même siège en même temps : un seul l'obtient", async () => {
    const { evenementId, sieges } = await creerVenteDeTest(db, { places: 1 });

    const resultats = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        bloquerPar(`acheteur-${i}`, { type: "siege", evenementId, siegeId: sieges[0]! }),
      ),
    );

    expect(resultats.filter((r) => r !== null)).toHaveLength(1);
    const [ligne] = await db.select().from(siege).where(eq(siege.id, sieges[0]!));
    expect(ligne?.statut).toBe("bloque");
  });

  it("placement libre : 100 acheteurs pour 20 places, exactement 20 places distinctes bloquées", async () => {
    const { evenementId, categorieId } = await creerVenteDeTest(db, {
      places: 20,
      numerotees: false,
    });

    const resultats = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        bloquerPar(`acheteur-${i}`, { type: "placement-libre", evenementId, categorieId }),
      ),
    );

    const gagnants = resultats.filter((r) => r !== null);
    expect(gagnants).toHaveLength(20);
    expect(new Set(gagnants.map((b) => b.siegeId)).size).toBe(20);
  });

  it("un blocage crée la réservation au prix de la catégorie et un PlaceBloquee dans l'Outbox", async () => {
    const { evenementId, sieges } = await creerVenteDeTest(db, { places: 1 });
    const demande = { type: "siege", evenementId, siegeId: sieges[0]! } as const;

    const blocage = await bloquerPar("acheteur-1", demande);
    await bloquerPar("acheteur-2", demande); // perdu : aucune écriture

    const evenements = await evenementsDe(evenementId);
    expect(evenements).toHaveLength(1);
    expect(evenements[0]).toMatchObject({ type: "PlaceBloquee", topic: "reservation.ventes" });
    expect(evenements[0]?.contenu).toMatchObject({
      organisationId: ORGANISATION_TEST,
      donnees: { reservationId: blocage?.reservationId, siegeId: sieges[0] },
    });
    const reservations = await db
      .select()
      .from(reservation)
      .where(eq(reservation.evenementId, evenementId));
    expect(reservations).toMatchObject([
      { acheteurId: "acheteur-1", prixCentimes: 6500, statut: "en_attente_paiement" },
    ]);
  });

  it("une place au blocage expiré se reprend tout de suite ; l'ancien blocage est publié expiré", async () => {
    const { evenementId, sieges } = await creerVenteDeTest(db, { places: 1 });
    const demande = { type: "siege", evenementId, siegeId: sieges[0]! } as const;
    const premier = await bloquerPar("acheteur-1", demande);
    await expirerMaintenant(sieges[0]!);

    const second = await bloquerPar("acheteur-2", demande);

    expect(second).not.toBeNull();
    expect((await evenementsDe(evenementId)).map((e) => e.type)).toEqual([
      "PlaceBloquee",
      "BlocageExpire",
      "PlaceBloquee",
    ]);
    const [ancienne] = await db
      .select()
      .from(reservation)
      .where(eq(reservation.id, premier!.reservationId));
    expect(ancienne?.statut).toBe("expiree");
  });

  it("le worker d'expiration libère les blocages échus et publie BlocageExpire", async () => {
    const { evenementId, sieges } = await creerVenteDeTest(db, { places: 2 });
    await bloquerPar("acheteur-1", { type: "siege", evenementId, siegeId: sieges[0]! });
    await bloquerPar("acheteur-2", { type: "siege", evenementId, siegeId: sieges[1]! });
    await expirerMaintenant(sieges[0]!);

    expect(await depot.libererExpires(500)).toBeGreaterThanOrEqual(1);

    const lignes = await db.select().from(siege).where(eq(siege.evenementId, evenementId));
    expect(lignes.find((l) => l.id === sieges[0])).toMatchObject({
      statut: "libre",
      reservationId: null,
    });
    expect(lignes.find((l) => l.id === sieges[1])?.statut).toBe("bloque");
    expect((await evenementsDe(evenementId)).map((e) => e.type)).toContain("BlocageExpire");
  });

  it("la base refuse un second billet pour la même place, même si le code se trompe", async () => {
    const { evenementId, sieges } = await creerVenteDeTest(db, { places: 1 });
    const blocage = await bloquerPar("acheteur-1", {
      type: "siege",
      evenementId,
      siegeId: sieges[0]!,
    });
    const unBillet = (reservationId: string) => ({
      id: randomUUID(),
      evenementId,
      siegeId: sieges[0]!,
      reservationId,
      acheteurId: "acheteur-1",
      prixCentimes: 6500,
    });
    await db.insert(billet).values(unBillet(blocage!.reservationId));

    // Même place, autre réservation : refusé par UNIQUE (evenement_id, siege_id).
    await expirerMaintenant(sieges[0]!);
    await db.update(siege).set({ statut: "libre" }).where(eq(siege.id, sieges[0]!));
    const autre = await bloquerPar("acheteur-2", {
      type: "siege",
      evenementId,
      siegeId: sieges[0]!,
    });
    await expect(db.insert(billet).values(unBillet(autre!.reservationId))).rejects.toMatchObject({
      cause: { code: "23505" }, // violation d'unicité
    });
  });
});
