/**
 * Point d'entrée chargé AVANT l'application :
 *   node --import @ticketrush/observabilite/demarrer dist/main.js
 *
 * Les services sont des modules ESM : le crochet d'OpenTelemetry doit être enregistré
 * avant le premier `import` de NestJS, d'Express, de Redis ou de pino, sinon ils ne
 * sont pas instrumentés.
 */
import { register } from "node:module";

register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);

const { demarrerTelemetrie } = await import("./sdk.js");
demarrerTelemetrie();
