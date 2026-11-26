/**
 * Fonction de fitness n° 2 (ADR 021) : compatibilité des contrats.
 *
 *   node tests/fitness/src/verifier-contrats.ts        (ou : pnpm fitness:contrats)
 *
 * Compare chaque contrat de packages/contrats à sa version de référence, par défaut la
 * branche principale (`origin/main` ; sur la branche principale elle-même, le commit
 * précédent). Variable BASE_CONTRATS : autre référence git.
 *   - OpenAPI  : oasdiff (binaire s'il est installé, sinon son image Docker), échec sur ERR ;
 *   - AsyncAPI : comparateur de compatibilite-asyncapi.ts.
 * Un contrat absent de la référence est une première version : rien à comparer.
 * Code de sortie 1 si un changement casse un consommateur.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { parse } from "yaml";

import { type ContratAsyncApi, changementsIncompatibles } from "./compatibilite-asyncapi.ts";

const RACINE = resolve(import.meta.dirname, "../../..");
const CONTRATS = "packages/contrats";

const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: RACINE, encoding: "utf8" }).trim();

function referenceDeComparaison(): string {
  const demandee = process.env.BASE_CONTRATS ?? "origin/main";
  const tete = git("rev-parse", "HEAD");
  const base = git("rev-parse", demandee);
  // Sur la branche principale elle-même : comparer au commit précédent.
  return base === tete ? git("rev-parse", "HEAD~1") : git("merge-base", "HEAD", base);
}

function versionDeReference(reference: string, chemin: string): string | null {
  try {
    return execFileSync("git", ["show", `${reference}:${chemin}`], {
      cwd: RACINE,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function oasdiff(avant: string, apres: string): { ok: boolean; sortie: string } {
  const dossier = mkdtempSync(join(tmpdir(), "oasdiff-"));
  try {
    writeFileSync(join(dossier, "avant.yaml"), avant);
    writeFileSync(join(dossier, "apres.yaml"), apres);
    const args = ["breaking", "avant.yaml", "apres.yaml", "--fail-on", "ERR"];
    const binaire = spawnSync("oasdiff", ["--version"], { stdio: "ignore" });
    const resultat =
      binaire.status === 0
        ? spawnSync("oasdiff", args, { cwd: dossier, encoding: "utf8" })
        : spawnSync(
            "docker",
            ["run", "--rm", "-v", `${dossier}:/w`, "-w", "/w", "tufin/oasdiff:v1.41.0", ...args],
            { encoding: "utf8" },
          );
    if (resultat.error) throw resultat.error;
    return { ok: resultat.status === 0, sortie: `${resultat.stdout}${resultat.stderr}`.trim() };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const reference = referenceDeComparaison();
console.log(`Compatibilité des contrats : comparaison avec ${reference.slice(0, 7)}\n`);
let echecs = 0;

for (const fichier of readdirSync(join(RACINE, CONTRATS, "openapi")).filter((f) =>
  f.endsWith(".yaml"),
)) {
  const chemin = `${CONTRATS}/openapi/${fichier}`;
  const avant = versionDeReference(reference, chemin);
  if (avant === null) {
    console.log(`  ○ ${chemin} : première version, rien à comparer`);
    continue;
  }
  const { ok, sortie } = oasdiff(avant, readFileSync(join(RACINE, chemin), "utf8"));
  console.log(`  ${ok ? "✔" : "✖"} ${chemin} (OpenAPI, oasdiff)`);
  if (!ok) {
    echecs++;
    console.log(sortie.replace(/^/gm, "      "));
  }
}

for (const fichier of readdirSync(join(RACINE, CONTRATS, "asyncapi")).filter((f) =>
  f.endsWith(".yaml"),
)) {
  const chemin = `${CONTRATS}/asyncapi/${fichier}`;
  const avant = versionDeReference(reference, chemin);
  if (avant === null) {
    console.log(`  ○ ${chemin} : première version, rien à comparer`);
    continue;
  }
  const ruptures = changementsIncompatibles(
    parse(avant) as ContratAsyncApi,
    parse(readFileSync(join(RACINE, chemin), "utf8")) as ContratAsyncApi,
  );
  console.log(`  ${ruptures.length === 0 ? "✔" : "✖"} ${chemin} (AsyncAPI)`);
  for (const rupture of ruptures) console.log(`      ${rupture}`);
  if (ruptures.length > 0) echecs++;
}

if (echecs > 0) {
  console.log(
    `\n${echecs} contrat(s) cassent un consommateur. Faire une évolution compatible, ou une nouvelle version (ADR 005, 021).`,
  );
  process.exit(1);
}
console.log("\nAucun changement incompatible.");
