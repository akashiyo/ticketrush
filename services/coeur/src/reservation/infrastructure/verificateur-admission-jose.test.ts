import { createLocalJWKSet, exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { AdmissionRefusee } from "../domaine/blocage.js";
import type { VerificateurAdmission } from "../domaine/ports.js";
import { AUDIENCE_RESERVATION, creerVerificateurAdmission } from "./verificateur-admission-jose.js";

const EMETTEUR = "ticketrush-file-attente";

// Substitut de la File d'attente : une paire de clés ES256 de test, au même format que les
// vrais jetons (ADR 011). Les jetons sont vraiment signés et vérifiés.
let signer: (options?: {
  audience?: string;
  emetteur?: string;
  expiration?: string;
  claims?: Record<string, unknown>;
}) => Promise<string>;
let verificateur: VerificateurAdmission;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "file-test", alg: "ES256" };
  verificateur = creerVerificateurAdmission(createLocalJWKSet({ keys: [jwk] }), EMETTEUR);
  signer = (options = {}) =>
    new SignJWT({ evt: "evt-1", ...options.claims })
      .setProtectedHeader({ alg: "ES256", kid: "file-test" })
      .setIssuer(options.emetteur ?? EMETTEUR)
      .setSubject("acheteur-1")
      .setAudience(options.audience ?? AUDIENCE_RESERVATION)
      .setJti("jti-1")
      .setIssuedAt()
      .setExpirationTime(options.expiration ?? "10m")
      .sign(privateKey);
});

describe("Vérification du jeton d'accès (ADR 011, S-2)", () => {
  it("accepte un jeton valide et en extrait l'admission", async () => {
    const admission = await verificateur.verifier(await signer());

    expect(admission).toMatchObject({
      acheteurId: "acheteur-1",
      evenementId: "evt-1",
      jti: "jti-1",
    });
    expect(admission.expireLe.getTime()).toBeGreaterThan(Date.now());
  });

  it("refuse un jeton expiré", async () => {
    const jeton = await signer({ expiration: "-1m" });
    await expect(verificateur.verifier(jeton)).rejects.toBeInstanceOf(AdmissionRefusee);
  });

  it("refuse un jeton destiné à un autre service", async () => {
    const jeton = await signer({ audience: "analytique" });
    await expect(verificateur.verifier(jeton)).rejects.toBeInstanceOf(AdmissionRefusee);
  });

  it("refuse un jeton d'un autre émetteur", async () => {
    const jeton = await signer({ emetteur: "pirate" });
    await expect(verificateur.verifier(jeton)).rejects.toBeInstanceOf(AdmissionRefusee);
  });

  it("refuse un jeton falsifié (contenu modifié après signature)", async () => {
    const [entete, , signature] = (await signer()).split(".");
    const faux = Buffer.from(
      JSON.stringify({ sub: "acheteur-1", evt: "evt-2", aud: AUDIENCE_RESERVATION, iss: EMETTEUR }),
    ).toString("base64url");
    await expect(verificateur.verifier(`${entete}.${faux}.${signature}`)).rejects.toBeInstanceOf(
      AdmissionRefusee,
    );
  });

  it("refuse un jeton signé par une autre clé", async () => {
    const autre = await generateKeyPair("ES256");
    const jeton = await new SignJWT({ evt: "evt-1" })
      .setProtectedHeader({ alg: "ES256", kid: "file-test" })
      .setIssuer(EMETTEUR)
      .setSubject("acheteur-1")
      .setAudience(AUDIENCE_RESERVATION)
      .setJti("jti-1")
      .setExpirationTime("10m")
      .sign(autre.privateKey);
    await expect(verificateur.verifier(jeton)).rejects.toBeInstanceOf(AdmissionRefusee);
  });

  it("refuse un jeton signé en HS256 (clé symétrique)", async () => {
    const jeton = await new SignJWT({ evt: "evt-1" })
      .setProtectedHeader({ alg: "HS256", kid: "file-test" })
      .setIssuer(EMETTEUR)
      .setSubject("acheteur-1")
      .setAudience(AUDIENCE_RESERVATION)
      .setJti("jti-1")
      .setExpirationTime("10m")
      .sign(new TextEncoder().encode("secret-devine-par-un-attaquant-32o"));
    await expect(verificateur.verifier(jeton)).rejects.toBeInstanceOf(AdmissionRefusee);
  });

  it("refuse un jeton sans vente (evt)", async () => {
    const jeton = await signer({ claims: { evt: undefined } });
    await expect(verificateur.verifier(jeton)).rejects.toBeInstanceOf(AdmissionRefusee);
  });
});
