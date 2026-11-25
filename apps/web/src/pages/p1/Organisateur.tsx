import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useLocation } from "react-router";

import { useAuth } from "../../auth/auth";
import { ErreurApi } from "../../commun/api-file";
import {
  type EvenementOrganisateur,
  type NouvelEvenement,
  useApiOrganisateur,
} from "./api-organisateur";
import { dateLongue, euros } from "./Catalogue";
import styles from "./Catalogue.module.css";

function messageErreur(erreur: Error): string {
  if (erreur instanceof ErreurApi && erreur.statut === 403) {
    return "Votre rôle ne permet pas cette action (lecture seule), ou votre compte n'est rattaché à aucune organisation.";
  }
  if (erreur instanceof ErreurApi && erreur.statut === 422) return erreur.message;
  return "L'action n'a pas abouti. Réessayez dans un instant.";
}

/**
 * Dashboard de gestion d'un organisateur (module Organisateurs, ADR 016) : ses événements et leurs
 * ventes, la création et la publication, les prix, le journal d'audit. Le Cœur ne renvoie que les
 * données de son organisation, lue dans son jeton (Row-Level Security).
 */
export function Organisateur() {
  const { utilisateur, chargement, seConnecter } = useAuth();
  const location = useLocation();
  useEffect(() => {
    if (!chargement && !utilisateur) void seConnecter(location.pathname);
  }, [chargement, utilisateur, seConnecter, location.pathname]);

  return (
    <section aria-labelledby="titre-organisateur">
      <h1 id="titre-organisateur">Espace organisateur</h1>
      {utilisateur ? <Tableau /> : <p role="status">Connexion à votre compte…</p>}
    </section>
  );
}

function Tableau() {
  const api = useApiOrganisateur();
  const client = useQueryClient();
  const evenements = useQuery({
    queryKey: ["organisateur", "evenements"],
    queryFn: api.evenements,
  });
  const journal = useQuery({ queryKey: ["organisateur", "journal"], queryFn: api.journal });
  const rafraichir = () => client.invalidateQueries({ queryKey: ["organisateur"] });

  const publication = useMutation({ mutationFn: api.publier, onSuccess: rafraichir });
  const prix = useMutation({
    mutationFn: (p: { id: string; tarifId: string; prixCentimes: number }) =>
      api.changerPrix(p.id, p.tarifId, p.prixCentimes),
    onSuccess: rafraichir,
  });
  const erreur = publication.error ?? prix.error;

  if (evenements.isPending) return <p role="status">Chargement de vos événements…</p>;
  if (evenements.isError) return <p role="alert">{messageErreur(evenements.error)}</p>;

  return (
    <>
      {erreur && <p role="alert">{messageErreur(erreur)}</p>}
      <h2>Vos événements</h2>
      {evenements.data.length === 0 && <p>Aucun événement pour le moment.</p>}
      <ul className={styles.resultats}>
        {evenements.data.map((e) => (
          <LigneEvenement
            key={e.id}
            evenement={e}
            surPublication={() => publication.mutate(e.id)}
            surPrix={(tarifId, prixCentimes) => prix.mutate({ id: e.id, tarifId, prixCentimes })}
          />
        ))}
      </ul>
      <NouvelEvenementFormulaire surCreation={rafraichir} />
      <h2>Journal d'audit</h2>
      {journal.data && (
        <ul>
          {journal.data.slice(0, 20).map((l, i) => (
            <li key={i} className="remarque">
              {new Date(l.le).toLocaleString("fr-FR")} — {l.utilisateurId} : {l.action}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function LigneEvenement({
  evenement: e,
  surPublication,
  surPrix,
}: {
  evenement: EvenementOrganisateur;
  surPublication: () => void;
  surPrix: (tarifId: string, prixCentimes: number) => void;
}) {
  return (
    <li>
      <strong>
        {e.titre} {e.statut === "brouillon" ? "(brouillon)" : "(publié)"}
      </strong>
      <span>
        {e.salle.nom}, {e.salle.ville} — {dateLongue(e.debutLe)}
      </span>
      {e.ventes && (
        <span>
          Ventes : {e.ventes.vendues} / {e.ventes.places} places, {e.ventes.bloquees} en cours de
          paiement, recette {euros(e.ventes.recetteCentimes)}
        </span>
      )}
      <ul className={styles.categories}>
        {e.tarifs.map((t) => (
          <li key={t.id}>
            {t.libelle} ({t.capacite} places) : {euros(t.prixCentimes)}{" "}
            <button
              type="button"
              onClick={() => {
                const saisie = window.prompt(`Nouveau prix de « ${t.libelle} » en euros`);
                if (saisie) surPrix(t.id, Math.round(Number(saisie.replace(",", ".")) * 100));
              }}
            >
              Changer le prix
            </button>
          </li>
        ))}
      </ul>
      {e.statut === "brouillon" && (
        <button type="button" onClick={surPublication}>
          Publier « {e.titre} »
        </button>
      )}
    </li>
  );
}

function NouvelEvenementFormulaire({ surCreation }: { surCreation: () => void }) {
  const api = useApiOrganisateur();
  const salles = useQuery({ queryKey: ["organisateur", "salles"], queryFn: api.salles });
  const [titre, setTitre] = useState("");
  const [salleId, setSalleId] = useState("");
  const [date, setDate] = useState("");
  const [capacite, setCapacite] = useState("100");
  const [prix, setPrix] = useState("30");
  const creation = useMutation({
    mutationFn: (e: NouvelEvenement) => api.creer(e),
    onSuccess: () => {
      setTitre("");
      surCreation();
    },
  });

  const creer = (e: FormEvent) => {
    e.preventDefault();
    creation.mutate({
      titre,
      artiste: null,
      salleId: salleId || salles.data?.[0]?.id || "",
      debutLe: new Date(date).toISOString(),
      tarifs: [
        {
          libelle: "Placement libre",
          placement: "libre",
          capacite: Number(capacite),
          prixCentimes: Math.round(Number(prix.replace(",", ".")) * 100),
        },
      ],
    });
  };

  return (
    <form onSubmit={creer} aria-labelledby="titre-nouvel-evenement">
      <h2 id="titre-nouvel-evenement">Nouvel événement (brouillon)</h2>
      {creation.isError && <p role="alert">{messageErreur(creation.error)}</p>}
      <label htmlFor="nouveau-titre">Titre</label>
      <input id="nouveau-titre" value={titre} onChange={(e) => setTitre(e.target.value)} required />
      <label htmlFor="nouvelle-salle">Salle</label>
      <select id="nouvelle-salle" value={salleId} onChange={(e) => setSalleId(e.target.value)}>
        {salles.data?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nom} ({s.ville})
          </option>
        ))}
      </select>
      <label htmlFor="nouvelle-date">Date et heure</label>
      <input
        id="nouvelle-date"
        type="datetime-local"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
      />
      <label htmlFor="nouvelle-capacite">Places (placement libre)</label>
      <input
        id="nouvelle-capacite"
        type="number"
        min={1}
        value={capacite}
        onChange={(e) => setCapacite(e.target.value)}
      />
      <label htmlFor="nouveau-prix">Prix (€)</label>
      <input id="nouveau-prix" value={prix} onChange={(e) => setPrix(e.target.value)} />
      <button type="submit" disabled={creation.isPending}>
        Créer le brouillon
      </button>
    </form>
  );
}
