import { randomUUID } from "node:crypto";

import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  importPKCS8,
  type JWK,
  SignJWT,
} from "jose";

import type { Admission, Horloge, SignataireJeton } from "../domaine/ports.js";

/** Type de clé accepté par jose pour signer. */
type ClePrivee = Parameters<SignJWT["sign"]>[0];

export const ALGORITHME = "ES256";
/** Audience du jeton : il n'est valable que pour la réservation, dans le Cœur (ADR 011). */
export const AUDIENCE_RESERVATION = "reservation";

/**
 * Signe les jetons d'admission en ES256 (ADR 011). La clé privée reste dans la File
 * d'attente ; le Cœur vérifie avec la clé publique, publiée en JWKS, et ne peut donc
 * pas fabriquer de jetons (moindre privilège).
 */
export class SignataireJose implements SignataireJeton {
  private constructor(
    private readonly clePrivee: ClePrivee,
    readonly clePublique: JWK,
    private readonly emetteur: string,
    private readonly dureeSec: number,
    private readonly horloge: Horloge,
  ) {}

  /**
   * @param pemPkcs8 clé privée EC P-256 au format PKCS#8. Absente : une clé est générée
   * au démarrage. Acceptable avec une seule instance ; avec plusieurs instances,
   * toutes doivent partager la même clé.
   */
  static async creer(options: {
    pemPkcs8?: string;
    emetteur: string;
    dureeSec: number;
    horloge: Horloge;
  }): Promise<SignataireJose> {
    let clePrivee: ClePrivee;
    let publique: JWK;
    if (options.pemPkcs8) {
      clePrivee = await importPKCS8(options.pemPkcs8, ALGORITHME, { extractable: true });
      // La clé publique se déduit de la clé privée : on retire la partie secrète « d ».
      publique = await exportJWK(clePrivee);
      delete publique.d;
    } else {
      const paire = await generateKeyPair(ALGORITHME);
      clePrivee = paire.privateKey;
      publique = await exportJWK(paire.publicKey);
    }
    const kid = await calculateJwkThumbprint(publique);
    return new SignataireJose(
      clePrivee,
      { ...publique, kid, alg: ALGORITHME, use: "sig" },
      options.emetteur,
      options.dureeSec,
      options.horloge,
    );
  }

  async signer(acheteurId: string, evenementId: string): Promise<Admission> {
    const maintenantSec = Math.floor(this.horloge().getTime() / 1000);
    const expiration = maintenantSec + this.dureeSec;
    const jetonAcces = await new SignJWT({ evt: evenementId })
      .setProtectedHeader({ alg: ALGORITHME, kid: this.clePublique.kid ?? "" })
      .setIssuer(this.emetteur)
      .setSubject(acheteurId)
      .setAudience(AUDIENCE_RESERVATION)
      .setJti(randomUUID())
      .setIssuedAt(maintenantSec)
      .setExpirationTime(expiration)
      .sign(this.clePrivee);
    return { jetonAcces, expireLe: new Date(expiration * 1000).toISOString() };
  }

  /** Clés publiques au format JWKS, publiées pour le Cœur. */
  jwks(): { keys: JWK[] } {
    return { keys: [this.clePublique] };
  }
}
