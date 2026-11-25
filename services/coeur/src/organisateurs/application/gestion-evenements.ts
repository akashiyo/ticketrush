import {
  ActionInterdite,
  changerPrix,
  creerBrouillon,
  type Evenement,
  EvenementIntrouvable,
  type ModificationInformations,
  modifierInformations,
  type NouvelEvenement,
  type Organisateur,
  peutModifier,
  publier,
  RegleNonRespectee,
} from "../domaine/evenement.js";
import type {
  DepotEvenements,
  Horloge,
  LectureVentes,
  LigneAudit,
  ResumeVentes,
} from "../domaine/ports.js";

export type DemandeCreation = Omit<NouvelEvenement, "salle"> & { salleId: string };

const AUCUNE_VENTE: ResumeVentes = { places: 0, vendues: 0, bloquees: 0, recetteCentimes: 0 };

/**
 * Cas d'usage du dashboard de gestion d'un organisateur (module Organisateurs, ADR 016).
 * L'organisation vient toujours du jeton de l'organisateur, jamais d'un paramètre.
 */
export class GestionEvenements {
  constructor(
    private readonly depot: DepotEvenements,
    private readonly ventes: LectureVentes,
    private readonly nouvelId: () => string,
    private readonly horloge: Horloge,
  ) {}

  /** Ses événements avec leurs ventes : la liste vient de la base protégée par la RLS. */
  async lister(o: Organisateur): Promise<(Evenement & { ventes: ResumeVentes })[]> {
    const evenements = await this.depot.lister(o);
    // Seuls les identifiants de ses propres événements sont demandés à la Réservation (S-3).
    const ventes = await this.ventes.parEvenement(evenements.map((e) => e.id));
    return evenements.map((e) => ({ ...e, ventes: ventes.get(e.id) ?? AUCUNE_VENTE }));
  }

  async consulter(o: Organisateur, evenementId: string): Promise<Evenement> {
    const evenement = await this.depot.trouver(o, evenementId);
    if (!evenement) throw new EvenementIntrouvable();
    return evenement;
  }

  async creer(o: Organisateur, demande: DemandeCreation): Promise<Evenement> {
    this.verifierDroits(o);
    const salle = await this.depot.salle(demande.salleId);
    if (!salle) throw new RegleNonRespectee("Salle inconnue");
    const evenement = creerBrouillon(
      this.nouvelId(),
      o.organisationId,
      {
        titre: demande.titre,
        artiste: demande.artiste,
        genre: demande.genre,
        debutLe: demande.debutLe,
        tarifs: demande.tarifs,
        salle,
      },
      this.nouvelId,
      this.horloge(),
    );
    await this.depot.creer(o, evenement);
    return evenement;
  }

  async modifier(
    o: Organisateur,
    evenementId: string,
    m: ModificationInformations,
  ): Promise<Evenement> {
    this.verifierDroits(o);
    return this.depot.appliquer(o, evenementId, "modification", (e) =>
      modifierInformations(e, m, this.horloge()),
    );
  }

  async changerPrix(
    o: Organisateur,
    evenementId: string,
    tarifId: string,
    prix: number,
  ): Promise<Evenement> {
    this.verifierDroits(o);
    return this.depot.appliquer(o, evenementId, "changement_de_prix", (e) =>
      changerPrix(e, tarifId, prix),
    );
  }

  async publier(o: Organisateur, evenementId: string): Promise<Evenement> {
    this.verifierDroits(o);
    return this.depot.appliquer(o, evenementId, "publication", (e) => publier(e, this.horloge()));
  }

  journal(o: Organisateur): Promise<LigneAudit[]> {
    return this.depot.journal(o, 100);
  }

  salles() {
    return this.depot.salles();
  }

  private verifierDroits(o: Organisateur): void {
    if (!peutModifier(o)) throw new ActionInterdite();
  }
}
