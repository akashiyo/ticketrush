import { afterEach, describe, expect, it, vi } from "vitest";

import { creerApiFile, ErreurApi } from "./api-file";
import { lireJetonAcces, rangerJetonAcces } from "./passage-reservation";

afterEach(() => vi.unstubAllGlobals());

describe("Client de la File d'attente", () => {
  it("envoie le jeton de l'acheteur et la preuve de travail", async () => {
    const fetchFactice = vi.fn(async () => Response.json({ statut: "absent" }));
    vi.stubGlobal("fetch", fetchFactice);

    await creerApiFile(() => "jeton-acheteur", "/api/file").entrer("concert 1", "preuve");

    expect(fetchFactice).toHaveBeenCalledWith(
      "/api/file/files/concert%201/entrer",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ altcha: "preuve" }),
        headers: expect.objectContaining({ Authorization: "Bearer jeton-acheteur" }),
      }),
    );
  });

  it("transforme une réponse en erreur avec son statut HTTP", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ message: "Rôle requis" }, { status: 403 }));
    const appel = creerApiFile(() => "j").consulter("concert-1");
    await expect(appel).rejects.toEqual(new ErreurApi(403, "Rôle requis"));
    await expect(appel).rejects.toHaveProperty("statut", 403);
  });
});

describe("Passage à la réservation", () => {
  it("conserve le jeton d'accès jusqu'à son expiration", () => {
    rangerJetonAcces("concert-1", { jetonAcces: "j", expireLe: "2026-12-01T10:10:00Z" });
    expect(lireJetonAcces("concert-1", new Date("2026-12-01T10:05:00Z"))?.jetonAcces).toBe("j");
    expect(lireJetonAcces("concert-1", new Date("2026-12-01T10:11:00Z"))).toBeNull();
    expect(lireJetonAcces("autre-concert")).toBeNull();
  });
});
