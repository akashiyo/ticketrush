# Application web — image construite depuis la racine du monorepo :
#   docker compose build web
# Étape 1 : construction avec Vite. Étape 2 : fichiers statiques servis par Nginx (ADR 013).

FROM node:24-alpine AS construction
RUN npm install -g pnpm@10.34.9
WORKDIR /depot
COPY . .
RUN pnpm install --frozen-lockfile --filter @ticketrush/web...
# Valeurs fixées à la construction (Vite) ; modifiables avec « build.args » dans le Compose.
ARG VITE_KEYCLOAK_URL=http://localhost:8180/realms/ticketrush
ARG VITE_KEYCLOAK_CLIENT_ID=ticketrush-web
ARG VITE_API_FILE=/api/file
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL \
    VITE_KEYCLOAK_CLIENT_ID=$VITE_KEYCLOAK_CLIENT_ID \
    VITE_API_FILE=$VITE_API_FILE
RUN pnpm --filter @ticketrush/web build

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=construction /depot/apps/web/dist /usr/share/nginx/html
EXPOSE 80
