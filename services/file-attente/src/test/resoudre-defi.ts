import { type Challenge, solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/sha";

/**
 * Résout un défi ALTCHA comme le ferait le navigateur, et renvoie la preuve au format
 * du widget (base64 du défi et de sa solution).
 */
export async function resoudreDefi(defi: Challenge): Promise<string> {
  const solution = await solveChallenge({ challenge: defi, deriveKey });
  if (!solution) throw new Error("Défi non résolu");
  return Buffer.from(JSON.stringify({ challenge: defi, solution })).toString("base64");
}
