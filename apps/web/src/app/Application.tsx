import { createBrowserRouter, Link, Outlet, RouterProvider } from "react-router";

import { useAuth } from "../auth/auth";
import { Catalogue } from "../pages/p1/Catalogue";
import { FicheEvenement } from "../pages/p1/FicheEvenement";
import { Reservation } from "../pages/p1/Reservation";
import { Accueil } from "../pages/p2/Accueil";
import { ConnexionRetour } from "../pages/p2/ConnexionRetour";
import { SalleAttente } from "../pages/p2/SalleAttente";

/**
 * Routes de l'application. Chaque page vit dans le dossier de sa piste :
 * pages/p1 (catalogue, réservation, organisateurs) et pages/p2 (connexion, file d'attente).
 */
export const routes = [
  {
    element: <Gabarit />,
    children: [
      { path: "/", element: <Catalogue /> },
      { path: "/evenements/:evenementId", element: <FicheEvenement /> },
      // Accès direct à une vente par son identifiant (développement, démonstration).
      { path: "/acces", element: <Accueil /> },
      { path: "/connexion/retour", element: <ConnexionRetour /> },
      { path: "/vente/:evenementId", element: <SalleAttente /> },
      { path: "/vente/:evenementId/reservation", element: <Reservation /> },
      { path: "*", element: <p role="alert">Page introuvable.</p> },
    ],
  },
];

const routeur = createBrowserRouter(routes);

export function Application() {
  return <RouterProvider router={routeur} />;
}

function Gabarit() {
  const { utilisateur, seConnecter, seDeconnecter } = useAuth();
  return (
    <>
      <header className="entete">
        <Link to="/" className="marque">
          TicketRush
        </Link>
        {utilisateur ? (
          <span>
            {utilisateur.profile.given_name ?? utilisateur.profile.preferred_username}{" "}
            <button type="button" onClick={() => void seDeconnecter()}>
              Se déconnecter
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => void seConnecter(window.location.pathname)}>
            Se connecter
          </button>
        )}
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
