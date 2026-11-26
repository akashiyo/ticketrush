import "reflect-metadata";

import { readFileSync } from "node:fs";

import { RequestMethod } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { AppModule } from "../../app.module.js";

/**
 * Le contrat OpenAPI (packages/contrats, ADR 005, 021) décrit exactement les routes du code :
 * ni route oubliée, ni route qui n'existe plus. Sans ce test, la fonction de fitness
 * « compatibilité des contrats » comparerait un contrat qui ment.
 */
const CONTRAT = new URL(
  "../../../../../packages/contrats/openapi/faux-paiement.yaml",
  import.meta.url,
);

/** Clés de métadonnées posées par les décorateurs @Controller, @Get, @Post… de NestJS. */
const PATH_METADATA = "path";
const METHOD_METADATA = "method";

type Controleur = new (...args: never[]) => unknown;

function routesDuCode(): string[] {
  const controleurs = (Reflect.getMetadata("controllers", AppModule) ?? []) as Controleur[];
  return controleurs.flatMap((controleur) => {
    const base = String(Reflect.getMetadata(PATH_METADATA, controleur) ?? "");
    const prototype = controleur.prototype as Record<string, object>;
    return Object.getOwnPropertyNames(prototype)
      .map((nom) => prototype[nom])
      .filter(
        (methode): methode is object =>
          typeof methode === "function" && Reflect.hasMetadata(METHOD_METADATA, methode),
      )
      .map((methode) => {
        const verbe = RequestMethod[Reflect.getMetadata(METHOD_METADATA, methode) as RequestMethod];
        const chemin =
          `/${[base, String(Reflect.getMetadata(PATH_METADATA, methode) ?? "")].join("/")}`
            .replace(/\/+/g, "/")
            .replace(/(.)\/$/, "$1")
            .replace(/:(\w+)/g, "{$1}");
        return `${verbe.toLowerCase()} ${chemin}`;
      });
  });
}

function routesDuContrat(): string[] {
  const contrat = parse(readFileSync(CONTRAT, "utf8")) as { paths: Record<string, object> };
  const verbes = new Set(["get", "post", "put", "patch", "delete"]);
  return Object.entries(contrat.paths).flatMap(([chemin, operations]) =>
    Object.keys(operations)
      .filter((verbe) => verbes.has(verbe))
      .map((verbe) => `${verbe} ${chemin}`),
  );
}

describe("contrat OpenAPI du faux prestataire de paiement", () => {
  it("décrit exactement les routes implémentées", () => {
    expect(routesDuCode().sort()).toEqual(routesDuContrat().sort());
  });
});
