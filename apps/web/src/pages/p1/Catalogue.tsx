import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { apiCatalogue, type CriteresRecherche } from "./api-catalogue";
import styles from "./Catalogue.module.css";

export const euros = (centimes: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(centimes / 100);

export const dateLongue = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/**
 * Catalogue (P1) : recherche par artiste, titre, salle ou ville, avec filtres ville et dates.
 * Servie par le modèle de lecture (Meilisearch, ADR 014). Les critères sont dans l'adresse : une
 * recherche se partage et survit au rechargement.
 */
export function Catalogue() {
  const [parametres, setParametres] = useSearchParams();
  const criteres: CriteresRecherche = {
    q: parametres.get("q") ?? "",
    ville: parametres.get("ville") ?? undefined,
    du: parametres.get("du") ?? undefined,
    au: parametres.get("au") ?? undefined,
  };
  const [saisie, setSaisie] = useState(criteres);

  const resultat = useQuery({
    queryKey: ["catalogue", criteres],
    queryFn: () => apiCatalogue.rechercher(criteres),
    placeholderData: keepPreviousData,
  });

  const rechercher = (e: FormEvent) => {
    e.preventDefault();
    const nouveaux = new URLSearchParams();
    for (const [cle, valeur] of Object.entries(saisie)) {
      if (valeur) nouveaux.set(cle, valeur);
    }
    setParametres(nouveaux);
  };

  return (
    <section aria-labelledby="titre-catalogue">
      <h1 id="titre-catalogue">Concerts et événements</h1>
      <form role="search" onSubmit={rechercher} className={styles.recherche}>
        <label htmlFor="q">Artiste, événement, salle</label>
        <input
          id="q"
          type="search"
          value={saisie.q}
          onChange={(e) => setSaisie({ ...saisie, q: e.target.value })}
          placeholder="par exemple : électrons"
        />
        <div className={styles.filtres}>
          <span>
            <label htmlFor="ville">Ville</label>
            <input
              id="ville"
              value={saisie.ville ?? ""}
              onChange={(e) => setSaisie({ ...saisie, ville: e.target.value })}
            />
          </span>
          <span>
            <label htmlFor="du">Du</label>
            <input
              id="du"
              type="date"
              value={saisie.du ?? ""}
              onChange={(e) => setSaisie({ ...saisie, du: e.target.value })}
            />
          </span>
          <span>
            <label htmlFor="au">Au</label>
            <input
              id="au"
              type="date"
              value={saisie.au ?? ""}
              onChange={(e) => setSaisie({ ...saisie, au: e.target.value })}
            />
          </span>
        </div>
        <button type="submit">Rechercher</button>
      </form>

      {resultat.isPending && <p role="status">Recherche…</p>}
      {resultat.isError && (
        <p role="alert">La recherche est momentanément indisponible. Réessayez dans un instant.</p>
      )}
      {resultat.data && (
        <>
          <p role="status" className="remarque">
            {resultat.data.total === 0
              ? "Aucun événement ne correspond à votre recherche."
              : `${resultat.data.total} événement${resultat.data.total > 1 ? "s" : ""}`}
          </p>
          <ul className={styles.resultats}>
            {resultat.data.evenements.map((e) => (
              <li key={e.id}>
                <Link to={`/evenements/${encodeURIComponent(e.id)}`}>
                  <strong>{e.titre}</strong>
                </Link>
                <span>
                  {e.salle}, {e.ville} — {dateLongue(e.debutLe)}
                </span>
                <span className="remarque">À partir de {euros(e.prixMinCentimes)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
