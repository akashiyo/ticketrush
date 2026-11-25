import { type Challenge, solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/web/sha";

/**
 * Résout dans le navigateur le défi ALTCHA de la File d'attente (ADR 012) et renvoie
 * la preuve à envoyer avec l'entrée dans la file (base64 du défi et de sa solution).
 * Les calculs utilisent WebCrypto, de façon asynchrone : la page reste réactive.
 */
export async function resoudreDefi(defi: unknown): Promise<string> {
  const challenge = defi as Challenge;
  const solution = await solveChallenge({ challenge, deriveKey });
  if (!solution) throw new Error("Vérification anti-robot impossible : réessayer");
  return btoa(JSON.stringify({ challenge, solution }));
}
