// Partie P2 du test de charge : entrer dans la file et attendre l'admission (ADR 008, 009, 011).
//
// Chaque acheteur virtuel a son propre compte (jeton pré-généré par
// identite-de-test/generer.mjs) : une position par compte (ADR 008). Il entre dans la file, puis
// interroge sa position à l'intervalle fixé par le serveur (ADR 009) jusqu'à son admission.
// ALTCHA est désactivé par docker-compose.charge.yml (dette D-010).
//
// Variables : BASE_FILE (accès direct à la File, voir README), DEBIT (acheteurs admis par
// seconde, 200 par défaut, ADR 008), ATTENTE_MAX_SEC (abandon au-delà, 600 par défaut).

/* global __ENV, open */

import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";
import http from "k6/http";
import { Counter, Trend } from "k6/metrics";

const BASE_FILE = __ENV.BASE_FILE || "http://localhost:3001";
const DEBIT = Number(__ENV.DEBIT || 200);
const ATTENTE_MAX_SEC = Number(__ENV.ATTENTE_MAX_SEC || 600);
const FICHIER_JETONS = "../identite-de-test/sortie/jetons.json";

const acheteurs = new SharedArray(
  "jetons des acheteurs",
  () => JSON.parse(open(FICHIER_JETONS)).acheteurs,
);
const organisateur = new SharedArray("jeton de l'organisateur", () => [
  JSON.parse(open(FICHIER_JETONS)).organisateur,
])[0];

export const acheteursAdmis = new Counter("acheteurs_admis");
export const acheteursNonAdmis = new Counter("acheteurs_non_admis");
export const attenteAdmission = new Trend("attente_admission", true);

const entetes = (jeton) => ({
  Authorization: `Bearer ${jeton}`,
  "Content-Type": "application/json",
});

/**
 * Ouvre la vente dans la File, maintenant, au débit DEBIT (à appeler dans setup()).
 * Provisoire : la File lira l'ouverture dans EvenementPublie (dette D-014).
 */
export function configurerVente(evenementId) {
  const reponse = http.put(
    `${BASE_FILE}/files/${evenementId}/vente`,
    JSON.stringify({ ouvertureLe: new Date().toISOString(), debitParSeconde: DEBIT }),
    { headers: entetes(organisateur), tags: { nom: "configuration" } },
  );
  if (reponse.status !== 204) {
    throw new Error(`Vente non configurée dans la File (${reponse.status}) : ${reponse.body}`);
  }
}

/** Jeton d'un acheteur, pour lire le plan de salle dans setup(). */
export function jetonPourSetup() {
  return acheteurs[0];
}

/**
 * Fait entrer l'acheteur virtuel dans la file et attend son admission.
 * @param {string} evenementId
 * @returns {{ jetonKeycloak: string, jetonAcces: string } | null}
 *   le jeton de l'acheteur et le jeton d'accès remis par la File ;
 *   null si l'acheteur n'est pas admis (erreur, délai dépassé).
 */
export function obtenirAdmission(evenementId) {
  // Numéro unique de l'itération dans tout le test : un acheteur = un compte, jamais réutilisé.
  const numero = exec.scenario.iterationInTest;
  if (numero >= acheteurs.length) return null; // arrivées en surplus (arrondi du débit)
  const jeton = acheteurs[numero];
  const debut = Date.now();

  let reponse = http.post(`${BASE_FILE}/files/${evenementId}/entrer`, "{}", {
    headers: entetes(jeton),
    tags: { nom: "entree" },
  });
  check(reponse, { "entrée : 200": (r) => r.status === 200 });
  if (reponse.status !== 200) {
    acheteursNonAdmis.add(1);
    return null;
  }

  let etat = reponse.json();
  while (etat.statut === "en_attente" && Date.now() - debut < ATTENTE_MAX_SEC * 1000) {
    sleep(etat.prochainAppelDansSec);
    reponse = http.get(`${BASE_FILE}/files/${evenementId}/position`, {
      headers: entetes(jeton),
      tags: { nom: "position" },
    });
    check(reponse, { "position : 200": (r) => r.status === 200 });
    if (reponse.status !== 200) break;
    etat = reponse.json();
  }

  if (etat.statut !== "admis") {
    acheteursNonAdmis.add(1);
    return null;
  }
  acheteursAdmis.add(1);
  attenteAdmission.add(Date.now() - debut);
  return { jetonKeycloak: jeton, jetonAcces: etat.jetonAcces };
}
