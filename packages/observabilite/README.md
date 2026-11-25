# @ticketrush/observabilite

Télémétrie commune des services TicketRush (ADR 017) : traces, métriques et journaux
envoyés en OpenTelemetry (OTLP) au Collector, qui les répartit vers Tempo, Prometheus et
Loki, consultés dans Grafana.

## Brancher un service NestJS

1. Dépendance : `"@ticketrush/observabilite": "workspace:*"`.
2. Démarrer Node avec le SDK chargé **avant** l'application (instrumentation automatique
   de HTTP, NestJS, Express, Redis, PostgreSQL, KafkaJS et pino) :

   ```
   node --import @ticketrush/observabilite/demarrer dist/main.js
   ```

3. Journaux JSON avec `trace_id` : `NestFactory.create(AppModule, { logger: new JournalJson() })`.
   Les `new Logger("Contexte")` de NestJS passent alors par pino.
4. Métriques métier : `mesureur("nom-du-service").createCounter(...)`, uniquement dans
   la couche infrastructure (le domaine n'importe pas ce paquet : règle de dépendances).

## Configuration (variables OpenTelemetry standard)

| Variable                                          | Rôle                                               | Valeur dans le Compose           |
| ------------------------------------------------- | -------------------------------------------------- | -------------------------------- |
| `OTEL_SERVICE_NAME`                               | Nom du service dans Grafana                        | `file-attente`, `faux-paiement`… |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                     | Adresse du Collector                               | `http://observabilite:4318`      |
| `OTEL_TRACES_SAMPLER` / `OTEL_TRACES_SAMPLER_ARG` | Échantillonnage des traces (ADR 017 : 10 % au pic) | `parentbased_traceidratio` / `1` |
| `OTEL_METRIC_EXPORT_INTERVAL`                     | Intervalle d'envoi des métriques (ms)              | `10000`                          |
| `OTEL_SDK_DISABLED`                               | `true` : aucune télémétrie                         | —                                |

Si le Collector est arrêté, les services continuent : le SDK abandonne les données au
lieu de bloquer (ADR 017).
