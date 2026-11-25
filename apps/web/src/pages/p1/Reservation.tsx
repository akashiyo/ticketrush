import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router";

import { useAuth } from "../../auth/auth";
import { ErreurApi } from "../../commun/api-file";
import { type JetonAcces, lireJetonAcces } from "../../commun/passage-reservation";
import {
  type Billet,
  type Blocage,
  type CategorieAffichee,
  type DemandeBlocage,
  type PlaceAffichee,
  useApiReservation,
} from "./api-reservation";
import styles from "./Reservation.module.css";

const euros = (centimes: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(centimes / 100);

const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR");

/**
 * Page de réservation (P1) : l'acheteur admis par la File choisit sa place, la paie et reçoit
 * son billet. Le Cœur décide (blocage atomique, ADR 003) ; la page n'affiche qu'un plan indicatif.
 *
 * 1. Choix : une place en fosse, ou un siège numéroté sur le plan.
 * 2. Paiement : la place est bloquée 10 minutes, un compte à rebours l'indique.
 * 3. Billet.
 */
export function Reservation() {
  const { evenementId = "" } = useParams();
  const { utilisateur, chargement, seConnecter } = useAuth();
  const location = useLocation();
  const jeton = lireJetonAcces(evenementId);

  useEffect(() => {
    if (jeton && !chargement && !utilisateur) void seConnecter(location.pathname);
  }, [jeton, chargement, utilisateur, seConnecter, location.pathname]);

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
        Vous êtes admis. Votre accès est valable jusqu'à <strong>{heure(jeton.expireLe)}</strong>.
      </p>
      {utilisateur ? (
        <Parcours evenementId={evenementId} jeton={jeton} />
      ) : (
        <p>Connexion à votre compte…</p>
      )}
    </section>
  );
}

type Etape =
  { type: "choix" } | { type: "paiement"; blocage: Blocage } | { type: "billet"; billet: Billet };

function Parcours({ evenementId, jeton }: { evenementId: string; jeton: JetonAcces }) {
  const [etape, setEtape] = useState<Etape>({ type: "choix" });

  if (etape.type === "choix") {
    return (
      <ChoixPlace
        evenementId={evenementId}
        jeton={jeton}
        surBlocage={(blocage) => setEtape({ type: "paiement", blocage })}
      />
    );
  }
  if (etape.type === "paiement") {
    return (
      <Paiement
        evenementId={evenementId}
        blocage={etape.blocage}
        surBillet={(billet) => setEtape({ type: "billet", billet })}
        surExpiration={() => setEtape({ type: "choix" })}
      />
    );
  }
  return <BilletEmis billet={etape.billet} />;
}

function ChoixPlace({
  evenementId,
  jeton,
  surBlocage,
}: {
  evenementId: string;
  jeton: JetonAcces;
  surBlocage: (blocage: Blocage) => void;
}) {
  const api = useApiReservation();
  const plan = useQuery({
    queryKey: ["plan", evenementId],
    queryFn: () => api.lirePlan(evenementId),
    // Plan indicatif : le Cœur le garde 2 s en cache ; un rafraîchissement toutes les 5 s suffit.
    refetchInterval: 5_000,
  });
  const blocage = useMutation({
    mutationFn: (demande: DemandeBlocage) => api.bloquer(evenementId, jeton.jetonAcces, demande),
    onSuccess: surBlocage,
    // La place a été prise entre l'affichage et le clic : on rafraîchit le plan.
    onError: () => void plan.refetch(),
  });

  if (plan.isPending) return <p role="status">Chargement du plan de salle…</p>;
  if (plan.isError) {
    return (
      <p role="alert">
        Le plan de salle est momentanément indisponible.{" "}
        <button type="button" onClick={() => void plan.refetch()}>
          Réessayer
        </button>
      </p>
    );
  }

  return (
    <>
      {blocage.isError && <p role="alert">{messageBlocage(blocage.error, evenementId)}</p>}
      {plan.data.categories.map((categorie) => (
        <div key={categorie.categorieId} className={styles.categorie}>
          <h2>
            {categorie.libelle} — {euros(categorie.prixCentimes)}
          </h2>
          <p className="remarque">
            {categorie.disponibles > 0
              ? `Environ ${categorie.disponibles.toLocaleString("fr-FR")} places disponibles`
              : "Complet"}
          </p>
          {categorie.placement === "libre" ? (
            <button
              type="button"
              disabled={blocage.isPending || categorie.disponibles === 0}
              onClick={() => blocage.mutate({ categorieId: categorie.categorieId })}
            >
              Prendre une place en {categorie.libelle.toLowerCase()}
            </button>
          ) : (
            <PlanNumerote
              categorie={categorie}
              desactive={blocage.isPending}
              surChoix={(siegeId) => blocage.mutate({ siegeId })}
            />
          )}
        </div>
      ))}
    </>
  );
}

function messageBlocage(erreur: Error, evenementId: string) {
  if (erreur instanceof ErreurApi && erreur.statut === 409) {
    return "Cette place vient d'être prise par un autre acheteur. Choisissez-en une autre.";
  }
  if (erreur instanceof ErreurApi && erreur.statut === 403) {
    return (
      <>
        Votre accès à la vente n'est plus valable.{" "}
        <Link to={`/vente/${encodeURIComponent(evenementId)}`}>Retourner dans la file</Link>
      </>
    );
  }
  return "La réservation n'a pas abouti. Réessayez dans un instant.";
}

/** Sièges regroupés par rang (« A-12 » : rang A, siège 12), dans l'ordre des numéros. */
export function parRang(places: PlaceAffichee[]): [string, PlaceAffichee[]][] {
  const rangs = new Map<string, PlaceAffichee[]>();
  for (const place of places) {
    const rang = place.numero.split("-")[0] ?? "";
    rangs.set(rang, [...(rangs.get(rang) ?? []), place]);
  }
  const numero = (p: PlaceAffichee) => Number(p.numero.split("-")[1] ?? 0);
  return [...rangs]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rang, liste]) => [rang, liste.sort((a, b) => numero(a) - numero(b))]);
}

function PlanNumerote({
  categorie,
  desactive,
  surChoix,
}: {
  categorie: CategorieAffichee;
  desactive: boolean;
  surChoix: (siegeId: string) => void;
}) {
  return (
    <div className={styles.sieges} role="group" aria-label={`Plan : ${categorie.libelle}`}>
      {parRang(categorie.places).map(([rang, places]) => (
        <div key={rang} className={styles.rang}>
          <span className={styles.nomRang} aria-hidden="true">
            {rang}
          </span>
          {places.map((place) => (
            <button
              key={place.siegeId}
              type="button"
              className={styles.siege}
              disabled={desactive || !place.disponible}
              aria-label={`Siège ${place.numero}${place.disponible ? "" : " (pris)"}`}
              title={place.numero}
              onClick={() => surChoix(place.siegeId)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const secondesAvant = (iso: string) =>
  Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));

function useSecondesRestantes(jusqua: string): number {
  const [restantes, setRestantes] = useState(() => secondesAvant(jusqua));
  useEffect(() => {
    const minuterie = setInterval(() => setRestantes(secondesAvant(jusqua)), 1_000);
    return () => clearInterval(minuterie);
  }, [jusqua]);
  return restantes;
}

export const minutesSecondes = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

function Paiement({
  evenementId,
  blocage,
  surBillet,
  surExpiration,
}: {
  evenementId: string;
  blocage: Blocage;
  surBillet: (billet: Billet) => void;
  surExpiration: () => void;
}) {
  const api = useApiReservation();
  const restantes = useSecondesRestantes(blocage.bloqueJusqua);
  const [carte, setCarte] = useState("carte-acceptee");
  // Une clé par intention de payer : rejouée telle quelle si le prestataire ne répond pas (503),
  // renouvelée après un refus (nouvelle intention, éventuellement avec une autre carte).
  const cle = useRef(crypto.randomUUID());
  const paiement = useMutation({
    mutationFn: () => api.payer(blocage.reservationId, cle.current, carte),
    onSuccess: surBillet,
    onError: (erreur) => {
      if (erreur instanceof ErreurApi && erreur.statut === 402) cle.current = crypto.randomUUID();
    },
  });

  if (restantes === 0 && !paiement.isPending) {
    return (
      <p role="alert">
        Le délai de paiement est écoulé : la place a été remise en vente.{" "}
        <button type="button" onClick={surExpiration}>
          Choisir une autre place
        </button>
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        paiement.mutate();
      }}
    >
      <h2>Paiement</h2>
      <p>
        Votre place est bloquée pour vous. Temps restant pour payer :{" "}
        <span className={styles.compteur} role="timer">
          {minutesSecondes(restantes)}
        </span>
      </p>
      <label htmlFor="carte">Carte (simulation)</label>
      <select id="carte" value={carte} onChange={(e) => setCarte(e.target.value)}>
        <option value="carte-acceptee">Carte de test acceptée</option>
        <option value="carte-refusee">Carte de test refusée</option>
      </select>
      {paiement.isError && <p role="alert">{messagePaiement(paiement.error, evenementId)}</p>}
      <button type="submit" disabled={paiement.isPending}>
        {paiement.isPending ? "Paiement en cours…" : "Payer"}
      </button>
    </form>
  );
}

function messagePaiement(erreur: Error, evenementId: string) {
  if (!(erreur instanceof ErreurApi)) {
    return "Connexion perdue. Réessayez : vous ne serez débité qu'une fois.";
  }
  switch (erreur.statut) {
    case 402:
      return "Paiement refusé par votre banque. Essayez une autre carte : votre place reste bloquée.";
    case 503:
      return "Le paiement est momentanément indisponible. Réessayez : votre place reste bloquée.";
    case 409:
      return (
        <>
          {erreur.message}.{" "}
          <Link to={`/vente/${encodeURIComponent(evenementId)}`}>Retourner à la vente</Link>
        </>
      );
    default:
      return "Le paiement n'a pas abouti. Réessayez dans un instant.";
  }
}

function BilletEmis({ billet }: { billet: Billet }) {
  return (
    <div className={styles.billet} role="status">
      <h2>Votre billet</h2>
      <p>Paiement accepté : {euros(billet.prixCentimes)}.</p>
      <p>
        Billet n° <strong>{billet.billetId}</strong>, émis à {heure(billet.emisLe)}.
      </p>
    </div>
  );
}
