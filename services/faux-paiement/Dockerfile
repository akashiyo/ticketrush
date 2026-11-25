# Faux prestataire de paiement — image construite depuis la racine du monorepo :
#   docker compose build faux-paiement
# Construction en plusieurs étapes : l'image finale ne contient que le code compilé
# et les dépendances de production (ADR 022).

FROM node:24-alpine AS construction
RUN npm install -g pnpm@10.34.9
WORKDIR /depot
COPY . .
RUN pnpm install --frozen-lockfile --filter @ticketrush/faux-paiement...
# « ... » construit aussi les paquets du dépôt dont le service dépend (observabilité).
RUN pnpm --filter @ticketrush/faux-paiement... build
RUN pnpm --filter @ticketrush/faux-paiement deploy --legacy --prod /sortie

FROM node:24-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=construction --chown=node:node /sortie ./
USER node
EXPOSE 3000
# Le SDK OpenTelemetry est chargé avant l'application (ADR 017).
CMD ["node", "--import", "@ticketrush/observabilite/demarrer", "dist/main.js"]
