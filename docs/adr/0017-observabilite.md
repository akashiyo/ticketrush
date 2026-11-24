# ADR 017 — Observabilité : OpenTelemetry, Collector et pile Grafana

Statut : Proposé (2026-11-24) · Responsable : P2

## Contexte

Le sujet impose :
- **des traces distribuées, des métriques et des journaux avec OpenTelemetry** ;
- **un tableau de bord de la mise en vente** ;
- **des SLO définis et mesurés**.

Pendant la soutenance, le comité injectera une panne en pleine vente. Il faudra **montrer** ce qui se passe : quel service souffre, quelle latence augmente, quelle requête échoue.

Scénario **O-1** : une réservation lente pendant le pic → sa trace complète est retrouvée dans Grafana en moins d'une minute.

Notre architecture fait passer une vente par plusieurs unités : File d'attente → Cœur → faux prestataire de paiement → Outbox → Redpanda → Analytique. Sans traçage distribué, ce parcours devient impossible à suivre (ADR 005).

Contrainte : tout doit tourner dans le Docker Compose, sur des machines déjà chargées par le test (M-2).

## Décision

**1. L'instrumentation : le SDK OpenTelemetry pour Node.js, dans chaque service**
- L'instrumentation automatique couvre HTTP, NestJS, PostgreSQL (`pg`), Redis et KafkaJS.
- On ajoute des **métriques métier** : places vendues, places bloquées, longueur de la file, admissions par seconde, échecs de paiement.
- Les journaux sont structurés en JSON (avec `pino`) et contiennent toujours l'identifiant de trace (`trace_id`) : depuis un journal, on ouvre la trace correspondante.

**2. La propagation de la trace à travers les événements**
- Le contexte de trace, au format standard W3C `traceparent`, est stocké dans la table Outbox (ADR 007), puis transmis dans les en-têtes des messages Redpanda.
- La trace d'une vente continue ainsi jusqu'à l'Analytique, au lieu de s'arrêter à la base de données.

**3. La collecte : un OpenTelemetry Collector**
- Les services envoient tout au Collector, qui répartit vers les outils de stockage.
- Les services ne connaissent pas ces outils : on peut en changer sans toucher au code.

**4. Le stockage et la visualisation**

| Donnée | Outil |
|---|---|
| Métriques, SLI, SLO | Prometheus |
| Traces | Tempo |
| Journaux | Loki |
| Tableaux de bord, alertes | Grafana |

- **En local**, ces outils tournent dans l'image unique `grafana/otel-lgtm`, qui contient aussi le Collector. On passe d'environ six conteneurs à un seul.
- **En cible de production**, ils sont séparés, pour être dimensionnés indépendamment. Ce sera documenté dans la vue de déploiement.

**5. Les tableaux de bord en code** : les tableaux Grafana sont des fichiers JSON versionnés dans le dépôt, et chargés automatiquement au démarrage. Le tableau de bord de la mise en vente fait partie du dépôt, comme le code.

Les SLO et les alertes sur les budgets d'erreur font l'objet de l'ADR 018.

## Alternatives écartées

- **Datadog, New Relic ou un autre service hébergé.** Ils sont payants au-delà de l'essai, ne tournent pas dans le Compose, et créent une dépendance à un fournisseur. Le cours les cite, mais OpenTelemetry nous garde indépendants.
- **La pile ELK** (Elasticsearch, Logstash, Kibana). Elle est lourde en mémoire (Java) et centrée sur les journaux, sans traces distribuées natives. Elle demanderait un outil de plus pour les traces.
- **Jaeger pour les traces.** Il est excellent, mais Tempo s'intègre directement à Grafana et à Loki : on passe d'un journal à sa trace en un clic, avec un seul outil de visualisation.
- **Envoyer directement des services vers chaque outil, sans Collector.** Chaque service devrait connaître Prometheus, Tempo et Loki. Changer d'outil voudrait dire modifier et redéployer tous les services.

## Conséquences

- \+ Une vente se suit de bout en bout, de l'entrée dans la file jusqu'au dashboard des organisateurs (O-1).
- \+ Pendant la démo de panne, le comité voit en direct quel service souffre et l'effet du disjoncteur ou de la dégradation.
- \+ Les tableaux de bord sont versionnés et identiques chez les deux membres du binôme.
- \+ OpenTelemetry est un standard : changer d'outil de stockage ne touche pas au code.
- − L'instrumentation ajoute un petit coût à chaque requête. Au pic, il faudra échantillonner les traces, par exemple garder 10 % des traces normales et 100 % des traces en erreur ou lentes.
- − L'image tout-en-un locale n'est pas représentative d'une production. Ses limites doivent être expliquées dans le rapport de charge.
- − Toute la pile d'observabilité est elle-même un composant qui peut tomber. Sa panne ne doit pas arrêter la vente : les SDK abandonnent les données plutôt que de bloquer.
