// Partie P1 du test de charge : réserver puis payer une place auprès du Cœur (ADR 003, 005).
//
// Utilisée par mise-en-vente.js, après l'admission par la File (partie P2). Chaque acheteur
// virtuel tente une place ; s'il la perd (409), il en tente une autre, au plus 3 fois.

import { check, sleep } from "k6";
import http from "k6/http";
import { Counter } from "k6/metrics";

export const blocagesObtenus = new Counter("blocages_obtenus");
export const placesDejaPrises = new Counter("places_deja_prises");
export const billetsEmis = new Counter("billets_emis");
export const paiementsIndisponibles = new Counter("paiements_indisponibles");
export const acheteursSansPlace = new Counter("acheteurs_sans_place");

/** Part des acheteurs qui visent la fosse ; les autres choisissent un siège numéroté au hasard. */
const PART_FOSSE = 0.6;

/** Lit le plan une fois (dans setup) : catégories et identifiants des sièges numérotés. */
export function lirePlan(baseCoeur, jetonKeycloak, evenementId) {
  const reponse = http.get(`${baseCoeur}/evenements/${evenementId}/plan`, {
    headers: { Authorization: `Bearer ${jetonKeycloak}` },
    tags: { nom: "plan" },
  });
  if (reponse.status !== 200)
    throw new Error(`Plan illisible (${reponse.status}) : ${reponse.body}`);
  const plan = reponse.json();
  const fosse = plan.categories.find((c) => c.placement === "libre");
  const sieges = plan.categories
    .filter((c) => c.placement === "numerote")
    .flatMap((c) => c.places.map((p) => p.siegeId));
  return { fosse: fosse ? fosse.categorieId : null, sieges };
}

function demandeAuHasard(plan) {
  if (plan.fosse && (plan.sieges.length === 0 || Math.random() < PART_FOSSE)) {
    return { categorieId: plan.fosse };
  }
  return { siegeId: plan.sieges[Math.floor(Math.random() * plan.sieges.length)] };
}

/**
 * Un acheteur admis réserve et paie. Renvoie true s'il obtient un billet.
 * @param {{ baseCoeur: string, evenementId: string, plan: ReturnType<typeof lirePlan>,
 *           jetonKeycloak: string, jetonAcces: string }} acheteur
 */
export function reserverEtPayer({ baseCoeur, evenementId, plan, jetonKeycloak, jetonAcces }) {
  const entetes = { Authorization: `Bearer ${jetonKeycloak}`, "Content-Type": "application/json" };

  // 1. Bloquer une place : 3 essais au plus si elle est déjà prise.
  let blocage = null;
  for (let essai = 0; essai < 3 && !blocage; essai++) {
    const reponse = http.post(
      `${baseCoeur}/evenements/${evenementId}/blocages`,
      JSON.stringify(demandeAuHasard(plan)),
      {
        headers: { ...entetes, "Jeton-Acces": jetonAcces },
        tags: { nom: "blocage" },
        // 409 est une réponse normale au pic : elle ne compte pas comme un échec HTTP.
        responseCallback: http.expectedStatuses(201, 409),
      },
    );
    check(reponse, { "blocage : 201 ou 409": (r) => r.status === 201 || r.status === 409 });
    if (reponse.status === 201) {
      blocage = reponse.json();
      blocagesObtenus.add(1);
    } else if (reponse.status === 409) {
      placesDejaPrises.add(1);
    } else {
      break; // 403 (jeton) ou 5xx : on n'insiste pas
    }
  }
  if (!blocage) {
    acheteursSansPlace.add(1);
    return false;
  }

  // 2. Payer : la même clé d'idempotence est rejouée si le prestataire est indisponible (503).
  const cle = crypto.randomUUID();
  for (let essai = 0; essai < 3; essai++) {
    const reponse = http.post(
      `${baseCoeur}/reservations/${blocage.reservationId}/paiement`,
      JSON.stringify({ moyenDePaiement: { jeton: "carte-acceptee" } }),
      {
        headers: { ...entetes, "Idempotency-Key": cle },
        tags: { nom: "paiement" },
        responseCallback: http.expectedStatuses(201, 503),
      },
    );
    if (reponse.status === 201) {
      billetsEmis.add(1);
      return true;
    }
    if (reponse.status !== 503) break;
    paiementsIndisponibles.add(1);
    sleep(1);
  }
  return false;
}
