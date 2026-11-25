import type { LoggerService } from "@nestjs/common";
import { type Logger as Pino, pino } from "pino";

type Niveau = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Journal NestJS en JSON sur la sortie standard, via pino (ADR 017).
 *
 * Avec le SDK démarré, l'instrumentation pino ajoute `trace_id` et `span_id` à chaque
 * ligne et l'envoie à Loki : depuis un journal, Grafana ouvre la trace correspondante.
 * Les `new Logger("Contexte")` de NestJS passent tous par ici.
 */
export class JournalJson implements LoggerService {
  private readonly pino: Pino;

  constructor(options: { niveau?: Niveau; destination?: NodeJS.WritableStream } = {}) {
    this.pino = pino(
      {
        level: options.niveau ?? (process.env.LOG_LEVEL as Niveau | undefined) ?? "info",
        base: { service: process.env.OTEL_SERVICE_NAME },
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: { level: (label) => ({ level: label }) },
      },
      options.destination ?? process.stdout,
    );
  }

  log(message: unknown, ...params: unknown[]): void {
    this.ecrire("info", message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    this.ecrire("error", message, params);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.ecrire("warn", message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.ecrire("debug", message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.ecrire("trace", message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.ecrire("fatal", message, params);
  }

  /**
   * NestJS appelle `niveau(message, ...details, contexte)` : le contexte (nom du Logger)
   * est la dernière chaîne. Pour `error`, un détail peut être une Error ou une pile.
   */
  private ecrire(niveau: Niveau, message: unknown, params: unknown[]): void {
    const details = [...params];
    const contexte =
      details.length > 0 && typeof details[details.length - 1] === "string"
        ? (details.pop() as string)
        : undefined;

    const champs: Record<string, unknown> = {};
    if (contexte) champs.contexte = contexte;
    for (const detail of details) {
      if (detail instanceof Error) champs.err = detail;
      else if (typeof detail === "string") champs.pile = detail;
      else if (detail !== undefined) champs.details = detail;
    }

    if (message instanceof Error) {
      this.pino[niveau]({ ...champs, err: message }, message.message);
    } else if (typeof message === "object" && message !== null) {
      this.pino[niveau]({ ...champs, ...message });
    } else {
      this.pino[niveau](champs, String(message));
    }
  }
}
