import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";

import { ErreurApi } from "../../commun/api-file";
import { apiCatalogue } from "./api-catalogue";
import { dateLongue, euros } from "./Catalogue";
import styles from "./Catalogue.module.css";

/** Fiche d'un événement (P1) : salle, date, catégories et prix, puis accès à la vente (P2). */
export function FicheEvenement() {
  const { evenementId = "" } = useParams();
  const fiche = useQuery({
    queryKey: ["fiche", evenementId],
    queryFn: () => apiCatalogue.fiche(evenementId),
    retry: (nombre, erreur) =>
      !(erreur instanceof ErreurApi && erreur.statut === 404) && nombre < 2,
  });

  if (fiche.isPending) return <p role="status">Chargement…</p>;
  if (fiche.isError) {
    const inconnu = fiche.error instanceof ErreurApi && fiche.error.statut === 404;
    return (
      <section aria-labelledby="titre-fiche">
        <h1 id="titre-fiche">Événement</h1>
        <p role="alert">
          {inconnu
            ? "Cet événement n'existe pas ou n'est plus en vente."
            : "Fiche momentanément indisponible."}
        </p>
        <Link to="/">Retour au catalogue</Link>
      </section>
    );
  }

  const e = fiche.data;
  return (
    <section aria-labelledby="titre-fiche">
      <h1 id="titre-fiche">{e.titre}</h1>
      {e.artiste && <p>{e.artiste}</p>}
      <p>
        {e.salle.nom}, {e.salle.ville} — {dateLongue(e.debutLe)}
      </p>
      <h2>Tarifs</h2>
      <ul className={styles.categories}>
        {e.categories.map((c) => (
          <li key={c.categorieId}>
            {c.libelle} ({c.placement === "libre" ? "placement libre" : "places numérotées"}) :{" "}
            {euros(c.prixCentimes)}
          </li>
        ))}
      </ul>
      <Link to={`/vente/${encodeURIComponent(e.evenementId)}`}>Rejoindre la vente</Link>
      <p className="remarque">
        La vente passe par une file d'attente : chaque acheteur y entre une seule fois, et l'ordre
        de ceux arrivés avant l'ouverture est tiré au sort.
      </p>
    </section>
  );
}
