import { randomUUID } from "node:crypto";

import type { BilletEmis } from "@ticketrush/contrats";
import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { DepotReservations, GenerateurId } from "../domaine/ports.js";
import type { Billet, Reservation } from "../domaine/reservation.js";
import { versOutbox } from "./outbox/ligne-outbox.js";
import { billet, outbox, reservation, siege } from "./schema.js";

/** Réservations et émission des billets dans PostgreSQL (ADR 003, 007). */
export class DepotReservationsPostgres implements DepotReservations {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly nouvelId: GenerateurId = randomUUID,
  ) {}

  async trouver(reservationId: string): Promise<Reservation | null> {
    const [ligne] = await this.db
      .select({ reservation, billet })
      .from(reservation)
      .leftJoin(billet, eq(billet.reservationId, reservation.id))
      .where(eq(reservation.id, reservationId));
    if (!ligne) return null;
    const r = ligne.reservation;
    return {
      id: r.id,
      evenementId: r.evenementId,
      acheteurId: r.acheteurId,
      siegeId: r.siegeId,
      prixCentimes: r.prixCentimes,
      bloqueJusqua: r.bloqueJusqua,
      statut: r.statut,
      billet: ligne.billet ? versBillet(ligne.billet) : null,
    };
  }

  async emettreBillet(reservationId: string, paiementId: string): Promise<Billet | null> {
    return this.db.transaction(async (tx) => {
      // La place doit être encore bloquée par CETTE réservation : sinon, pas de billet (ADR 003).
      const [place] = await tx
        .update(siege)
        .set({ statut: "vendu", bloqueJusqua: null })
        .where(and(eq(siege.reservationId, reservationId), eq(siege.statut, "bloque")))
        .returning({
          siegeId: siege.id,
          evenementId: siege.evenementId,
          organisationId: siege.organisationId,
          categorieId: siege.categorieId,
        });
      if (!place) return null;

      const [payee] = await tx
        .update(reservation)
        .set({ statut: "payee", paiementId })
        .where(eq(reservation.id, reservationId))
        .returning({ acheteurId: reservation.acheteurId, prixCentimes: reservation.prixCentimes });
      if (!payee) throw new Error(`Réservation absente pour une place bloquée : ${reservationId}`);

      // La contrainte UNIQUE (evenement_id, siege_id) refuse tout second billet (filet de sécurité).
      const [emis] = await tx
        .insert(billet)
        .values({
          id: this.nouvelId(),
          evenementId: place.evenementId,
          siegeId: place.siegeId,
          reservationId,
          acheteurId: payee.acheteurId,
          prixCentimes: payee.prixCentimes,
        })
        .returning();
      if (!emis) throw new Error("Billet non créé");

      const evenement: BilletEmis = {
        id: this.nouvelId(),
        type: "BilletEmis",
        versionSchema: 1,
        survenuLe: emis.emisLe.toISOString(),
        evenementId: place.evenementId,
        organisationId: place.organisationId,
        donnees: {
          billetId: emis.id,
          reservationId,
          siegeId: place.siegeId,
          categorieId: place.categorieId,
          acheteurId: payee.acheteurId,
          prixCentimes: payee.prixCentimes,
          devise: "EUR",
        },
      };
      await tx.insert(outbox).values(versOutbox(evenement));
      return versBillet(emis);
    });
  }

  async marquerARembourser(reservationId: string, paiementId: string): Promise<void> {
    await this.db
      .update(reservation)
      .set({ statut: "a_rembourser", paiementId })
      .where(
        and(
          eq(reservation.id, reservationId),
          inArray(reservation.statut, ["en_attente_paiement", "expiree"]),
        ),
      );
  }
}

function versBillet(b: typeof billet.$inferSelect): Billet {
  return {
    billetId: b.id,
    reservationId: b.reservationId,
    evenementId: b.evenementId,
    siegeId: b.siegeId,
    acheteurId: b.acheteurId,
    prixCentimes: b.prixCentimes,
    emisLe: b.emisLe,
  };
}
