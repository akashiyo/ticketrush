# 2. Contraintes

## 2.1 Contraintes techniques

| Contrainte                                                                        | Origine                       | Conséquence                                                   |
| --------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------- |
| Squelette conteneurisé **lancé en une commande**                                   | Sujet                         | Docker Compose (ADR 022), scénario M-2                         |
| Test de charge **≥ 50 000 acheteurs virtuels sur 5 000 places**, zéro survente     | Sujet                         | k6 (ADR 021), scénario C-1, ADR 003                            |
| Traces, métriques et journaux **OpenTelemetry** ; SLO définis et mesurés           | Sujet                         | ADR 017, 018                                                   |
| **CI au vert** à la livraison, 3 fonctions de fitness                              | Sujet                         | GitHub Actions, dependency-cruiser, oasdiff, seuils k6 (ADR 021) |
| Diagrammes C4 **écrits sous forme de code**                                         | Sujet                         | Structurizr DSL (`docs/architecture/workspace.dsl`)            |
| Tout tourne, test de charge compris, **sur nos machines personnelles**             | Équipe                        | Pas de cloud managé ; images légères ; ressources limitées dans le Compose |
| Tout langage autorisé, à condition de **justifier chaque choix par un scénario**   | Sujet                         | Chaque technologie a son ADR                                   |

## 2.2 Contraintes organisationnelles

| Contrainte                                                                               | Conséquence                                                                  |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Binôme** avec la charge d'un trinôme : partie commune + 4 modules dont 1 de niveau 3   | Monolithe modulaire, peu d'unités déployables (ADR 001)                      |
| **Chaque membre doit pouvoir expliquer tout le code** et toutes les décisions            | Un seul langage, TypeScript (ADR 020) ; relecture croisée de chaque PR       |
| Travail **en parallèle** sur deux pistes (P1 : Cœur ; P2 : entrée, plateforme)           | Contrats écrits au jalon 1 dans `packages/contrats/` ; substituts (loi de Conway) |
| Jalons fixés : cadrage, squelette, charge + ATAM, rendu final                            | Les décisions incertaines sont tracées comme dette (registre)                |
| En soutenance : **panne injectée** pendant la vente, **ADR en 20 minutes**               | Résilience démontrable en direct ; gabarit d'ADR prêt                        |

## 2.3 Conventions

- Documentation en **français**, langage du domaine en français dans le code (`siege`, `billet`, `reservation`).
- ADR au **format du cours** : Contexte · Décision · Alternatives écartées · Conséquences (`+` / `−`), un fichier par décision dans `docs/adr/`.
- Dossier au plan **arc42** ; scénarios de qualité au format en six parties du cours.
- Code formaté par Prettier, vérifié par ESLint ; un schéma PostgreSQL par module.
