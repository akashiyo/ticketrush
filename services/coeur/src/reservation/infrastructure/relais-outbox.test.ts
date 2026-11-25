import { randomUUID } from "node:crypto";

import { isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { type MessageAPublier, RelaisOutbox } from "../../commun/evenements/relais-outbox.js";
import { demarrerPostgres, dockerDisponible } from "../../test/postgres-de-test.js";
import { creerVenteDeTest } from "../../test/vente-de-test.js";
import { DUREE_BLOCAGE_SEC } from "../domaine/blocage.js";
import { DepotSiegesPostgres } from "./depot-sieges-postgres.js";
import { migrerReservation } from "./migrations-reservation.js";
import { outbox } from "./schema.js";

/** Relais de l'Outbox (ADR 007) : un vrai PostgreSQL, un broker simulé. */
describe.skipIf(!(await dockerDisponible()))("RelaisOutbox (PostgreSQL réel)", () => {
  let db: NodePgDatabase;
  let arreter: () => Promise<void>;
  let envoyes: MessageAPublier[];
  let brokerEnPanne: boolean;
  let relais: RelaisOutbox;

  beforeAll(async () => {
    ({ db, arreter } = await demarrerPostgres());
    await migrerReservation(db);
    relais = new RelaisOutbox(db, outbox, {
      envoyer: async (messages) => {
        if (brokerEnPanne) throw new Error("Redpanda injoignable");
        envoyes.push(...messages);
      },
    });
  });

  afterAll(async () => arreter?.());

  beforeEach(async () => {
    envoyes = [];
    brokerEnPanne = false;
    await relais.publierUnLot(); // vide ce que les tests précédents ont laissé
    envoyes = [];
    const { evenementId, sieges } = await creerVenteDeTest(db, { places: 3 });
    const depot = new DepotSiegesPostgres(db, randomUUID);
    for (const siegeId of sieges) {
      await depot.bloquer(
        { type: "siege", evenementId, siegeId },
        { reservationId: randomUUID(), acheteurId: "acheteur-1" },
        DUREE_BLOCAGE_SEC,
      );
    }
  });

  it("publie les événements dans l'ordre, avec la clé de partition, puis les marque publiés", async () => {
    expect(await relais.publierUnLot()).toBe(3);

    expect(envoyes.map((m) => m.topic)).toEqual(Array(3).fill("reservation.ventes"));
    expect(new Set(envoyes.map((m) => m.cle)).size).toBe(1);
    expect(JSON.parse(envoyes[0]!.valeur)).toMatchObject({
      type: "PlaceBloquee",
      versionSchema: 1,
    });
    expect(await db.select().from(outbox).where(isNull(outbox.publieLe))).toHaveLength(0);
    expect(await relais.publierUnLot()).toBe(0);
  });

  it("broker en panne : rien n'est perdu, tout part au retour du broker (D-2)", async () => {
    brokerEnPanne = true;
    await expect(relais.publierUnLot()).rejects.toThrow("Redpanda injoignable");
    expect(await db.select().from(outbox).where(isNull(outbox.publieLe))).toHaveLength(3);

    brokerEnPanne = false;
    expect(await relais.publierUnLot()).toBe(3);
  });
});
