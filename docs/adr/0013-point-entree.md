# ADR 013 — Point d'entrée : Traefik comme gateway, Nginx pour servir l'application web

Statut : Proposé (2026-11-24) · Responsable : P2

## Contexte

Toutes les requêtes des navigateurs arrivent sur plusieurs unités : l'application web, la File d'attente, le Cœur et Keycloak (ADR 001, 010).

Sans point d'entrée unique, le navigateur devrait connaître plusieurs adresses. Il faudrait gérer les autorisations entre origines (CORS) partout, et chaque service devrait implémenter lui-même le TLS et la limitation de débit.

Le cours décrit le rôle d'une API Gateway : TLS, authentification, limitation de débit, routage, journalisation, et **aucune logique métier**.

Scénarios concernés :
- **P-1** : le point d'entrée ne doit pas devenir le goulot au pic.
- **S-1** : c'est la première barrière contre les robots (ADR 012).
- **M-2** : il doit tourner dans le Docker Compose et se configurer simplement.

## Décision

**Traefik** est le point d'entrée unique. Il fait :
- **la terminaison TLS** : en local, avec un certificat de développement ;
- **le routage par chemin** :

| Chemin | Destination |
|---|---|
| `/` | Conteneur **Nginx** qui sert les fichiers de l'application web |
| `/api/file/…` | File d'attente |
| `/api/…` | Cœur |
| `/auth/…` | Keycloak |

- **la limitation de débit par adresse IP** sur l'entrée de la file, plus stricte, et sur l'API, plus souple (première couche de l'ADR 012) ;
- **la transmission des en-têtes de trace** OpenTelemetry vers les services (ADR 017) ;
- **la découverte automatique des services** grâce aux étiquettes Docker : ajouter un service ne demande pas de modifier un fichier de configuration central.
- **des routes de secours** (ajout du 26/11/2026, scénarios D-1, D-3) : quand un service est arrêté, Traefik retire ses routes, et ses requêtes tomberaient sur une route plus générale (404 du Cœur, page HTML de l'application). Chaque route du parcours d'achat a donc une jumelle de priorité inférieure, dans `infra/traefik/secours.yml`, qui répond **503**. L'acheteur reçoit une erreur honnête, et les SLO mesurés au point d'entrée voient la panne (ADR 018).

**Traefik ne sert pas lui-même les fichiers de l'application** : c'est un proxy, pas un serveur de fichiers. Un petit conteneur **Nginx** s'en charge, avec les règles de cache de l'ADR 015 (fichiers avec empreinte mis en cache un an, `index.html` jamais).

**Traefik ne vérifie pas les jetons et ne contient aucune règle métier.** Chaque service vérifie lui-même les jetons, selon le principe de zéro confiance (ADR 010).

## Alternatives écartées

- **Nginx seul, comme gateway.** Il est très performant, mais configuré par fichiers statiques : chaque nouveau service ou changement de route demande d'éditer la configuration et de recharger. La découverte automatique de Traefik est plus simple avec Docker Compose. (Nginx reste utilisé pour ce qu'il fait le mieux : servir des fichiers.)
- **Kong.** C'est une vraie API Gateway riche en extensions, mais plus lourde : base de données ou configuration déclarative, extensions en Lua. Ses fonctions avancées (monétisation, portail développeur) ne servent pas ici.
- **Envoy.** Il est très puissant, mais sa configuration est verbeuse et pensée pour être générée par un maillage de services. C'est trop complexe pour notre besoin.
- **Pas de gateway, chaque service exposé sur son port.** Il faudrait gérer CORS partout et dupliquer le TLS et la limitation de débit dans chaque service. Le navigateur dépendrait de la topologie interne.

## Conséquences

- \+ Une seule adresse pour le navigateur, et une topologie interne qu'on peut changer sans le toucher.
- \+ Le TLS et la limitation de débit sont centralisés et n'encombrent pas le code des services.
- \+ Ajouter un service se fait par étiquettes Docker, sans configuration centrale à modifier.
- − Traefik est un point de passage obligé : s'il tombe, tout est inaccessible. On peut lancer plusieurs instances, mais leur limitation de débit est **comptée par instance**, en mémoire, donc moins précise. C'est acceptable pour une première barrière, puisque les autres couches de l'ADR 012 prennent le relais.
- − Un conteneur de plus (Nginx) pour servir les fichiers, mais il est très léger.
- − Une limitation par adresse IP pénalise les acheteurs derrière une même adresse partagée (entreprise, université). Le seuil doit rester assez haut pour ne pas les bloquer.
