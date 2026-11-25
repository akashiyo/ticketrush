# File d'attente virtuelle — image construite depuis la racine du monorepo :
#   docker compose build file-attente
# Construction en plusieurs étapes : l'image finale ne contient que le code compilé
# et les dépendances de production (ADR 022).

FROM node:24-alpine AS construction
RUN npm install -g pnpm@10.34.9
WORKDIR /depot
COPY . .
RUN pnpm install --frozen-lockfile --filter @ticketrush/file-attente...
RUN pnpm --filter @ticketrush/file-attente build
RUN pnpm --filter @ticketrush/file-attente deploy --legacy --prod /sortie

FROM node:24-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=construction --chown=node:node /sortie ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
