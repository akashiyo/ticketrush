import { randomBytes } from "node:crypto";

import {
  type Challenge,
  createChallenge,
  randomInt,
  type Solution,
  verifySolution,
} from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/sha";
import type { Redis } from "ioredis";
import { z } from "zod";

import type { Horloge } from "../domaine/ports.js";

/** Résultat d'une vérification de preuve de travail. */
export type ResultatPreuve = "valide" | "absente" | "invalide" | "expiree" | "deja_utilisee";

const schemaPreuve = z.object({
  challenge: z.object({
    parameters: z.object({ algorithm: z.string(), nonce: z.string(), salt: z.string() }).loose(),
    signature: z.string().min(1),
  }),
  solution: z.object({ counter: z.number().int().nonnegative(), derivedKey: z.string() }).loose(),
});

/**
 * Protection contre les robots par preuve de travail ALTCHA (ADR 012), auto-hébergée.
 *
 * 1. Le serveur délivre un défi signé par HMAC, valable quelques minutes.
 * 2. Le navigateur cherche la solution (essais de SHA-256 jusqu'à la difficulté réglée).
 * 3. Le serveur vérifie la solution sans recalcul coûteux (signature de la clé dérivée),
 *    puis enregistre le défi dans Redis : chaque défi ne sert qu'une fois.
 *
 * Un robot qui veut des milliers de positions doit fournir des milliers de calculs,
 * alors qu'un humain ne le paie qu'une fois.
 */
export class ProtectionRobots {
  private constructor(
    private readonly redis: Redis,
    private readonly horloge: Horloge,
    private readonly secretDefi: string,
    private readonly secretCle: string,
    private readonly options: { actif: boolean; difficulte: number; dureeSec: number },
  ) {}

  static creer(options: {
    redis: Redis;
    horloge: Horloge;
    secret: string | undefined;
    actif: boolean;
    difficulte: number;
    dureeSec: number;
  }): ProtectionRobots {
    const secret = options.secret ?? randomBytes(32).toString("hex");
    return new ProtectionRobots(options.redis, options.horloge, `${secret}:defi`, `${secret}:cle`, {
      actif: options.actif,
      difficulte: options.difficulte,
      dureeSec: options.dureeSec,
    });
  }

  get actif(): boolean {
    return this.options.actif;
  }

  /** Crée un défi à résoudre par le navigateur (format attendu par le widget ALTCHA). */
  creerDefi(): Promise<Challenge> {
    const maxi = Math.max(2, this.options.difficulte);
    return createChallenge({
      algorithm: "SHA-256",
      cost: 1,
      deriveKey,
      // Mode déterministe : le serveur choisit le compteur, le navigateur doit le retrouver.
      counter: randomInt(Math.floor(maxi / 2), maxi),
      hmacSignatureSecret: this.secretDefi,
      hmacKeySignatureSecret: this.secretCle,
      expiresAt: new Date(this.horloge().getTime() + this.options.dureeSec * 1000),
    });
  }

  /**
   * Vérifie la preuve envoyée par le navigateur : chaîne base64 contenant le défi et
   * sa solution (format du widget ALTCHA). Toujours valide si la protection est désactivée.
   */
  async verifier(preuveBase64: unknown): Promise<ResultatPreuve> {
    if (!this.options.actif) return "valide";
    if (typeof preuveBase64 !== "string" || preuveBase64.length === 0) return "absente";

    let preuve: { challenge: Challenge; solution: Solution };
    try {
      const brut: unknown = JSON.parse(Buffer.from(preuveBase64, "base64").toString("utf8"));
      // Le schéma vérifie la forme ; altcha-lib vérifie ensuite la signature et la solution.
      preuve = schemaPreuve.parse(brut) as unknown as { challenge: Challenge; solution: Solution };
    } catch {
      return "invalide";
    }

    const resultat = await verifySolution({
      challenge: preuve.challenge,
      solution: preuve.solution,
      deriveKey,
      hmacSignatureSecret: this.secretDefi,
      hmacKeySignatureSecret: this.secretCle,
    });
    if (resultat.expired) return "expiree";
    if (!resultat.verified) return "invalide";

    // Usage unique : la signature du défi est retenue jusqu'à son expiration.
    const premierUsage = await this.redis.set(
      `altcha:utilise:${preuve.challenge.signature}`,
      "1",
      "EX",
      this.options.dureeSec,
      "NX",
    );
    return premierUsage === "OK" ? "valide" : "deja_utilisee";
  }
}
