/**
 * Plan de salle tel que l'acheteur le voit pour choisir sa place.
 *
 * C'est une **lecture indicative** : une place affichée libre peut être prise une seconde plus
 * tard. La seule décision qui compte reste le blocage atomique (ADR 003) ; s'il échoue, l'acheteur
 * reçoit « place déjà prise » et le plan se rafraîchit.
 */
export interface PlaceAffichee {
  siegeId: string;
  numero: string;
  disponible: boolean;
}

export interface CategorieAffichee {
  categorieId: string;
  libelle: string;
  placement: "numerote" | "libre";
  prixCentimes: number;
  disponibles: number;
  /** Les sièges, pour une catégorie numérotée ; vide en placement libre. */
  places: PlaceAffichee[];
}

export interface PlanDeSalle {
  evenementId: string;
  categories: CategorieAffichee[];
}
