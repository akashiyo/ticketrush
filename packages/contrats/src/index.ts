/**
 * Contrats partagés entre P1 (Cœur) et P2 (File d'attente, Analytique, faux paiement).
 *
 * Seul point de contact entre les deux pistes de travail : toute modification
 * passe par une pull request relue par l'autre membre du binôme (CODEOWNERS)
 * et est vérifiée en CI (oasdiff, comparaison AsyncAPI — ADR 021).
 *
 * Contenu prévu (contrats v1, jalon 1) :
 * - jeton d'admission à la vente (ADR 011) ;
 * - événements de vente et de file d'attente (AsyncAPI, ADR 005 et 006) ;
 * - API du faux prestataire de paiement (OpenAPI) ;
 * - champs des jetons Keycloak (ADR 010).
 */

/** Version des contrats. À incrémenter à chaque changement, compatible ou non. */
export const VERSION_CONTRATS = "0.1.0";
