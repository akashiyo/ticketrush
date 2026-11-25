/**
 * Fonction de fitness « règles de dépendances » du Cœur (ADR 001, 002, 021 ; scénario M-3).
 *
 * Lancement : pnpm --filter @ticketrush/coeur dependances
 * Chaque règle traduit une décision d'architecture ; un import qui l'enfreint fait échouer la commande.
 *
 * Vocabulaire : src/<module>/{domaine,application,infrastructure,api}/ ; src/commun/ est
 * l'infrastructure partagée (configuration, base) ; src/*.ts est l'assemblage du Cœur.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "pas-de-cycle",
      comment: "Dépendances acycliques (principes des composants) : aucun cycle entre fichiers.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "domaine-independant",
      comment:
        "Hexagonal (ADR 020) : le domaine ne dépend que de lui-même. Ni application, ni " +
        "infrastructure, ni bibliothèque (NestJS, Drizzle, pg, jose...).",
      severity: "error",
      // Les tests du domaine utilisent Vitest : la règle vise le code de production.
      from: { path: "^src/([^/]+)/domaine/", pathNot: "\\.test\\.ts$" },
      to: { pathNot: ["^src/$1/domaine/"], dependencyTypesNot: ["core"] },
    },
    {
      name: "application-sans-infrastructure",
      comment:
        "Les cas d'usage n'utilisent que les ports du domaine, jamais leurs implémentations " +
        "ni les bibliothèques techniques.",
      severity: "error",
      from: { path: "^src/([^/]+)/application/" },
      to: {
        path: ["/infrastructure/", "^src/commun/", "node_modules/(@nestjs|drizzle-orm|pg|jose)/"],
      },
    },
    {
      name: "modules-par-leur-api",
      comment:
        "ADR 002 : un module n'utilise un autre module que par son dossier api/. " +
        "Ses classes internes restent invisibles. (src/test/ : utilitaires des tests.)",
      severity: "error",
      from: { path: "^src/([^/]+)/", pathNot: "^src/test/" },
      to: {
        path: "^src/([^/]+)/",
        pathNot: ["^src/$1/", "^src/[^/]+/api/", "^src/commun/", "^src/test/"],
      },
    },
    {
      name: "assemblage-par-les-api",
      comment: "L'assemblage du Cœur (app.module, main) ne branche les modules que par leur api/.",
      severity: "error",
      from: { path: "^src/[^/]+\\.ts$" },
      to: { path: "^src/[^/]+/", pathNot: ["^src/[^/]+/api/", "^src/commun/"] },
    },
    {
      name: "commun-sans-module",
      comment:
        "L'infrastructure commune ne dépend d'aucun module : ce sont les modules qui l'utilisent.",
      severity: "error",
      from: { path: "^src/commun/" },
      to: { path: "^src/", pathNot: "^src/commun/" },
    },
    {
      name: "pas-d-autre-service",
      comment:
        "ADR 001 : le Cœur n'importe le code d'aucun autre service. Seul point de contact : " +
        "les contrats (packages/contrats).",
      severity: "error",
      from: { path: "^src/" },
      // Tout ce qui sort du dossier du Cœur, sauf les contrats et les bibliothèques installées.
      to: {
        path: "^\\.\\./",
        pathNot: ["^\\.\\./\\.\\./packages/contrats/", "(^|/)node_modules/"],
      },
    },
    {
      name: "code-de-test-isole",
      comment: "Le code de production n'importe ni les tests ni leurs utilitaires.",
      severity: "error",
      from: { path: "^src/", pathNot: ["\\.test\\.ts$", "^src/test/"] },
      to: { path: ["\\.test\\.ts$", "^src/test/"] },
    },
    {
      name: "import-introuvable",
      comment: "Un import qui ne se résout pas est une erreur, pas un trou dans la vérification.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    // Les imports de types comptent aussi : un domaine ne doit même pas connaître les types d'une bibliothèque.
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
  },
};
