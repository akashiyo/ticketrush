/**
 * Identifiants fixes de la vente de démonstration, partagés par le Catalogue (l'événement publié)
 * et la Réservation (ses 5 000 places), pour que la File, le navigateur et k6 visent la même vente.
 */
export const VENTE_DEMO = {
  evenementId: "7e1d5c2a-3b4f-4c6d-8e9f-0a1b2c3d4e50",
  /** Alpha Productions, organisation de test du domaine Keycloak (infra/keycloak). */
  organisationId: "6f1c3a52-8d2e-4b7a-9c41-1a2b3c4d5e01",
  fosse: { id: "7e1d5c2a-3b4f-4c6d-8e9f-0a1b2c3d4e51", places: 3_000, prixCentimes: 4_500 },
  /** Places numérotées : rangs A à T, 100 sièges par rang. */
  categorie1: {
    id: "7e1d5c2a-3b4f-4c6d-8e9f-0a1b2c3d4e52",
    rangs: 20,
    parRang: 100,
    prixCentimes: 6_500,
  },
} as const;
