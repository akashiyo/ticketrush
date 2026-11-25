import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { KafkaJsInstrumentation } from "@opentelemetry/instrumentation-kafkajs";
import { NestInstrumentation } from "@opentelemetry/instrumentation-nestjs-core";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";

/** Chemins techniques sans intérêt dans les traces : contrôles de santé du Compose. */
const CHEMINS_IGNORES = new Set(["/sante", "/health", "/metrics"]);

/**
 * Démarre le SDK OpenTelemetry (ADR 017) : traces, métriques et journaux exportés en
 * OTLP vers le Collector (`OTEL_EXPORTER_OTLP_ENDPOINT`). Sans Collector joignable, les
 * données sont abandonnées : la vente ne dépend jamais de l'observabilité.
 */
export function demarrerTelemetrie(): NodeSDK | undefined {
  if (process.env.OTEL_SDK_DISABLED === "true") return undefined;

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 10_000),
      }),
    ],
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (requete) =>
          CHEMINS_IGNORES.has((requete.url ?? "").split("?")[0] ?? ""),
      }),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
      // Redis et PostgreSQL seulement à l'intérieur d'une trace existante : les tâches
      // périodiques (worker d'admission chaque seconde, relais Outbox toutes les 200 ms)
      // ne créent pas des milliers de traces sans intérêt.
      new IORedisInstrumentation({ requireParentSpan: true }),
      new PgInstrumentation({ requireParentSpan: true }),
      new KafkaJsInstrumentation(),
      // Ajoute trace_id et span_id aux journaux pino, et les envoie à Loki.
      new PinoInstrumentation(),
    ],
  });
  sdk.start();

  // Vide les tampons à l'arrêt (docker compose stop), sans jamais bloquer la sortie.
  const arreter = (): void => {
    void sdk.shutdown().catch(() => undefined);
  };
  process.once("SIGTERM", arreter);
  process.once("SIGINT", arreter);
  return sdk;
}
