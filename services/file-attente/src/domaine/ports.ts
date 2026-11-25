import type { Vente } from "./file.js";

/** Admission accordée à un acheteur : son jeton d'accès et sa date d'expiration. */
export interface Admission {
  jetonAcces: string;
  expireLe: string;
}

/** Port de stockage de la file, défini par le domaine (implémenté avec Redis, ADR 008). */
export interface DepotFile {
  configurerVente(vente: Vente): Promise<void>;
  lireVente(evenementId: string): Promise<Vente | null>;
  ventesConfigurees(): Promise<string[]>;

  /** Ajoute l'acheteur s'il n'y est pas déjà : une seule position par compte. */
  entrer(evenementId: string, acheteurId: string, score: number): Promise<void>;
  /** Position de l'acheteur (1 = le prochain), ou null s'il n'est pas dans la file. */
  position(evenementId: string, acheteurId: string): Promise<number | null>;
  /** Les N premiers de la file, sans les retirer. */
  premiers(evenementId: string, nombre: number): Promise<string[]>;

  /** Enregistre les admissions et retire les acheteurs de la file, en une seule opération. */
  admettre(
    evenementId: string,
    admissions: { acheteurId: string; admission: Admission; dureeSec: number }[],
  ): Promise<void>;
  lireAdmission(evenementId: string, acheteurId: string): Promise<Admission | null>;

  /** Verrou de courte durée : un seul worker admet à la fois (ADR 008). */
  prendreVerrou(nom: string, dureeMs: number): Promise<boolean>;
}

/** Port de signature des jetons d'accès à la vente (ADR 011). */
export interface SignataireJeton {
  signer(acheteurId: string, evenementId: string): Promise<Admission>;
}

export const DEPOT_FILE = Symbol("DepotFile");
export const SIGNATAIRE_JETON = Symbol("SignataireJeton");
export const HORLOGE = Symbol("Horloge");
export type Horloge = () => Date;
