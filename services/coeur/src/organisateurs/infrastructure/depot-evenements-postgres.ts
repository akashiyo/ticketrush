import { randomUUID } from "node:crypto";

import { TOPIC_CATALOGUE } from "@ticketrush/contrats";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { versOutbox } from "../../commun/evenements/outbox.js";
import {
  type Changement,
  type Evenement,
  EvenementIntrouvable,
  type Organisateur,
  type Salle,
} from "../domaine/evenement.js";
import type { DepotEvenements, LigneAudit } from "../domaine/ports.js";
import { versEvenementCatalogue } from "./contrat.js";
import { audit, evenement, outbox, salle, tarif } from "./schema.js";

type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

/** Le rôle PostgreSQL du back-office, créé par la migration 0001 (ADR 016). */
const ROLE_APPLICATIF = "organisateurs_app";

/** Ce qu'on écrit au journal : l'événement tel qu'il est, dates en clair. */
const instantane = (e: Evenement) => ({ ...e, debutLe: e.debutLe.toISOString() });

/**
 * Les événements des organisateurs dans PostgreSQL, isolés par la Row-Level Security (ADR 016).
 *
 * Toute opération du back-office passe par `enTantQue` : l'organisation tirée du jeton est fixée
 * pour la transaction seulement (`set_config(…, true)`, équivalent de SET LOCAL : une connexion
 * réutilisée par le pool ne la garde jamais), puis le rôle sans privilège est endossé. Aucune
 * requête ci-dessous ne filtre sur l'organisation : c'est la base qui le fait, et un oubli de
 * WHERE ne peut pas provoquer de fuite (scénario S-3).
 */
export class DepotEvenementsPostgres implements DepotEvenements {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly nouvelId: () => string = randomUUID,
  ) {}

  private enTantQue<T>(o: Organisateur, travail: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.organisation_id', ${o.organisationId}, true)`);
      await tx.execute(sql.raw(`SET LOCAL ROLE ${ROLE_APPLICATIF}`));
      return travail(tx);
    });
  }

  async salles(): Promise<Salle[]> {
    return this.db.select().from(salle).orderBy(asc(salle.ville), asc(salle.nom));
  }

  async salle(id: string): Promise<Salle | null> {
    const [trouvee] = await this.db.select().from(salle).where(eq(salle.id, id));
    return trouvee ?? null;
  }

  lister(o: Organisateur): Promise<Evenement[]> {
    return this.enTantQue(o, (tx) => this.charger(tx));
  }

  async trouver(o: Organisateur, evenementId: string): Promise<Evenement | null> {
    const [trouve] = await this.enTantQue(o, (tx) => this.charger(tx, evenementId));
    return trouve ?? null;
  }

  creer(o: Organisateur, e: Evenement): Promise<void> {
    return this.enTantQue(o, async (tx) => {
      await tx.insert(evenement).values({
        id: e.id,
        organisationId: e.organisationId,
        titre: e.titre,
        artiste: e.artiste,
        genre: e.genre,
        salleId: e.salle.id,
        debutLe: e.debutLe,
        statut: e.statut,
        version: e.version,
      });
      await tx
        .insert(tarif)
        .values(
          e.tarifs.map((t) => ({ ...t, evenementId: e.id, organisationId: e.organisationId })),
        );
      await this.journaliser(tx, o, "creation", e.id, null, instantane(e));
    });
  }

  appliquer(
    o: Organisateur,
    evenementId: string,
    action: string,
    changement: (e: Evenement) => Changement,
  ): Promise<Evenement> {
    return this.enTantQue(o, async (tx) => {
      // Lecture verrouillée : deux modifications simultanées s'appliquent l'une après l'autre.
      const [avant] = await this.charger(tx, evenementId, true);
      if (!avant) throw new EvenementIntrouvable();
      const { evenement: apres, publication } = changement(avant);

      await tx
        .update(evenement)
        .set({
          titre: apres.titre,
          artiste: apres.artiste,
          genre: apres.genre,
          debutLe: apres.debutLe,
          statut: apres.statut,
          version: apres.version,
        })
        .where(eq(evenement.id, evenementId));
      for (const t of apres.tarifs) {
        const ancien = avant.tarifs.find((a) => a.id === t.id);
        if (ancien && ancien.prixCentimes !== t.prixCentimes) {
          await tx.update(tarif).set({ prixCentimes: t.prixCentimes }).where(eq(tarif.id, t.id));
        }
      }
      // Même transaction : aucune modification sans trace (S-4), aucun événement perdu (ADR 007).
      await this.journaliser(tx, o, action, evenementId, instantane(avant), instantane(apres));
      if (publication) {
        const annonce = versEvenementCatalogue(apres, publication, this.nouvelId());
        await tx.insert(outbox).values(versOutbox(TOPIC_CATALOGUE, annonce));
      }
      return apres;
    });
  }

  journal(o: Organisateur, limite: number): Promise<LigneAudit[]> {
    return this.enTantQue(o, (tx) =>
      tx
        .select({
          le: audit.le,
          utilisateurId: audit.utilisateurId,
          action: audit.action,
          objet: audit.objet,
          objetId: audit.objetId,
          avant: audit.avant,
          apres: audit.apres,
        })
        .from(audit)
        .orderBy(desc(audit.id))
        .limit(limite),
    );
  }

  private async charger(tx: Transaction, evenementId?: string, verrou = false) {
    if (verrou && evenementId) {
      // Seule la ligne de l'événement est verrouillée, pas la salle partagée. Requête à part :
      // PostgreSQL refuse un nom de table qualifié par son schéma dans « FOR UPDATE OF ».
      await tx
        .select({ id: evenement.id })
        .from(evenement)
        .where(eq(evenement.id, evenementId))
        .for("update");
    }
    const lignes = await tx
      .select({ evenement, salle })
      .from(evenement)
      .innerJoin(salle, eq(salle.id, evenement.salleId))
      .where(evenementId ? eq(evenement.id, evenementId) : undefined)
      .orderBy(asc(evenement.debutLe));
    if (lignes.length === 0) return [];
    const tarifs = await tx
      .select()
      .from(tarif)
      .where(
        inArray(
          tarif.evenementId,
          lignes.map((l) => l.evenement.id),
        ),
      )
      .orderBy(asc(tarif.prixCentimes));
    return lignes.map(({ evenement: e, salle: s }): Evenement => ({
      id: e.id,
      organisationId: e.organisationId,
      titre: e.titre,
      artiste: e.artiste,
      genre: e.genre,
      salle: s,
      debutLe: e.debutLe,
      statut: e.statut,
      version: e.version,
      tarifs: tarifs
        .filter((t) => t.evenementId === e.id)
        .map((t) => ({
          id: t.id,
          libelle: t.libelle,
          placement: t.placement,
          capacite: t.capacite,
          prixCentimes: t.prixCentimes,
        })),
    }));
  }

  private async journaliser(
    tx: Transaction,
    o: Organisateur,
    action: string,
    objetId: string,
    avant: unknown,
    apres: unknown,
  ): Promise<void> {
    await tx.insert(audit).values({
      organisationId: o.organisationId,
      utilisateurId: o.utilisateurId,
      action,
      objet: "evenement",
      objetId,
      avant,
      apres,
    });
  }
}
