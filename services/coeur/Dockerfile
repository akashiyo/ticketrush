# Cœur — image construite depuis la racine du monorepo :
#   docker build -f services/coeur/Dockerfile .
# Même construction en plusieurs étapes que les services de P2 (ADR 022).

FROM node:24-alpine AS construction
RUN npm install -g pnpm@10.34.9
WORKDIR /depot
COPY . .
RUN pnpm install --frozen-lockfile --filter @ticketrush/coeur...
RUN pnpm --filter @ticketrush/coeur... build
RUN pnpm --filter @ticketrush/coeur deploy --legacy --prod /sortie

FROM node:24-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=construction --chown=node:node /sortie ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
