/*
 * TicketRush — modèle C4 (Structurizr DSL)
 *
 * Le modèle est décrit une fois ; toutes les vues en sont générées.
 * Jalon 1 : vue de contexte (niveau 1).
 * Jalon 2 : conteneurs (ADR 001, 002) ; puis composants du Cœur.
 * Déploiement (arc42 §7, P2) : environnements « Local » (Docker Compose) et « Production »
 * (cible Kubernetes), ADR 022. Les conteneurs du modèle ont été ajoutés pour ces vues ;
 * la vue des conteneurs et la section 5 restent à écrire par P1.
 *
 * Affichage : voir docs/arc42/03-contexte.md (Structurizr Lite).
 */
workspace "TicketRush" "Billetterie à forte affluence pour concerts et événements sportifs" {

    model {
        acheteur = person "Acheteur" "Cherche un événement, attend son tour dans la file, réserve et paie une place."
        organisateur = person "Organisateur" "Gère ses événements, ses tarifs et ses ventes ; suit sa vente en direct. Rôles : admin, gestionnaire, lecteur."
        exploitant = person "Exploitant" "Surveille et pilote la mise en vente : SLO, alertes, débit d'admission."

        ticketrush = softwareSystem "TicketRush" "Catalogue, file d'attente virtuelle, réservation des places, paiement, émission des billets, back-office et analytique des organisateurs." {
            // Unités déployables (ADR 001, 002) et briques d'infrastructure (ADR 004, 006, 010, 013, 014, 017).
            passerelle = container "Point d'entrée" "Seule adresse vue par les navigateurs : routage par chemin, limitation de débit par adresse IP, début des traces. Aucune logique métier." "Traefik v3" "Passerelle"
            web = container "Application web" "Application à page unique : catalogue, salle d'attente, réservation, back-office et dashboard des organisateurs. Fichiers servis par Nginx." "React, Vite, Nginx" "Navigateur"
            identite = container "Fournisseur d'identité" "Connexion OpenID Connect (code + PKCE), rôles, identifiant d'organisation dans les jetons." "Keycloak 26"
            fileAttente = container "File d'attente" "Entrée dans la vente, position, admission au débit réglé, jetons d'accès signés, anti-robots." "NestJS, Node.js 24"
            coeur = container "Cœur" "Monolithe modulaire : Catalogue, Réservation, Organisateurs. Réservation atomique, Outbox, projection du catalogue." "NestJS, Node.js 24"
            analytique = container "Analytique" "Traitement en flux des événements de vente, dashboard en direct des organisateurs." "NestJS, KafkaJS" "Prevu"
            baseDeDonnees = container "Base de données" "Source de vérité : un schéma par module du Cœur, Row-Level Security ; base de Keycloak." "PostgreSQL 18" "BaseDeDonnees"
            cache = container "Redis" "File d'attente (sorted set), anti-rejeu des jetons, cache du catalogue, agrégats de l'analytique." "Redis 8, persistance AOF" "BaseDeDonnees"
            broker = container "Broker d'événements" "Événements de vente publiés par l'Outbox, rejouables, registre de schémas." "Redpanda (protocole Kafka)" "File"
            recherche = container "Moteur de recherche" "Modèle de lecture du catalogue public (CQRS)." "Meilisearch" "BaseDeDonnees"
            collecteur = container "Collecteur de télémétrie" "Reçoit traces, métriques et journaux de tous les services et les répartit." "OpenTelemetry Collector"
            observabilite = container "Observabilité" "Stockage et consultation : métriques et SLO, traces, journaux, tableaux de bord et alertes." "Prometheus, Tempo, Loki, Grafana"
        }

        paiement = softwareSystem "Prestataire de paiement" "Autorise et débite les paiements par carte. Simulé et volontairement instable dans le projet." "Externe"
        email = softwareSystem "Service d'envoi d'e-mails" "Remet les billets par e-mail. Fonctionnalité non prioritaire." "Externe,NonPrioritaire"

        acheteur -> ticketrush "Cherche un événement, entre dans la file, réserve, paie, reçoit son billet"
        organisateur -> ticketrush "Publie ses événements et tarifs, suit ses ventes"
        exploitant -> ticketrush "Consulte le tableau de bord de la vente, règle le débit d'admission"
        ticketrush -> paiement "Demande le paiement d'une réservation"
        ticketrush -> email "Demande l'envoi du billet"
        email -> acheteur "Lui remet son billet"

        // Relations entre conteneurs : technologie et protocole sur chaque flèche (cours, C4 niveau 2).
        acheteur -> passerelle "Charge l'application, entre dans la file, réserve" "HTTPS"
        organisateur -> passerelle "Gère ses événements, suit ses ventes" "HTTPS"
        exploitant -> observabilite "Consulte le tableau de bord de la vente, les traces et les alertes" "HTTPS"
        passerelle -> web "Sert les fichiers de l'application (/)" "HTTP"
        passerelle -> identite "Connexion et jetons (/auth)" "HTTP, OpenID Connect"
        passerelle -> fileAttente "Entrée, position, défi anti-robots (/api/file)" "HTTP, REST + JSON"
        passerelle -> coeur "Catalogue, réservation, back-office (/api)" "HTTP, REST + JSON"
        passerelle -> analytique "Dashboard en direct des organisateurs" "HTTP, SSE"
        fileAttente -> cache "Positions, admissions, anti-rejeu, défis" "RESP (Redis)"
        fileAttente -> identite "Clés publiques des jetons utilisateurs (JWKS, en cache)" "HTTP"
        coeur -> baseDeDonnees "Lit et écrit les places, réservations, billets, Outbox" "SQL (protocole PostgreSQL)"
        coeur -> cache "Cache des fiches d'événement" "RESP (Redis)"
        coeur -> recherche "Projette le catalogue, recherche" "HTTP, REST + JSON"
        coeur -> broker "Publie les événements de vente (Outbox) et consomme ceux des autres modules" "Protocole Kafka"
        coeur -> fileAttente "Clés publiques des jetons d'admission (JWKS, en cache)" "HTTP"
        coeur -> identite "Clés publiques (JWKS) et jeton de service pour le paiement" "HTTP, OAuth 2"
        coeur -> paiement "Demande le paiement, avec clé d'idempotence" "HTTPS, REST + JSON"
        analytique -> broker "Consomme les événements de vente" "Protocole Kafka"
        analytique -> cache "Agrégats des fenêtres de temps" "RESP (Redis)"
        identite -> baseDeDonnees "Comptes, rôles, sessions (base keycloak)" "JDBC"
        passerelle -> collecteur "Traces et métriques" "OTLP/HTTP"
        fileAttente -> collecteur "Traces, métriques, journaux" "OTLP/HTTP"
        coeur -> collecteur "Traces, métriques, journaux" "OTLP/HTTP"
        analytique -> collecteur "Traces, métriques, journaux" "OTLP/HTTP"
        collecteur -> observabilite "Répartit vers Prometheus, Tempo et Loki" "OTLP, écriture distante"

        // Environnement local : ce qui est réellement livré et démontré (ADR 022, scénario M-2).
        // Une seule machine, un seul réseau Docker, lancé par « docker compose up ».
        local = deploymentEnvironment "Local" {
            deploymentNode "Poste de développement ou du comité" "Une seule machine ; seuls les ports utiles sont ouverts, sur 127.0.0.1." "Docker Engine ou Docker Desktop" {
                deploymentNode "Projet Compose « ticketrush »" "Un réseau Docker ; démarrage ordonné par les contrôles de santé." "Docker Compose" {
                    deploymentNode "traefik" "Port 8000 de la machine." "traefik:v3.6 · 1 CPU · 256 Mo" {
                        containerInstance passerelle
                    }
                    deploymentNode "web" "Pas de port publié : derrière Traefik." "nginx:alpine · 0,5 CPU · 64 Mo" {
                        containerInstance web
                    }
                    deploymentNode "keycloak" "Domaine importé au premier démarrage ; derrière Traefik sous /auth." "keycloak:26.4 · 2 CPU · 1,5 Go" {
                        containerInstance identite
                    }
                    deploymentNode "file-attente" "Sans état : plusieurs instances possibles (--scale)." "Image construite · 1 CPU · 384 Mo" {
                        containerInstance fileAttente
                    }
                    deploymentNode "coeur" "Migrations et données de démonstration (5 000 places) au démarrage." "Image construite · 2 CPU · 512 Mo" {
                        containerInstance coeur
                    }
                    deploymentNode "faux-paiement" "Arrêté pendant la démo de panne (D-1)." "Image construite · 0,5 CPU · 256 Mo" {
                        softwareSystemInstance paiement
                    }
                    deploymentNode "analytique" "Pas encore livré." "Image construite" "Prevu" {
                        containerInstance analytique
                    }
                    deploymentNode "postgres" "Volume postgres-data." "postgres:18-alpine · 2 CPU · 1 Go" {
                        containerInstance baseDeDonnees
                    }
                    deploymentNode "redis" "Volume redis-data, AOF chaque seconde." "redis:8-alpine · 1 CPU · 512 Mo" {
                        containerInstance cache
                    }
                    deploymentNode "redpanda" "Un nœud ; volume redpanda-data." "redpanda:v25.2 · 1 CPU · 1,5 Go" {
                        containerInstance broker
                    }
                    deploymentNode "meilisearch" "Volume meilisearch-data." "meilisearch:v1.15 · 1 CPU · 512 Mo" {
                        containerInstance recherche
                    }
                    deploymentNode "observabilite" "Image tout-en-un ; Grafana sur le port 3000." "grafana/otel-lgtm:0.41.1 · 2 CPU · 2 Go" {
                        containerInstance collecteur
                        containerInstance observabilite
                    }
                }
            }
        }

        // Cible de production : documentée, démontrée seulement si le bonus Kubernetes est fait
        // (ADR 022). Une région, trois zones de disponibilité.
        production = deploymentEnvironment "Production" {
            deploymentNode "Navigateur" "Poste de l'acheteur ou de l'organisateur." "Chrome, Firefox, Safari" {
                cdn = infrastructureNode "CDN" "Évolution documentée (ADR 015) : sert les fichiers de l'application au plus près des acheteurs." "Réseau de diffusion de contenu" "Prevu"
            }
            deploymentNode "Fournisseur cloud" "Une région, trois zones de disponibilité." "Cloud public" {
                equilibreur = infrastructureNode "Équilibreur de charge" "Terminaison TLS ; répartit entre les trois zones." "Équilibreur de charge du fournisseur"

                deploymentNode "Cluster Kubernetes" "Charges sans état réparties sur les trois zones ; données répliquées entre zones." "Kubernetes" {
                    deploymentNode "Ingress" "Une instance par zone (proposé)." "Traefik · Deployment" "" 3 {
                        containerInstance passerelle
                    }
                    deploymentNode "Application web" "Une instance par zone (proposé)." "Nginx · Deployment" "" 3 {
                        containerInstance web
                    }
                    deploymentNode "Identité" "Deux instances dans deux zones (proposé)." "Keycloak · Deployment" "" 2 {
                        containerInstance identite
                    }
                    deploymentNode "File d'attente" "Mise à l'échelle automatique (HPA) : 3 instances minimum, maximum à fixer au test de charge (ADR 022)." "Deployment + HPA" "" 3 {
                        containerInstance fileAttente
                    }
                    deploymentNode "Cœur" "Une instance par zone ; nombre à ajuster au test de charge (ADR 001, 004)." "Deployment" "" 3 {
                        containerInstance coeur
                    }
                    deploymentNode "Analytique" "Une seule instance (ADR 019, dette D-005)." "Deployment" {
                        containerInstance analytique
                    }
                    deploymentNode "Collecteur" "Un collecteur par nœud du cluster." "OpenTelemetry Collector · DaemonSet" {
                        containerInstance collecteur
                    }
                    deploymentNode "PostgreSQL" "Primaire et réplique de secours dans une autre zone, bascule automatique (ADR 022, dette D-003)." "PostgreSQL 18 · StatefulSet" "" 2 {
                        containerInstance baseDeDonnees
                    }
                    deploymentNode "Redis" "Un primaire, deux répliques, Redis Sentinel sur trois zones (dette D-001)." "Redis 8 · StatefulSet + Sentinel" "" 3 {
                        containerInstance cache
                    }
                    deploymentNode "Redpanda" "Trois brokers, un par zone, réplication 3 (dette D-004)." "Redpanda · StatefulSet" "" 3 {
                        containerInstance broker
                    }
                    deploymentNode "Meilisearch" "Une instance, reconstruisible depuis les événements (point ouvert)." "Meilisearch · StatefulSet" {
                        containerInstance recherche
                    }
                    deploymentNode "Observabilité" "Prometheus, Tempo, Loki et Grafana séparés, dimensionnés chacun (ADR 017)." "StatefulSets" {
                        containerInstance observabilite
                    }
                }
            }
            deploymentNode "Prestataire de paiement" "Hors de notre infrastructure." "Service externe" {
                softwareSystemInstance paiement
            }

            cdn -> equilibreur "Récupère les fichiers absents du cache" "HTTPS"
            equilibreur -> passerelle "Transmet les requêtes" "HTTP"
        }
    }

    views {
        systemContext ticketrush "Contexte" "C4 niveau 1 : TicketRush, ses utilisateurs et ses dépendances externes." {
            include *
            autoLayout lr
        }

        deployment ticketrush local "Deploiement-Local" "Vue de déploiement locale : ce qui tourne avec « docker compose up » (ADR 022)." {
            include *
            autoLayout lr
        }

        deployment ticketrush production "Deploiement-Production" "Vue de déploiement cible : Kubernetes sur trois zones de disponibilité (ADR 022, documentée)." {
            include *
            autoLayout lr
        }

        styles {
            element "Person" {
                shape Person
                background #08427b
                color #ffffff
            }
            element "Software System" {
                background #1168bd
                color #ffffff
            }
            element "Externe" {
                background #999999
                color #ffffff
            }
            element "NonPrioritaire" {
                border dashed
            }
            element "Container" {
                background #438dd5
                color #ffffff
            }
            element "BaseDeDonnees" {
                shape Cylinder
            }
            element "File" {
                shape Pipe
            }
            element "Navigateur" {
                shape WebBrowser
            }
            element "Passerelle" {
                shape Hexagon
            }
            element "Prevu" {
                border dashed
                opacity 60
            }
            element "Deployment Node" {
                background #ffffff
                color #000000
            }
            element "Infrastructure Node" {
                background #dddddd
                color #000000
            }
        }
    }
}
