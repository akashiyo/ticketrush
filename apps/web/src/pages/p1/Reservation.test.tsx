import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "oidc-client-ts";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Contexte, type ContexteAuth } from "../../auth/auth";
import { rangerJetonAcces } from "../../commun/passage-reservation";
import type { PlanDeSalle } from "./api-reservation";
import { minutesSecondes, parRang, Reservation } from "./Reservation";

const EVT = "7e1d5c2a-3b4f-4c6d-8e9f-0a1b2c3d4e50";

const plan: PlanDeSalle = {
  evenementId: EVT,
  categories: [
    {
      categorieId: "fosse",
      libelle: "Fosse",
      placement: "libre",
      prixCentimes: 4500,
      disponibles: 3000,
      places: [],
    },
    {
      categorieId: "cat1",
      libelle: "Catégorie 1",
      placement: "numerote",
      prixCentimes: 6500,
      disponibles: 1,
      places: [
        { siegeId: "s-a2", numero: "A-2", disponible: false },
        { siegeId: "s-a1", numero: "A-1", disponible: true },
      ],
    },
  ],
};

const blocage = {
  reservationId: "res-1",
  siegeId: "s-a1",
  categorieId: "cat1",
  bloqueJusqua: new Date(Date.now() + 600_000).toISOString(),
};

const billet = {
  billetId: "billet-42",
  reservationId: "res-1",
  evenementId: EVT,
  siegeId: "s-a1",
  prixCentimes: 6500,
  emisLe: new Date().toISOString(),
};

const json = (statut: number, corps: unknown) => Response.json(corps, { status: statut });

/** Simule le Cœur : une file de réponses par route (« METHODE chemin »). */
function simulerCoeur(reponses: Record<string, Response[]>) {
  const appels: { route: string; entetes: Record<string, string>; corps: unknown }[] = [];
  const fetchSimule = vi.fn(async (url: string, init: RequestInit = {}) => {
    const route = `${init.method ?? "GET"} ${url}`;
    appels.push({
      route,
      entetes: init.headers as Record<string, string>,
      corps: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const liste = reponses[route];
    const reponse = liste && liste.length > 1 ? liste.shift() : liste?.[0];
    return reponse?.clone() ?? json(404, { message: `route non simulée : ${route}` });
  });
  vi.stubGlobal("fetch", fetchSimule);
  return appels;
}

function afficher() {
  const auth: ContexteAuth = {
    utilisateur: { access_token: "jeton-keycloak", profile: {} } as unknown as User,
    chargement: false,
    seConnecter: vi.fn(async () => {}),
    seDeconnecter: vi.fn(async () => {}),
    terminerConnexion: vi.fn(async () => "/"),
  };
  const routeur = createMemoryRouter(
    [{ path: "/vente/:evenementId/reservation", element: <Reservation /> }],
    { initialEntries: [`/vente/${EVT}/reservation`] },
  );
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

const PLAN = `GET /api/evenements/${EVT}/plan`;
const BLOCAGE = `POST /api/evenements/${EVT}/blocages`;
const PAIEMENT = "POST /api/reservations/res-1/paiement";

beforeEach(() => {
  sessionStorage.clear();
  rangerJetonAcces(EVT, {
    jetonAcces: "jeton-de-la-file",
    expireLe: new Date(Date.now() + 600_000).toISOString(),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("Réservation", () => {
  it("sans jeton d'accès, renvoie vers la salle d'attente", async () => {
    sessionStorage.clear();
    simulerCoeur({});
    afficher();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /passez d'abord par la salle d'attente/,
    );
  });

  it("affiche les catégories, leurs prix et les sièges disponibles", async () => {
    simulerCoeur({ [PLAN]: [json(200, plan)] });
    afficher();

    expect(await screen.findByText("Fosse — 45,00 €")).toBeInTheDocument();
    expect(screen.getByText("Catégorie 1 — 65,00 €")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siège A-1" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Siège A-2 (pris)" })).toBeDisabled();
  });

  it("parcours complet : siège choisi, bloqué avec le jeton d'accès, payé, billet affiché", async () => {
    const appels = simulerCoeur({
      [PLAN]: [json(200, plan)],
      [BLOCAGE]: [json(201, blocage)],
      [PAIEMENT]: [json(201, billet)],
    });
    afficher();

    await userEvent.click(await screen.findByRole("button", { name: "Siège A-1" }));
    expect(await screen.findByRole("timer")).toHaveTextContent(/^(10:00|9:5\d)$/);
    await userEvent.click(screen.getByRole("button", { name: "Payer" }));

    expect(await screen.findByText(/billet-42/)).toBeInTheDocument();
    const demandeBlocage = appels.find((a) => a.route === BLOCAGE)!;
    expect(demandeBlocage.entetes).toMatchObject({
      "Jeton-Acces": "jeton-de-la-file",
      Authorization: "Bearer jeton-keycloak",
    });
    expect(demandeBlocage.corps).toEqual({ siegeId: "s-a1" });
    const demandePaiement = appels.find((a) => a.route === PAIEMENT)!;
    expect(demandePaiement.entetes["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(demandePaiement.corps).toEqual({ moyenDePaiement: { jeton: "carte-acceptee" } });
  });

  it("place déjà prise : l'acheteur est prévenu et le plan se rafraîchit", async () => {
    const appels = simulerCoeur({
      [PLAN]: [json(200, plan)],
      [BLOCAGE]: [json(409, { message: "Place déjà prise" })],
    });
    afficher();

    await userEvent.click(
      await screen.findByRole("button", { name: "Prendre une place en fosse" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/vient d'être prise/);
    await waitFor(() => expect(appels.filter((a) => a.route === PLAN)).toHaveLength(2));
  });

  it("prestataire indisponible : même clé au nouvel essai ; refus : nouvelle clé", async () => {
    const appels = simulerCoeur({
      [PLAN]: [json(200, plan)],
      [BLOCAGE]: [json(201, blocage)],
      [PAIEMENT]: [
        json(503, { message: "indisponible" }),
        json(402, { message: "refusé" }),
        json(201, billet),
      ],
    });
    afficher();
    await userEvent.click(await screen.findByRole("button", { name: "Siège A-1" }));
    const payer = await screen.findByRole("button", { name: "Payer" });

    await userEvent.click(payer);
    expect(await screen.findByRole("alert")).toHaveTextContent(/momentanément indisponible/);
    await userEvent.click(payer);
    expect(await screen.findByRole("alert")).toHaveTextContent(/refusé par votre banque/);
    await userEvent.click(payer);
    expect(await screen.findByText(/billet-42/)).toBeInTheDocument();

    const cles = appels
      .filter((a) => a.route === PAIEMENT)
      .map((a) => a.entetes["Idempotency-Key"]);
    expect(cles[0]).toBe(cles[1]); // 503 : même intention, rejouée
    expect(cles[2]).not.toBe(cles[1]); // après un refus : nouvelle intention
  });
});

describe("outils d'affichage", () => {
  it("range les sièges par rang puis par numéro", () => {
    const places = ["B-1", "A-10", "A-2"].map((numero) => ({
      siegeId: numero,
      numero,
      disponible: true,
    }));
    expect(parRang(places).map(([rang, liste]) => [rang, liste.map((p) => p.numero)])).toEqual([
      ["A", ["A-2", "A-10"]],
      ["B", ["B-1"]],
    ]);
  });

  it("formate le compte à rebours", () => {
    expect(minutesSecondes(600)).toBe("10:00");
    expect(minutesSecondes(65)).toBe("1:05");
  });
});
