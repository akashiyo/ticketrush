import { Controller, Get, Inject } from "@nestjs/common";
import type { JWK } from "jose";

import { SignataireJose } from "../signataire-jose.js";

/** Points d'accès publics, sans authentification. */
@Controller()
export class PublicsController {
  constructor(@Inject(SignataireJose) private readonly signataire: SignataireJose) {}

  /** Santé, pour le contrôle de santé du Compose. */
  @Get("sante")
  sante(): { statut: "ok" } {
    return { statut: "ok" };
  }

  /** Clé publique des jetons d'admission : le Cœur s'en sert pour les vérifier (ADR 011). */
  @Get(".well-known/jwks.json")
  jwks(): { keys: JWK[] } {
    return this.signataire.jwks();
  }
}
