import { Controller, Get } from "@nestjs/common";

/** Point de santé, sans authentification : utilisé par le contrôle de santé du Compose. */
@Controller("sante")
export class SanteController {
  @Get()
  sante(): { statut: "ok" } {
    return { statut: "ok" };
  }
}
