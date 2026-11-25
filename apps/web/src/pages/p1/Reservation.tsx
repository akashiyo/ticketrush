import { Link, useParams } from "react-router";

import { lireJetonAcces } from "../../commun/passage-reservation";

/**
 * PAGE DE P1 — à remplacer par la vraie réservation (plan de salle, blocage d'une place,
 * paiement, billet).
 *
 * Ce point de départ montre seulement le contrat de passage avec la salle d'attente :
 * le jeton d'accès se lit avec lireJetonAcces(evenementId), puis s'envoie au Cœur avec
 * la demande de réservation. Le Cœur le vérifie avec la clé publique de la File (ADR 011).
 */
export function Reservation() {
  const { evenementId = "" } = useParams();
  const jeton = lireJetonAcces(evenementId);

  if (!jeton) {
    return (
      <section aria-labelledby="titre-reservation">
        <h1 id="titre-reservation">Réservation</h1>
        <p role="alert">
          Aucun accès valide à cette vente : passez d'abord par la salle d'attente.
        </p>
        <Link to={`/vente/${encodeURIComponent(evenementId)}`}>Rejoindre la salle d'attente</Link>
      </section>
    );
  }

  return (
    <section aria-labelledby="titre-reservation">
      <h1 id="titre-reservation">Réservation</h1>
      <p role="status">
        Vous êtes admis. Votre accès est valable jusqu'à{" "}
        <strong>{new Date(jeton.expireLe).toLocaleTimeString("fr-FR")}</strong>.
      </p>
      <p className="remarque">Page de réservation en construction (piste P1).</p>
    </section>
  );
}
