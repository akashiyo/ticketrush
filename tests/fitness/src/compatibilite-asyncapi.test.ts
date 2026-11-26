import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { type ContratAsyncApi, changementsIncompatibles } from "./compatibilite-asyncapi.ts";

const REEL = parse(
  readFileSync(
    new URL("../../../packages/contrats/asyncapi/evenements-coeur.yaml", import.meta.url),
    "utf8",
  ),
) as ContratAsyncApi;

/** Petit contrat de test : un message dont la charge utile passe par $ref et allOf. */
function contrat(donnees: object, autres: object = {}): ContratAsyncApi {
  return {
    components: {
      schemas: {
        Enveloppe: {
          type: "object",
          required: ["id", "type"],
          properties: { id: { type: "string", format: "uuid" }, type: { type: "string" } },
        },
      },
      messages: {
        BilletEmis: {
          payload: {
            allOf: [
              { $ref: "#/components/schemas/Enveloppe" },
              { type: "object", required: ["donnees"], properties: { donnees: donnees } },
            ],
          },
        },
        ...autres,
      },
    },
  } as ContratAsyncApi;
}

const BASE = {
  type: "object",
  required: ["siegeId", "prixCentimes"],
  properties: {
    siegeId: { type: "string", format: "uuid" },
    prixCentimes: { type: "integer" },
    remarque: { type: "string" },
  },
};

const avec = (modif: (d: typeof BASE) => void) => {
  const copie = structuredClone(BASE);
  modif(copie);
  return contrat(copie);
};

describe("compatibilité des contrats AsyncAPI (fitness 2, ADR 021)", () => {
  it("le contrat réel est compatible avec lui-même", () => {
    expect(changementsIncompatibles(REEL, REEL)).toEqual([]);
  });

  it("accepte un champ optionnel ajouté et un nouveau message", () => {
    const apres = avec((d) => {
      (d.properties as Record<string, object>).devise = { type: "string" };
    });
    apres.components!.messages!.Nouveau = { payload: { type: "object" } };
    expect(changementsIncompatibles(contrat(BASE), apres)).toEqual([]);
  });

  it("refuse un champ supprimé ou renommé", () => {
    const apres = avec((d) => {
      const p = d.properties as Record<string, object>;
      p.place = p.siegeId!;
      delete p.siegeId;
    });
    expect(changementsIncompatibles(contrat(BASE), apres)).toContain(
      "BilletEmis.donnees.siegeId : champ supprimé ou renommé",
    );
  });

  it("refuse un champ obligatoire ajouté", () => {
    const apres = avec((d) => {
      (d.properties as Record<string, object>).devise = { type: "string" };
      d.required.push("devise");
    });
    expect(changementsIncompatibles(contrat(BASE), apres)).toContain(
      "BilletEmis.donnees.devise : champ obligatoire ajouté",
    );
  });

  it("refuse un type modifié, même derrière une référence", () => {
    const apres = avec((d) => {
      d.properties.prixCentimes = { type: "string" };
    });
    expect(changementsIncompatibles(contrat(BASE), apres)).toEqual([
      'BilletEmis.donnees.prixCentimes : type modifié ("integer" → "string")',
    ]);
  });

  it("refuse un champ obligatoire devenu optionnel, et un message supprimé", () => {
    const sansMessage: ContratAsyncApi = {
      components: { ...contrat(BASE).components, messages: {} },
    };
    expect(changementsIncompatibles(contrat(BASE), sansMessage)).toEqual([
      "BilletEmis : message supprimé",
    ]);
    const apres = avec((d) => {
      d.required = ["prixCentimes"];
    });
    expect(changementsIncompatibles(contrat(BASE), apres)).toContain(
      "BilletEmis.donnees.siegeId : champ obligatoire devenu optionnel",
    );
  });

  it("détecte une rupture dans le contrat réel (champ du billet supprimé)", () => {
    const apres = structuredClone(REEL);
    const texte = JSON.stringify(apres).replace('"acheteurId"', '"idAcheteur"');
    expect(
      changementsIncompatibles(REEL, JSON.parse(texte) as ContratAsyncApi).length,
    ).toBeGreaterThan(0);
  });
});
