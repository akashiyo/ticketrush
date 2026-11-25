// Partie P2 du test de charge : entrer dans la file et attendre l'admission (ADR 008, 009).
//
// SUBSTITUT : ce fichier fixe l'interface entre les deux moitiés du test, comme les contrats
// entre P1 et P2. P2 le remplace par la vraie entrée dans la file (connexion Keycloak d'un
// acheteur de test, défi anti-robots ou ALTCHA_ACTIF=false, interrogation de la position).

/**
 * Fait entrer l'acheteur virtuel dans la file et attend son admission.
 * @param {string} _evenementId
 * @returns {{ jetonKeycloak: string, jetonAcces: string } | null}
 *   le jeton Keycloak de l'acheteur et le jeton d'accès remis par la File ;
 *   null si l'acheteur n'est pas admis (vente complète, délai dépassé).
 */
export function obtenirAdmission(_evenementId) {
  throw new Error("tests/charge/lib/file-attente.js : partie de P2, pas encore écrite");
}

/**
 * Jeton Keycloak d'un acheteur, pour lire le plan de salle dans setup().
 * @returns {string}
 */
export function jetonPourSetup() {
  throw new Error("tests/charge/lib/file-attente.js : partie de P2, pas encore écrite");
}
