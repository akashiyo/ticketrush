/**
 * Domaine des Organisateurs : chaque organisateur gère ses événements et leurs tarifs
 * (module Organisateurs multi-tenants ; ADR 016, 023).
 *
 * C'est le **côté écriture** du catalogue (CQRS, ADR 014) : les règles vivent ici, et chaque
 * changement visible du public est annoncé par un événement (EvenementPublie, EvenementModifie,
 * TarifModifie) que le Catalogue projette.
 */

export const ROLES_ORGANISATEUR = [
  "organisateur-admin",
  "organisateur-gestionnaire",
  "organisateur-lecteur",
] as const;

/** Un membre d'une organisation, tel que lu dans son jeton Keycloak (ADR 010, 016). */
export interface Organisateur {
  organisationId: string;
  utilisateurId: string;
  roles: string[];
}

/** Le lecteur consulte ; l'administrateur et le gestionnaire modifient (ADR 016). */
export function peutModifier(organisateur: Organisateur): boolean {
  return organisateur.roles.some(
    (r) => r === "organisateur-admin" || r === "organisateur-gestionnaire",
  );
}

export interface Salle {
  id: string;
  nom: string;
  ville: string;
}

export interface Tarif {
  id: string;
  libelle: string;
  placement: "numerote" | "libre";
  capacite: number;
  prixCentimes: number;
}

export interface Evenement {
  id: string;
  organisationId: string;
  titre: string;
  artiste: string | null;
  genre: string | null;
  salle: Salle;
  debutLe: Date;
  /** Un brouillon est invisible du public ; un événement publié est au catalogue. */
  statut: "brouillon" | "publie";
  /** + 1 à chaque changement : les consommateurs ignorent une version plus ancienne. */
  version: number;
  tarifs: Tarif[];
}

/** Ce qu'un changement annonce au reste du système ; rien pour un brouillon. */
export type Publication =
  "EvenementPublie" | "EvenementModifie" | { type: "TarifModifie"; tarifId: string } | null;

export interface Changement {
  evenement: Evenement;
  publication: Publication;
}

/** Une règle métier n'est pas respectée (données invalides, transition interdite). */
export class RegleNonRespectee extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegleNonRespectee";
  }
}

/** Le rôle de l'organisateur ne permet pas cette action. */
export class ActionInterdite extends Error {
  constructor() {
    super("Votre rôle ne permet pas de modifier les événements");
    this.name = "ActionInterdite";
  }
}

/** Événement inconnu, ou d'une autre organisation : même réponse, pour ne rien révéler (S-3). */
export class EvenementIntrouvable extends Error {
  constructor() {
    super("Événement introuvable");
    this.name = "EvenementIntrouvable";
  }
}

export interface NouvelEvenement {
  titre: string;
  artiste: string | null;
  genre: string | null;
  salle: Salle;
  debutLe: Date;
  tarifs: Omit<Tarif, "id">[];
}

export interface ModificationInformations {
  titre?: string;
  artiste?: string | null;
  genre?: string | null;
  debutLe?: Date;
}

function verifierTitre(titre: string): void {
  if (titre.trim().length === 0 || titre.length > 200) {
    throw new RegleNonRespectee("Le titre doit faire entre 1 et 200 caractères");
  }
}

function verifierDate(debutLe: Date, maintenant: Date): void {
  if (Number.isNaN(debutLe.getTime()) || debutLe <= maintenant) {
    throw new RegleNonRespectee("La date de l'événement doit être dans le futur");
  }
}

function verifierPrix(prixCentimes: number): void {
  if (!Number.isInteger(prixCentimes) || prixCentimes < 0 || prixCentimes > 1_000_000) {
    throw new RegleNonRespectee("Le prix doit être un nombre de centimes entre 0 et 10 000 €");
  }
}

/** Un événement naît brouillon : il n'apparaît au catalogue qu'à sa publication. */
export function creerBrouillon(
  id: string,
  organisationId: string,
  donnees: NouvelEvenement,
  nouvelId: () => string,
  maintenant: Date,
): Evenement {
  verifierTitre(donnees.titre);
  verifierDate(donnees.debutLe, maintenant);
  if (donnees.tarifs.length < 1 || donnees.tarifs.length > 10) {
    throw new RegleNonRespectee("Un événement a entre 1 et 10 catégories de places");
  }
  for (const t of donnees.tarifs) {
    verifierPrix(t.prixCentimes);
    if (!Number.isInteger(t.capacite) || t.capacite < 1 || t.capacite > 100_000) {
      throw new RegleNonRespectee("La capacité d'une catégorie est comprise entre 1 et 100 000");
    }
    if (t.libelle.trim().length === 0) throw new RegleNonRespectee("Chaque catégorie a un nom");
  }
  return {
    id,
    organisationId,
    titre: donnees.titre.trim(),
    artiste: donnees.artiste,
    genre: donnees.genre,
    salle: donnees.salle,
    debutLe: donnees.debutLe,
    statut: "brouillon",
    version: 1,
    tarifs: donnees.tarifs.map((t) => ({ ...t, id: nouvelId() })),
  };
}

/** Titre, artiste, genre, date. Un événement publié annonce son nouvel état au catalogue. */
export function modifierInformations(
  evenement: Evenement,
  modification: ModificationInformations,
  maintenant: Date,
): Changement {
  if (modification.titre !== undefined) verifierTitre(modification.titre);
  if (modification.debutLe !== undefined) verifierDate(modification.debutLe, maintenant);
  return {
    evenement: {
      ...evenement,
      ...modification,
      titre: modification.titre?.trim() ?? evenement.titre,
      version: evenement.version + 1,
    },
    publication: evenement.statut === "publie" ? "EvenementModifie" : null,
  };
}

/**
 * Nouveau prix d'une catégorie. La capacité et le placement ne changent pas après la création :
 * les places à vendre en dépendent.
 */
export function changerPrix(
  evenement: Evenement,
  tarifId: string,
  prixCentimes: number,
): Changement {
  verifierPrix(prixCentimes);
  if (!evenement.tarifs.some((t) => t.id === tarifId)) {
    throw new RegleNonRespectee("Catégorie inconnue pour cet événement");
  }
  return {
    evenement: {
      ...evenement,
      tarifs: evenement.tarifs.map((t) => (t.id === tarifId ? { ...t, prixCentimes } : t)),
      version: evenement.version + 1,
    },
    publication: evenement.statut === "publie" ? { type: "TarifModifie", tarifId } : null,
  };
}

/** Publier : l'événement entre au catalogue public. Une seule fois, et avant sa date. */
export function publier(evenement: Evenement, maintenant: Date): Changement {
  if (evenement.statut === "publie") throw new RegleNonRespectee("L'événement est déjà publié");
  verifierDate(evenement.debutLe, maintenant);
  return {
    evenement: { ...evenement, statut: "publie", version: evenement.version + 1 },
    publication: "EvenementPublie",
  };
}
