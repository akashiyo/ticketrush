// Identité de test du test de charge (ADR 010, 021) : jetons pré-générés, hors du chemin critique.
//
//   node tests/charge/identite-de-test/generer.mjs [nombreAcheteurs]   (défaut : ACHETEURS ou 2000)
//
// Le test de charge simule des milliers d'acheteurs distincts : chacun doit avoir son propre
// compte (une position par compte, ADR 008). Créer et connecter des milliers de comptes Keycloak
// avant chaque test serait lent et sans rapport avec ce qu'on mesure, puisqu'au pic Keycloak
// n'est pas appelé (ADR 010) : les services vérifient seulement la signature des jetons.
//
// Ce script crée donc une paire de clés ES256, publie la clé publique (sortie/jwks.json, servie
// par le conteneur identite-de-test de docker-compose.charge.yml) et signe un jeton par acheteur,
// au format des jetons Keycloak (sub, realm_access.roles, aud, iss). Valeurs de TEST uniquement :
// ce fichier Compose n'est jamais utilisé hors du test de charge.
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const nombre = Number(process.argv[2] ?? process.env.ACHETEURS ?? 2000);
const EMETTEUR = process.env.EMETTEUR_TEST ?? "http://identite-de-test/charge";
const AUDIENCE = "ticketrush-api";
const DUREE_SEC = 3 * 3600;
const sortie = join(dirname(fileURLToPath(import.meta.url)), "sortie");

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const kid = "identite-de-test";
const base64url = (valeur) => Buffer.from(valeur).toString("base64url");

function signer(contenu) {
  const entete = base64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid }));
  const charge = base64url(JSON.stringify(contenu));
  const signature = sign("sha256", Buffer.from(`${entete}.${charge}`), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${entete}.${charge}.${signature.toString("base64url")}`;
}

const maintenant = Math.floor(Date.now() / 1000);
const jeton = (sub, roles) =>
  signer({
    iss: EMETTEUR,
    aud: AUDIENCE,
    sub,
    realm_access: { roles },
    iat: maintenant,
    exp: maintenant + DUREE_SEC,
  });

mkdirSync(sortie, { recursive: true });
writeFileSync(
  join(sortie, "jwks.json"),
  JSON.stringify({
    keys: [{ ...publicKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig" }],
  }),
);
writeFileSync(
  join(sortie, "jetons.json"),
  JSON.stringify({
    emetteur: EMETTEUR,
    organisateur: jeton("organisateur-charge", ["acheteur", "organisateur-admin"]),
    acheteurs: Array.from({ length: nombre }, (_, i) =>
      jeton(`acheteur-charge-${i + 1}`, ["acheteur"]),
    ),
  }),
);
console.log(`${nombre} jetons d'acheteur + 1 jeton d'organisateur écrits dans ${sortie}`);
