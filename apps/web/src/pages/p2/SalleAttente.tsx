import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router";

import { useAuth } from "../../auth/auth";
import { useApiFile } from "../../commun/api-contexte";
import { ErreurApi, type EtatFile } from "../../commun/api-file";
import { cheminReservation, rangerJetonAcces } from "../../commun/passage-reservation";
import { resoudreDefi } from "../../commun/preuve-de-travail";

/**
 * Salle d'attente d'une mise en vente (P2, ADR 008, 009, 012) :
 * 1. connexion obligatoire (compte acheteur) ;
 * 2. entrée dans la file avec une preuve de travail anti-robots, faite automatiquement ;
 * 3. suivi de la position, au rythme indiqué par le serveur ;
 * 4. une fois admis, passage à la réservation (P1) avec le jeton d'accès.
 */
export function SalleAttente() {
  const { evenementId = "" } = useParams();
  const { utilisateur, chargement, seConnecter } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!chargement && !utilisateur) void seConnecter(location.pathname);
  }, [chargement, utilisateur, seConnecter, location.pathname]);

  if (!utilisateur) {
    return <p role="status">Connexion à votre compte…</p>;
  }
  return <SuiviFile evenementId={evenementId} />;
}

function SuiviFile({ evenementId }: { evenementId: string }) {
  const api = useApiFile();
  const navigate = useNavigate();

  const etat = useQuery({
    queryKey: ["file", evenementId],
    queryFn: () => api.consulter(evenementId),
    // Le serveur indique quand rappeler : souvent près de l'admission, rarement loin (ADR 009).
    refetchInterval: (requete) => {
      const donnees = requete.state.data;
      return donnees?.statut === "en_attente" ? donnees.prochainAppelDansSec * 1000 : false;
    },
    retry: (nombre, erreur) => !(erreur instanceof ErreurApi && erreur.statut < 500) && nombre < 3,
  });

  const entree = useMutation({
    mutationFn: async () => {
      const preuve = await resoudreDefi(await api.obtenirDefi(evenementId));
      return api.entrer(evenementId, preuve);
    },
    onSuccess: () => void etat.refetch(),
  });

  // Pas encore dans la file : on entre automatiquement, une seule fois (chaque entrée
  // coûte une preuve de travail ; le drapeau évite un second envoi si l'effet est rejoué).
  const absent = etat.data?.statut === "absent";
  const entreeLancee = useRef(false);
  useEffect(() => {
    if (absent && entree.isIdle && !entreeLancee.current) {
      entreeLancee.current = true;
      entree.mutate();
    }
  }, [absent, entree]);

  // Admis : on range le jeton et on passe à la réservation.
  const admission = etatAdmis(etat.data) ?? etatAdmis(entree.data);
  useEffect(() => {
    if (!admission) return;
    rangerJetonAcces(evenementId, admission);
    void navigate(cheminReservation(evenementId), { replace: true });
  }, [admission, evenementId, navigate]);

  const erreur = etat.error ?? entree.error;
  if (erreur) {
    return (
      <section aria-labelledby="titre-attente">
        <h1 id="titre-attente">Salle d'attente</h1>
        <p role="alert">{messageErreur(erreur)}</p>
        <button
          type="button"
          onClick={() => {
            entreeLancee.current = false;
            entree.reset();
            void etat.refetch();
          }}
        >
          Réessayer
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby="titre-attente">
      <h1 id="titre-attente">Salle d'attente</h1>
      <EtatAttente etat={etat.data} enCoursEntree={entree.isPending || absent} />
      <p className="remarque">
        Gardez cette page ouverte : votre place est conservée, et vous serez redirigé
        automatiquement vers la réservation dès votre tour.
      </p>
    </section>
  );
}

function EtatAttente({ etat, enCoursEntree }: { etat?: EtatFile; enCoursEntree: boolean }) {
  if (!etat || enCoursEntree) {
    return <p role="status">Vérification anti-robot et entrée dans la file…</p>;
  }
  if (etat.statut === "admis") {
    return <p role="status">C'est votre tour ! Redirection vers la réservation…</p>;
  }
  if (etat.statut !== "en_attente") return null;

  const ouverture = new Date(etat.ouvertureLe);
  const avantOuverture = ouverture > new Date();
  return (
    <div role="status" aria-live="polite">
      {avantOuverture && (
        <p>
          La vente ouvre à <strong>{ouverture.toLocaleTimeString("fr-FR")}</strong>. L'ordre de
          passage des personnes arrivées avant l'ouverture est tiré au sort.
        </p>
      )}
      <p className="position">
        Votre position : <strong>{etat.position.toLocaleString("fr-FR")}</strong>
      </p>
      {!avantOuverture && <p>Temps d'attente estimé : {formaterDuree(etat.attenteEstimeeSec)}</p>}
    </div>
  );
}

function etatAdmis(etat?: EtatFile) {
  return etat?.statut === "admis" ? etat : null;
}

export function formaterDuree(secondes: number): string {
  if (secondes < 60) return "moins d'une minute";
  const minutes = Math.round(secondes / 60);
  if (minutes < 60) return `environ ${minutes} min`;
  return `environ ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

function messageErreur(erreur: Error): string {
  if (!(erreur instanceof ErreurApi)) return erreur.message;
  switch (erreur.statut) {
    case 404:
      return "Cette vente n'existe pas ou n'est pas encore ouverte à la file d'attente.";
    case 403:
      return "Accès refusé : un compte acheteur est nécessaire, ou la vérification anti-robot a échoué.";
    case 429:
      return "Trop de demandes depuis votre connexion. Patientez quelques secondes puis réessayez.";
    case 401:
      return "Votre session a expiré. Reconnectez-vous.";
    default:
      return "La file d'attente ne répond pas pour le moment. Réessayez dans un instant.";
  }
}
