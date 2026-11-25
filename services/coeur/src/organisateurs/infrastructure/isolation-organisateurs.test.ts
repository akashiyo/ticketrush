import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { demarrerPostgres, dockerDisponible } from "../../test/postgres-de-test.js";
import { GestionEvenements } from "../application/gestion-evenements.js";
import type { Organisateur } from "../domaine/evenement.js";
import { DepotEvenementsPostgres } from "./depot-evenements-postgres.js";
import { chargerOrganisateursDemo } from "./donnees-demo.js";
import { migrerOrganisateurs } from "./initialisation-organisateurs.js";

const ALPHA = "6f1c3a52-8d2e-4b7a-9c41-1a2b3c4d5e01";
const BETA = "6f1c3a52-8d2e-4b7a-9c41-1a2b3c4d5e02";
const alpha: Organisateur = {
  organisationId: ALPHA,
  utilisateurId: "alpha.gestion",
  roles: ["organisateur-gestionnaire"],
};
const beta: Organisateur = {
  organisationId: BETA,
  utilisateurId: "beta.admin",
  roles: ["organisateur-admin"],
};

/**
 * Scénario S-3 (ADR 016), sur un vrai PostgreSQL : l'organisateur A tente de lire, modifier et
 * supprimer les données de B → 0 ligne lue, 0 ligne modifiée. Et le journal d'audit est en ajout
 * seul (S-4).
 */
describe.skipIf(!(await dockerDisponible()))(
  "Isolation des organisateurs (S-3, PostgreSQL réel)",
  () => {
    let db: NodePgDatabase;
    let arreter: () => Promise<void>;
    let gestion: GestionEvenements;
    let evenementDeBeta: string;

    beforeAll(async () => {
      ({ db, arreter } = await demarrerPostgres());
      await migrerOrganisateurs(db);
      await chargerOrganisateursDemo(db);
      gestion = new GestionEvenements(
        new DepotEvenementsPostgres(db),
        { parEvenement: async () => new Map() },
        randomUUID,
        () => new Date("2026-12-01"),
      );
      const [salle] = await gestion.salles();
      evenementDeBeta = (
        await gestion.creer(beta, {
          titre: "Concert de Beta",
          artiste: null,
          genre: null,
          salleId: salle!.id,
          debutLe: new Date("2027-09-01T20:00:00Z"),
          tarifs: [{ libelle: "Fosse", placement: "libre", capacite: 500, prixCentimes: 3000 }],
        })
      ).id;
    });

    afterAll(async () => arreter?.());

    /** Une requête SQL brute sous le rôle applicatif, pour une organisation (ou aucune). */
    const sousRole = (organisationId: string | null, requete: string) =>
      db.transaction(async (tx) => {
        if (organisationId) {
          await tx.execute(sql`SELECT set_config('app.organisation_id', ${organisationId}, true)`);
        }
        await tx.execute(sql.raw("SET LOCAL ROLE organisateurs_app"));
        return tx.execute(sql.raw(requete));
      });

    it("chacun ne voit que ses événements", async () => {
      expect((await gestion.lister(alpha)).map((e) => e.organisationId)).toEqual(
        Array(5).fill(ALPHA),
      );
      expect((await gestion.lister(beta)).map((e) => e.id)).toEqual([evenementDeBeta]);
    });

    it("A ne peut ni lire, ni modifier, ni publier l'événement de B", async () => {
      await expect(gestion.consulter(alpha, evenementDeBeta)).rejects.toMatchObject({
        name: "EvenementIntrouvable",
      });
      await expect(
        gestion.modifier(alpha, evenementDeBeta, { titre: "piraté" }),
      ).rejects.toMatchObject({
        name: "EvenementIntrouvable",
      });
      await expect(gestion.publier(alpha, evenementDeBeta)).rejects.toMatchObject({
        name: "EvenementIntrouvable",
      });
    });

    it("même en SQL sans WHERE : 0 ligne lue, 0 ligne modifiée ou supprimée chez B", async () => {
      const lues = await sousRole(
        ALPHA,
        `SELECT * FROM organisateurs.evenement WHERE id = '${evenementDeBeta}'`,
      );
      const modifiees = await sousRole(
        ALPHA,
        `UPDATE organisateurs.evenement SET titre = 'piraté' WHERE id = '${evenementDeBeta}'`,
      );
      const tarifs = await sousRole(
        ALPHA,
        `UPDATE organisateurs.tarif SET prix_centimes = 0 WHERE evenement_id = '${evenementDeBeta}'`,
      );
      expect(lues.rows).toHaveLength(0);
      expect(modifiees.rowCount).toBe(0);
      expect(tarifs.rowCount).toBe(0);
      // Le rôle applicatif n'a même pas le droit de supprimer un événement.
      await expect(sousRole(ALPHA, "DELETE FROM organisateurs.evenement")).rejects.toMatchObject({
        cause: { code: "42501" },
      });
    });

    it("A ne peut pas écrire au nom de B (WITH CHECK)", async () => {
      await expect(
        sousRole(
          ALPHA,
          `INSERT INTO organisateurs.evenement (id, organisation_id, titre, salle_id, debut_le)
         SELECT '${randomUUID()}', '${BETA}', 'usurpation', id, now() FROM organisateurs.salle LIMIT 1`,
        ),
      ).rejects.toMatchObject({ cause: { code: "42501" } });
    });

    it("sans organisation fixée, rien n'est visible (échec sûr)", async () => {
      expect((await sousRole(null, "SELECT * FROM organisateurs.evenement")).rows).toHaveLength(0);
    });

    it("le journal d'audit est en ajout seul, et chacun ne lit que le sien (S-4)", async () => {
      const [evenementDAlpha] = await gestion.lister(alpha);
      await gestion.changerPrix(alpha, evenementDAlpha!.id, evenementDAlpha!.tarifs[0]!.id, 9900);

      const journal = await gestion.journal(alpha);
      expect(journal[0]).toMatchObject({
        action: "changement_de_prix",
        utilisateurId: "alpha.gestion",
      });
      expect((await gestion.journal(beta)).map((l) => l.action)).toEqual(["creation"]);
      for (const requete of [
        "UPDATE organisateurs.audit SET action = 'x'",
        "DELETE FROM organisateurs.audit",
      ]) {
        await expect(sousRole(ALPHA, requete)).rejects.toMatchObject({ cause: { code: "42501" } });
      }
    });
  },
);
