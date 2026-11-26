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

import { configurerVente, jetonPourSetup, obtenirAdmission } from "./lib/file-attente.js";
import { lirePlan, reserverEtPayer } from "./lib/reservation.js";

const ACHETEURS = Number(__ENV.ACHETEURS || 50000);
const EVENEMENT = __ENV.EVENEMENT || "7e1d5c2a-3b4f-4c6d-8e9f-0a1b2c3d4e50";
const BASE_COEUR = __ENV.BASE_COEUR || "http://localhost:3002";
// P-1 : les acheteurs arrivent dans la première minute de l'ouverture, à débit constant.
const ARRIVEES_PAR_SEC = Math.ceil(ACHETEURS / 60);

export const options = {
  scenarios: {
    ouverture: {
      // Une itération = un acheteur, avec son propre compte (lib/file-attente.js). Les
      // acheteurs déjà arrivés attendent dans la file pendant que les suivants arrivent.
      executor: "constant-arrival-rate",
      rate: ARRIVEES_PAR_SEC,
      timeUnit: "1s",
      duration: `${Math.ceil(ACHETEURS / ARRIVEES_PAR_SEC)}s`,
      preAllocatedVUs: ACHETEURS,
      maxVUs: ACHETEURS,
      // Laisse finir les acheteurs encore dans la file à la fin des arrivées.
      gracefulStop: "15m",
    },
  },
  thresholds: {
    // P-1 et P-5 (partie P2) : entrée et suivi de position en moins de 2 s pour 99 %, sans erreur.
    "http_req_duration{nom:entree}": ["p(99)<2000"],
    "http_req_duration{nom:position}": ["p(99)<2000"],
    "http_req_failed{nom:entree}": ["rate<0.001"],
    "http_req_failed{nom:position}": ["rate<0.001"],
    // La File admet bien les acheteurs : un test sans admission ne prouverait rien.
    acheteurs_admis: ["count>0"],
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
  configurerVente(EVENEMENT);
  return { plan: lirePlan(BASE_COEUR, jetonPourSetup(), EVENEMENT) };
}

export default function ({ plan }) {
  const admission = obtenirAdmission(EVENEMENT);
  if (!admission) return;
  reserverEtPayer({ baseCoeur: BASE_COEUR, evenementId: EVENEMENT, plan, ...admission });
}
