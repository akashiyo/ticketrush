import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { useAuth } from "../../auth/auth";

/** Retour de Keycloak : échange le code contre les jetons (PKCE), puis revient à la page d'origine. */
export function ConnexionRetour() {
  const { terminerConnexion } = useAuth();
  const navigate = useNavigate();
  const [erreur, setErreur] = useState<string | null>(null);
  const dejaLance = useRef(false);

  useEffect(() => {
    if (dejaLance.current) return; // le code ne s'échange qu'une fois
    dejaLance.current = true;
    terminerConnexion()
      .then((retour) => navigate(retour, { replace: true }))
      .catch((e: Error) => setErreur(e.message));
  }, [terminerConnexion, navigate]);

  return erreur ? (
    <p role="alert">Connexion impossible : {erreur}</p>
  ) : (
    <p role="status">Connexion en cours…</p>
  );
}
