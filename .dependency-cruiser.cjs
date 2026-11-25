// Fonction de fitness n° 1 : règles de dépendances (sujet : « Gouvernance »,
// ADR 021). Vérifie dans la CI que le code respecte les frontières décidées par :
//   - ADR 001 : style hexagonal, le domaine ne dépend pas de l'infrastructure ;
//   - ADR 002 : modules du Cœur isolés, ils ne se parlent que par leur dossier `api/` ;
//   - ADR 005 : les unités déployables ne partagent que les contrats de `packages/contrats`.
// Assouplir une règle passe par un nouvel ADR, pas par une exception silencieuse.

/** Modules du Cœur (ADR 002). */
const MODULES_COEUR = "(catalogue|reservation|organisateurs)";

/** Bibliothèques techniques interdites dans le domaine : frameworks, ORM, clients réseau. */
const TECHNIQUE =
  "(^|/)node_modules/(@nestjs|drizzle-orm|kysely|pg|postgres|ioredis|redis|kafkajs|@confluentinc|meilisearch|express|axios|undici|@opentelemetry|altcha-lib)/";

/** Modules Node.js qui ouvrent des connexions réseau. */
const RESEAU_NODE = "^(node:)?(http|https|http2|net|tls|dgram|dns)$";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "pas-de-cycle",
      comment: "Un cycle de dépendances rend les modules indissociables (ADR 021).",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "domaine-sans-couches-externes",
      comment:
        "Hexagonal (ADR 001) : le domaine définit les ports, il n'importe ni l'application ni l'infrastructure.",
      severity: "error",
      from: { path: "/domaine/" },
      to: { path: "/(application|infrastructure)/" },
    },
    {
      name: "domaine-sans-technique",
      comment:
        "Hexagonal (ADR 001) : le domaine n'importe ni NestJS, ni ORM, ni client réseau (ADR 021).",
      severity: "error",
      from: { path: "/domaine/" },
      to: { path: [TECHNIQUE, RESEAU_NODE] },
    },
    {
      name: "application-sans-infrastructure",
      comment:
        "Hexagonal (ADR 001) : l'application passe par les ports du domaine, les adaptateurs restent en infrastructure.",
      severity: "error",
      from: { path: "/application/", pathNot: "\\.test\\.ts$" },
      to: { path: "/infrastructure/" },
    },
    {
      name: "coeur-modules-par-api",
      comment: "ADR 002 : un module du Cœur n'appelle un autre module que par son dossier `api/`.",
      severity: "error",
      from: { path: `^services/coeur/src/(?:modules/)?${MODULES_COEUR}/` },
      to: {
        path: `^services/coeur/src/(?:modules/)?${MODULES_COEUR}/`,
        pathNot: [
          "^services/coeur/src/(?:modules/)?$1/",
          `^services/coeur/src/(?:modules/)?${MODULES_COEUR}/api/`,
        ],
      },
    },
    {
      name: "services-isoles",
      comment:
        "ADR 002 et 005 : une unité déployable n'importe pas le code d'une autre ; elles ne partagent que packages/contrats.",
      severity: "error",
      from: { path: "^services/([^/]+)/" },
      to: { path: "^services/", pathNot: "^services/$1/" },
    },
    {
      name: "front-sans-code-serveur",
      comment:
        "ADR 005 : la SPA parle aux services par HTTP et ne partage avec eux que packages/contrats.",
      severity: "error",
      from: { path: "^apps/" },
      to: { path: "^services/" },
    },
    {
      name: "contrats-autonomes",
      comment:
        "Les contrats sont la base commune : ils ne dépendent d'aucune application ni d'aucun service.",
      severity: "error",
      from: { path: "^packages/contrats/" },
      to: { path: "^(apps|services)/" },
    },
    {
      name: "pas-d-import-introuvable",
      comment: "Un import qui ne se résout pas cache une erreur ou une dépendance non déclarée.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    exclude: { path: "(^|/)(dist|build|coverage)/" },
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
