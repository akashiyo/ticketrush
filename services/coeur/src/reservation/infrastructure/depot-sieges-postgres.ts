import { type PlaceBloquee, TOPIC_VENTES } from "@ticketrush/contrats";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { Blocage, DemandeBlocage } from "../domaine/blocage.js";
import type { DepotSieges, GenerateurId } from "../domaine/ports.js";
import { outbox, reservation, siege } from "./schema.js";

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
        });

      // 0 ligne : la place est prise. Rien d'autre n'a été écrit.
      if (!place?.bloqueJusqua) return null;

      await tx.insert(reservation).values({
        id: reservationId,
        evenementId: place.evenementId,
        acheteurId,
      });

      // Même transaction : l'événement existe si et seulement si le blocage existe (ADR 007).
      const evenement: PlaceBloquee = {
        id: this.nouvelId(),
        type: "PlaceBloquee",
        versionSchema: 1,
        survenuLe: new Date().toISOString(),
        evenementId: place.evenementId,
        organisationId: place.organisationId,
        donnees: {
          reservationId,
          siegeId: place.siegeId,
          categorieId: place.categorieId,
          bloqueJusqua: place.bloqueJusqua.toISOString(),
        },
      };
      await tx.insert(outbox).values({
        id: evenement.id,
        topic: TOPIC_VENTES,
        cle: evenement.evenementId,
        type: evenement.type,
        contenu: evenement,
      });

      return { reservationId, ...place, bloqueJusqua: place.bloqueJusqua };
    });
  }
}
