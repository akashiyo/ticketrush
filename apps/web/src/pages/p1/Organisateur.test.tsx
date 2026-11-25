import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "oidc-client-ts";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Contexte, type ContexteAuth } from "../../auth/auth";
import type { EvenementOrganisateur } from "./api-organisateur";
import { Organisateur } from "./Organisateur";

const brouillon: EvenementOrganisateur = {
  id: "evt-1",
  titre: "Concert",
  artiste: null,
  genre: null,
  salle: { id: "s", nom: "Arène du Lac", ville: "Lyon" },
  debutLe: "2027-03-12T19:00:00.000Z",
  statut: "brouillon",
  version: 1,
  tarifs: [{ id: "t", libelle: "Fosse", placement: "libre", capacite: 3000, prixCentimes: 4500 }],
  ventes: { places: 3000, vendues: 120, bloquees: 4, recetteCentimes: 540000 },
};

function simuler(reponses: Record<string, Response>) {
  const appels: { route: string; entetes: Record<string, string> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const route = `${init.method ?? "GET"} ${url}`;
      appels.push({ route, entetes: init.headers as Record<string, string> });
      return (reponses[route] ?? Response.json([])).clone();
    }),
  );
  return appels;
}

function afficher() {
  const auth: ContexteAuth = {
    utilisateur: { access_token: "jeton-organisateur", profile: {} } as unknown as User,
    chargement: false,
    seConnecter: vi.fn(async () => {}),
    seDeconnecter: vi.fn(async () => {}),
    terminerConnexion: vi.fn(async () => "/"),
  };
  const routeur = createMemoryRouter([{ path: "/organisateur", element: <Organisateur /> }], {
    initialEntries: ["/organisateur"],
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Contexte.Provider value={auth}>
        <RouterProvider router={routeur} />
      </Contexte.Provider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("Espace organisateur", () => {
  it("affiche ses événements et leurs ventes, avec son jeton et sans organisation dans l'adresse", async () => {
    const appels = simuler({ "GET /api/organisateur/evenements": Response.json([brouillon]) });
    afficher();

    expect(await screen.findByText("Concert (brouillon)")).toBeInTheDocument();
    expect(
      screen.getByText(/Ventes : 120 \/ 3000 places, 4 en cours de paiement/),
    ).toBeInTheDocument();
    const lecture = appels.find((a) => a.route === "GET /api/organisateur/evenements")!;
    expect(lecture.entetes.Authorization).toBe("Bearer jeton-organisateur");
  });

  it("publie un brouillon", async () => {
    const appels = simuler({
      "GET /api/organisateur/evenements": Response.json([brouillon]),
      "POST /api/organisateur/evenements/evt-1/publication": Response.json({
        ...brouillon,
        statut: "publie",
      }),
    });
    afficher();

    await userEvent.click(await screen.findByRole("button", { name: "Publier « Concert »" }));

    await waitFor(() =>
      expect(
        appels.some((a) => a.route === "POST /api/organisateur/evenements/evt-1/publication"),
      ).toBe(true),
    );
  });

  it("un lecteur qui tente de publier est prévenu (403)", async () => {
    simuler({
      "GET /api/organisateur/evenements": Response.json([brouillon]),
      "POST /api/organisateur/evenements/evt-1/publication": Response.json(
        { message: "interdit" },
        { status: 403 },
      ),
    });
    afficher();

    await userEvent.click(await screen.findByRole("button", { name: "Publier « Concert »" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Votre rôle ne permet pas/);
  });
});
