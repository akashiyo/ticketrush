import type { BlocageExpire, PlaceBloquee } from "@ticketrush/contrats";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { Blocage, DemandeBlocage } from "../domaine/blocage.js";
import type { DepotSieges, GenerateurId } from "../domaine/ports.js";
import { versOutbox } from "./outbox/ligne-outbox.js";
import { categorie, outbox, reservation, siege } from "./schema.js";

type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

/** Une place est réservable si elle est libre, ou si son blocage a expiré (ADR 003). */
const disponible = or(
  eq(siege.statut, "libre"),
  and(eq(siege.statut, "bloque"), lt(siege.bloqueJusqua, sql`now()`)),
);

/**
 * Blocage atomique des places dans PostgreSQL (ADR 003, scénario C-1).
 *
 * Tout se joue dans **un seul UPDATE conditionnel**. PostgreSQL verrouille la ligne : si deux
 * acheteurs visent la même place, le second attend le premier, réévalue la condition
 * « disponible » sur la ligne modifiée, et ne met rien à jour. Il n'y a jamais deux gagnants.
 *
 * L'heure vient de PostgreSQL (`now()`), pas de l'application : toutes les instances du Cœur
 * partagent la même horloge pour l'expiration.
 */
export class DepotSiegesPostgres implements DepotSieges {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly nouvelId: GenerateurId,
  ) {}

  async bloquer(
    demande: DemandeBlocage,
    { reservationId, acheteurId }: { reservationId: string; acheteurId: string },
    dureeSec: number,
  ): Promise<Blocage | null> {
    return this.db.transaction(async (tx) => {
      const cible =
        demande.type === "siege"
          ? // Siège numéroté choisi par l'acheteur.
            and(eq(siege.evenementId, demande.evenementId), eq(siege.id, demande.siegeId))
          : // Placement libre : la première place disponible que personne n'est en train de
            // bloquer. SKIP LOCKED évite d'attendre derrière les autres acheteurs de la fosse.
            inArray(
              siege.id,
              tx
                .select({ id: siege.id })
                .from(siege)
                .where(
                  and(
                    eq(siege.evenementId, demande.evenementId),
                    eq(siege.categorieId, demande.categorieId),
                    disponible,
                  ),
                )
                .limit(1)
                .for("update", { skipLocked: true }),
            );

      const [place] = await tx
        .update(siege)
        .set({
          statut: "bloque",
          reservationId,
          bloqueJusqua: sql`now() + make_interval(secs => ${dureeSec}::double precision)`,
        })
        .where(and(cible, disponible))
        .returning({
          siegeId: siege.id,
          evenementId: siege.evenementId,
          organisationId: siege.organisationId,
          categorieId: siege.categorieId,
          bloqueJusqua: siege.bloqueJusqua,
          // PostgreSQL 18 : l'état de la ligne avant l'UPDATE, dans le même ordre SQL.
          ancienStatut: sql<string>`old.statut`,
          ancienneReservation: sql<string | null>`old.reservation_id`,
        });

      // 0 ligne : la place est prise. Rien d'autre n'a été écrit.
      if (!place?.bloqueJusqua) return null;
      const blocage: Blocage = {
        reservationId,
        evenementId: place.evenementId,
        organisationId: place.organisationId,
        siegeId: place.siegeId,
        categorieId: place.categorieId,
        bloqueJusqua: place.bloqueJusqua,
      };

      // La place était bloquée par un acheteur qui n'a pas payé à temps : son blocage expire
      // maintenant. Publier BlocageExpire garde juste le stock restant calculé par la File.
      if (place.ancienStatut === "bloque" && place.ancienneReservation) {
        await this.expirer(tx, [{ ...blocage, reservationId: place.ancienneReservation }]);
      }

      const [tarif] = await tx
        .select({ prixCentimes: categorie.prixCentimes })
        .from(categorie)
        .where(eq(categorie.id, place.categorieId));
      if (!tarif) throw new Error(`Catégorie sans tarif : ${place.categorieId}`);

      await tx.insert(reservation).values({
        id: reservationId,
        evenementId: place.evenementId,
        acheteurId,
        siegeId: place.siegeId,
        prixCentimes: tarif.prixCentimes,
        bloqueJusqua: place.bloqueJusqua,
      });

      // Même transaction : l'événement existe si et seulement si le blocage existe (ADR 007).
      const evenement: PlaceBloquee = {
        ...this.enveloppe(blocage),
        type: "PlaceBloquee",
        donnees: {
          reservationId,
          siegeId: blocage.siegeId,
          categorieId: blocage.categorieId,
          bloqueJusqua: blocage.bloqueJusqua.toISOString(),
        },
      };
      await tx.insert(outbox).values(versOutbox(evenement));

      return blocage;
    });
  }

  /**
   * Libère les places dont le blocage a expiré, par lots (worker d'expiration, ADR 003).
   * SKIP LOCKED : plusieurs instances du Cœur peuvent tourner sans se gêner ni libérer deux fois.
   * Renvoie le nombre de places libérées.
   */
  async libererExpires(taille: number): Promise<number> {
    return this.db.transaction(async (tx) => {
      const expires = await tx
        .select({
          siegeId: siege.id,
          evenementId: siege.evenementId,
          organisationId: siege.organisationId,
          categorieId: siege.categorieId,
          reservationId: siege.reservationId,
        })
        .from(siege)
        .where(and(eq(siege.statut, "bloque"), lt(siege.bloqueJusqua, sql`now()`)))
        .limit(taille)
        .for("update", { skipLocked: true });
      if (expires.length === 0) return 0;

      await tx
        .update(siege)
        .set({ statut: "libre", reservationId: null, bloqueJusqua: null })
        .where(
          inArray(
            siege.id,
            expires.map((e) => e.siegeId),
          ),
        );
      await this.expirer(
        tx,
        expires.map((e) => ({ ...e, reservationId: e.reservationId ?? "" })),
      );
      return expires.length;
    });
  }

  /** Marque les réservations expirées et écrit un BlocageExpire par place, dans la transaction. */
  private async expirer(tx: Transaction, blocages: Omit<Blocage, "bloqueJusqua">[]): Promise<void> {
    await tx
      .update(reservation)
      .set({ statut: "expiree" })
      .where(
        and(
          inArray(
            reservation.id,
            blocages.map((b) => b.reservationId),
          ),
          eq(reservation.statut, "en_attente_paiement"),
        ),
      );
    await tx.insert(outbox).values(
      blocages.map((b) => {
        const evenement: BlocageExpire = {
          ...this.enveloppe(b),
          type: "BlocageExpire",
          donnees: {
            reservationId: b.reservationId,
            siegeId: b.siegeId,
            categorieId: b.categorieId,
          },
        };
        return versOutbox(evenement);
      }),
    );
  }

  private enveloppe(b: { evenementId: string; organisationId: string }) {
    return {
      id: this.nouvelId(),
      versionSchema: 1 as const,
      survenuLe: new Date().toISOString(),
      evenementId: b.evenementId,
      organisationId: b.organisationId,
    };
  }
}
