import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Catalogue } from "./Catalogue";
import { FicheEvenement } from "./FicheEvenement";

const EVT = "7e1d5c2a-3b4f-4c6d-8e9f-0a1b2c3d4e50";

const resultat = {
  total: 1,
  page: 1,
  parPage: 20,
  evenements: [
    {
      id: EVT,
      titre: "Les Électrons Libres — Tournée 2027",
      artiste: "Les Électrons Libres",
      genre: "Pop",
      salle: "Arène du Lac",
      ville: "Lyon",
      debutLe: "2027-03-12T19:00:00.000Z",
      prixMinCentimes: 4500,
    },
  ],
};

const fiche = {
  evenementId: EVT,
  titre: "Les Électrons Libres — Tournée 2027",
  artiste: "Les Électrons Libres",
  genre: "Pop",
  salle: { nom: "Arène du Lac", ville: "Lyon" },
  debutLe: "2027-03-12T19:00:00.000Z",
  categories: [
    { categorieId: "f", libelle: "Fosse", placement: "libre", prixCentimes: 4500, capacite: 3000 },
  ],
};

function simuler(reponses: (url: string) => Response) {
  const appels: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      appels.push(url);
      return reponses(url);
    }),
  );
  return appels;
}

function afficher(adresse: string) {
  const routeur = createMemoryRouter(
    [
      { path: "/", element: <Catalogue /> },
      { path: "/evenements/:evenementId", element: <FicheEvenement /> },
      { path: "/vente/:evenementId", element: <p>Salle d'attente</p> },
    ],
    { initialEntries: [adresse] },
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={routeur} />
    </QueryClientProvider>,
  );
  return routeur;
}

afterEach(() => vi.unstubAllGlobals());

describe("Catalogue", () => {
  it("affiche les résultats : titre, salle, ville, prix « à partir de »", async () => {
    simuler(() => Response.json(resultat));
    afficher("/");

    expect(await screen.findByText("Les Électrons Libres — Tournée 2027")).toBeInTheDocument();
    expect(screen.getByText(/Arène du Lac, Lyon/)).toBeInTheDocument();
    expect(screen.getByText("À partir de 45,00 €")).toBeInTheDocument();
  });

  it("envoie les critères saisis et les garde dans l'adresse", async () => {
    const appels = simuler(() => Response.json(resultat));
    const routeur = afficher("/");

    await userEvent.type(screen.getByLabelText("Artiste, événement, salle"), "electrons");
    await userEvent.type(screen.getByLabelText("Ville"), "Lyon");
    await userEvent.click(screen.getByRole("button", { name: "Rechercher" }));

    await screen.findByText("Les Électrons Libres — Tournée 2027");
    expect(routeur.state.location.search).toBe("?q=electrons&ville=Lyon");
    expect(appels.at(-1)).toBe("/api/catalogue/recherche?q=electrons&ville=Lyon");
  });

  it("annonce une recherche sans résultat, et une recherche indisponible", async () => {
    simuler(() => Response.json({ ...resultat, total: 0, evenements: [] }));
    afficher("/?q=zzz");
    expect(
      await screen.findByText("Aucun événement ne correspond à votre recherche."),
    ).toBeInTheDocument();
  });

  it("recherche indisponible (503) : message clair", async () => {
    simuler(() => Response.json({ message: "indisponible" }, { status: 503 }));
    afficher("/");
    expect(await screen.findByRole("alert")).toHaveTextContent(/momentanément indisponible/);
  });
});

describe("Fiche d'un événement", () => {
  it("affiche salle, date, tarifs et mène à la salle d'attente", async () => {
    simuler(() => Response.json(fiche));
    const routeur = afficher(`/evenements/${EVT}`);

    expect(await screen.findByRole("heading", { name: fiche.titre })).toBeInTheDocument();
    expect(screen.getByText(/Fosse \(placement libre\) : 45,00 €/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Rejoindre la vente" }));
    expect(routeur.state.location.pathname).toBe(`/vente/${EVT}`);
  });

  it("événement inconnu (404)", async () => {
    simuler(() => Response.json({ message: "introuvable" }, { status: 404 }));
    afficher(`/evenements/${EVT}`);
    expect(await screen.findByRole("alert")).toHaveTextContent(/n'existe pas/);
  });
});
