// Mise en vente sous charge (scénarios C-1, P-1, P-2) : 50 000 acheteurs, 5 000 places.
//
//   k6 run tests/charge/mise-en-vente.js
//   puis : tests/charge/verifier-survente.sh   (ou tout en une fois : tests/charge/lancer.sh)
//
// Chaque acheteur virtuel entre dans la file (P2), puis réserve et paie (P1). La preuve de zéro
// survente n'est pas dans k6 : ce sont les requêtes SQL de controle-survente.sql, sur la base.
//
// Variables : ACHETEURS (50000), EVENEMENT (vente de démo), BASE_COEUR (accès direct au Cœur :
// la limite de débit de Traefik, comptée par adresse IP, bloquerait un test lancé d'une seule
// machine).

/* global __ENV */

import { jetonPourSetup, obtenirAdmission } from "./lib/file-attente.js";
import { lirePlan, reserverEtPayer } from "./lib/reservation.js";

const ACHETEURS = Number(__ENV.ACHETEURS || 50000);
const EVENEMENT = __ENV.EVENEMENT || "7e1d5c2a-3b4f-4c6d-8e9f-0a1b2c3d4e50";
const BASE_COEUR = __ENV.BASE_COEUR || "http://localhost:3002";

export const options = {
  scenarios: {
    ouverture: {
      // Chaque acheteur fait le parcours une fois ; tous arrivent dans la première minute.
      executor: "per-vu-iterations",
      vus: ACHETEURS,
      iterations: 1,
      maxDuration: "20m",
    },
  },
  thresholds: {
    // P-2 : un blocage reçoit sa réponse (obtenu ou déjà pris) en moins de 500 ms pour 99 %.
    "http_req_duration{nom:blocage}": ["p(99)<500"],
    // D-3 : aucune erreur serveur sur le parcours d'achat (99,9 %).
    "http_req_failed{nom:blocage}": ["rate<0.001"],
    "http_req_failed{nom:paiement}": ["rate<0.001"],
    // Pas plus de billets que de places : vérifié pour de bon par controle-survente.sql.
    billets_emis: ["count<=5000"],
  },
};

export function setup() {
  return { plan: lirePlan(BASE_COEUR, jetonPourSetup(), EVENEMENT) };
}

export default function ({ plan }) {
  const admission = obtenirAdmission(EVENEMENT);
  if (!admission) return;
  reserverEtPayer({ baseCoeur: BASE_COEUR, evenementId: EVENEMENT, plan, ...admission });
}
