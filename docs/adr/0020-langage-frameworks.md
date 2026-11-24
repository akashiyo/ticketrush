# ADR 020 — Langage et frameworks : TypeScript partout (React + Vite, NestJS, Drizzle)

Statut : Proposé (2026-11-24) · Responsable : P1

## Contexte

Le sujet autorise tous les langages et frameworks, **à condition que chaque choix soit justifié par un scénario de qualité**. Il impose aussi que **chaque membre puisse expliquer tout le code** en soutenance.

Nous sommes deux, avec la charge d'un trinôme : 4 unités déployables, une application web et un test de charge (ADR 001).

Scénarios et contraintes concernés :
- **M-1 et M-2** : un code que les deux membres comprennent et modifient, qui démarre en une commande.
- **P-1 et P-2** : un environnement d'exécution qui tient la charge. Nos services font surtout des entrées-sorties (Redis, PostgreSQL, Redpanda), et peu de calcul.
- **ADR 003** : il faut écrire à la main le SQL atomique de réservation.
- **ADR 001** : l'architecture modulaire et l'inversion des dépendances doivent être naturelles dans le framework (cours, partie 4).

## Décision

**TypeScript pour tout le code**, sur **Node.js en version LTS** :

| Partie | Choix | Justification |
|---|---|---|
| Application web | **React + Vite**, React Router, TanStack Query | Application statique, facile à servir et à mettre en cache au pic (ADR 015) ; TanStack Query gère l'interrogation de la file (ADR 009) |
| Services | **NestJS** | Modules et injection de dépendances : les ports et adaptateurs du cours s'y écrivent directement ; support natif de Kafka, des tâches planifiées (relais Outbox, worker d'admission), de la validation et d'OpenAPI |
| Accès aux données | **Drizzle ORM** | On garde la main sur le SQL : l'`UPDATE` conditionnel et `FOR UPDATE SKIP LOCKED` de l'ADR 003 s'écrivent tels quels |
| Dépôt | **Monorepo pnpm** | Un seul dépôt, une seule CI, et des **types partagés** entre front, services et tests (contrats d'API et d'événements) |
| Tests | **Vitest**, **k6** (en JavaScript) | Les tests unitaires, d'intégration et de charge s'écrivent dans le même langage |

**L'organisation des modules dans NestJS suit l'architecture hexagonale** : le domaine au centre, sans dépendance à NestJS ni à Drizzle, et les adaptateurs autour. La règle est vérifiée par dependency-cruiser (ADR 021).

## Alternatives écartées

- **Java avec Spring Boot.** C'est plus performant en calcul, très outillé (ArchUnit, Kafka Streams), et c'est le langage des exemples de fitness du cours. Mais avec un front en TypeScript, chaque membre devrait maîtriser deux langages pour défendre tout le code. Nos services font surtout des entrées-sorties, là où Node.js est efficace : le gain de performance ne compenserait pas ce coût.
- **Go.** Il est rapide, léger et adapté aux services réseau, mais moins familier à l'équipe. Il n'offre pas de framework modulaire équivalent à NestJS, et il ferait aussi deux langages avec le front.
- **Express ou Fastify seuls, sans NestJS.** Ils sont plus légers, mais n'imposent aucune structure : modules, injection et validation seraient à construire à la main, et la cohérence entre les quatre services dépendrait de notre discipline.
- **Next.js pour l'application web.** Le rendu côté serveur n'apporte rien à une application derrière une connexion, et il ajouterait un serveur Node à faire tenir au pic. Une application statique se sert et se met en cache sans effort.
- **Prisma ou TypeORM.** Prisma abstrait le SQL au point de rendre difficile l'`UPDATE` conditionnel atomique. TypeORM est moins bien typé et moins maintenu.

## Conséquences

- \+ Un seul langage : chaque membre peut lire, tester et défendre n'importe quelle partie du code.
- \+ Les contrats sont partagés par des types communs : une rupture de contrat apparaît dès la compilation, en plus d'oasdiff (ADR 021).
- \+ NestJS structure les quatre services de la même façon, ce qui réduit le coût de passer de l'un à l'autre.
- − Node.js exécute le code sur un seul fil : un calcul lourd bloquerait toutes les requêtes d'une instance. Nos calculs sont courts (vérification de signature, de preuve de travail) et on monte en charge en ajoutant des instances.
- − Pour un service très gourmand en calcul, Java ou Go serait plus efficace. Si un tel besoin apparaît, il fera l'objet d'un nouvel ADR.
- − L'outillage d'architecture est moins riche qu'en Java : dependency-cruiser remplace ArchUnit, et l'analytique se fait sans Flink (ADR 019).
