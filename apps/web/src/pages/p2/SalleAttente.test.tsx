import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "oidc-client-ts";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Contexte, type ContexteAuth } from "../../auth/auth";
import { FournisseurApi } from "../../commun/api-contexte";
import { type ApiFile, ErreurApi, type EtatFile } from "../../commun/api-file";
import { lireJetonAcces } from "../../commun/passage-reservation";
import { Reservation } from "../p1/Reservation";
import { formaterDuree, SalleAttente } from "./SalleAttente";

vi.mock("../../commun/preuve-de-travail", () => ({
  resoudreDefi: vi.fn(async () => "preuve-de-test"),
}));

const auth = (connecte: boolean): ContexteAuth => ({
  utilisateur: connecte ? ({ access_token: "jeton", profile: {} } as unknown as User) : null,
  chargement: false,
  seConnecter: vi.fn(async () => {}),
  seDeconnecter: vi.fn(async () => {}),
  terminerConnexion: vi.fn(async () => "/"),
});

const enAttente = (position: number): EtatFile => ({
  statut: "en_attente",
  position,
  attenteEstimeeSec: 90,
  prochainAppelDansSec: 30,
  ouvertureLe: new Date(Date.now() - 60_000).toISOString(),
});

function afficher(api: Partial<ApiFile>, connecte = true) {
  const valeurAuth = auth(connecte);
  const routeur = createMemoryRouter(
    [
      { path: "/vente/:evenementId", element: <SalleAttente /> },
      { path: "/vente/:evenementId/reservation", element: <Reservation /> },
    ],
    { initialEntries: ["/vente/concert-1"] },
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Contexte.Provider value={valeurAuth}>
        <FournisseurApi api={api as ApiFile}>
          <RouterProvider router={routeur} />
        </FournisseurApi>
      </Contexte.Provider>
    </QueryClientProvider>,
  );
  return { valeurAuth, routeur };
}

beforeEach(() => sessionStorage.clear());

describe("Salle d'attente", () => {
  it("redirige vers la connexion Keycloak si l'acheteur n'est pas connecté", async () => {
    const { valeurAuth } = afficher({}, false);
    await waitFor(() => expect(valeurAuth.seConnecter).toHaveBeenCalledWith("/vente/concert-1"));
  });

  it("entre automatiquement dans la file avec une preuve de travail, une seule fois", async () => {
    const consulter = vi
      .fn<ApiFile["consulter"]>()
      .mockResolvedValueOnce({ statut: "absent" })
      .mockResolvedValue(enAttente(12));
    const entrer = vi.fn<ApiFile["entrer"]>().mockResolvedValue(enAttente(12));
    afficher({ consulter, entrer, obtenirDefi: vi.fn(async () => ({})) });

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(entrer).toHaveBeenCalledTimes(1);
    expect(entrer).toHaveBeenCalledWith("concert-1", "preuve-de-test");
  });

  it("affiche la position et le temps d'attente estimé", async () => {
    afficher({ consulter: vi.fn(async () => enAttente(18_342)) });
    expect(await screen.findByText(/18\s342/)).toBeInTheDocument();
    expect(screen.getByText(/Temps d'attente estimé : environ 2 min/)).toBeInTheDocument();
  });

  it("annonce l'ouverture et le tirage au sort avant l'ouverture", async () => {
    const avant = { ...enAttente(3), ouvertureLe: new Date(Date.now() + 3_600_000).toISOString() };
    afficher({ consulter: vi.fn(async () => avant) });
    expect(await screen.findByText(/La vente ouvre à/)).toBeInTheDocument();
    expect(screen.getByText(/tiré au sort/)).toBeInTheDocument();
  });

  it("une fois admis, range le jeton d'accès et passe à la réservation", async () => {
    const admis: EtatFile = {
      statut: "admis",
      jetonAcces: "jeton-signe",
      expireLe: new Date(Date.now() + 600_000).toISOString(),
    };
    const { routeur } = afficher({ consulter: vi.fn(async () => admis) });

    await waitFor(() =>
      expect(routeur.state.location.pathname).toBe("/vente/concert-1/reservation"),
    );
    expect(lireJetonAcces("concert-1")?.jetonAcces).toBe("jeton-signe");
    expect(await screen.findByText(/Vous êtes admis/)).toBeInTheDocument();
  });

  it("explique une vente inconnue et permet de réessayer", async () => {
    const consulter = vi
      .fn<ApiFile["consulter"]>()
      .mockRejectedValueOnce(new ErreurApi(404, "inconnue"))
      .mockResolvedValue(enAttente(1));
    afficher({ consulter });

    expect(await screen.findByRole("alert")).toHaveTextContent(/n'existe pas/);
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText(/Votre position/)).toBeInTheDocument();
  });

  it("explique un refus par limitation de débit (429)", async () => {
    afficher({ consulter: vi.fn(async () => Promise.reject(new ErreurApi(429, "trop"))) });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Trop de demandes/);
  });
});

describe("formaterDuree", () => {
  it("formate l'attente de façon lisible", () => {
    expect(formaterDuree(30)).toBe("moins d'une minute");
    expect(formaterDuree(92)).toBe("environ 2 min");
    expect(formaterDuree(5_400)).toBe("environ 1 h 30");
  });
});
