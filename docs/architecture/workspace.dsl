/*
 * TicketRush — modèle C4 (Structurizr DSL)
 *
 * Le modèle est décrit une fois ; toutes les vues en sont générées.
 * Jalon 1 : vue de contexte (niveau 1).
 * Jalon 2 : conteneurs (ADR 001, 002) ; puis composants du Cœur.
 *
 * Affichage : voir docs/arc42/03-contexte.md (Structurizr Lite).
 */
workspace "TicketRush" "Billetterie à forte affluence pour concerts et événements sportifs" {

    model {
        acheteur = person "Acheteur" "Cherche un événement, attend son tour dans la file, réserve et paie une place."
        organisateur = person "Organisateur" "Gère ses événements, ses tarifs et ses ventes ; suit sa vente en direct. Rôles : admin, gestionnaire, lecteur."
        exploitant = person "Exploitant" "Surveille et pilote la mise en vente : SLO, alertes, débit d'admission."

        ticketrush = softwareSystem "TicketRush" "Catalogue, file d'attente virtuelle, réservation des places, paiement, émission des billets, back-office et analytique des organisateurs."

        paiement = softwareSystem "Prestataire de paiement" "Autorise et débite les paiements par carte. Simulé et volontairement instable dans le projet." "Externe"
        email = softwareSystem "Service d'envoi d'e-mails" "Remet les billets par e-mail. Fonctionnalité non prioritaire." "Externe,NonPrioritaire"

        acheteur -> ticketrush "Cherche un événement, entre dans la file, réserve, paie, reçoit son billet"
        organisateur -> ticketrush "Publie ses événements et tarifs, suit ses ventes"
        exploitant -> ticketrush "Consulte le tableau de bord de la vente, règle le débit d'admission"
        ticketrush -> paiement "Demande le paiement d'une réservation"
        ticketrush -> email "Demande l'envoi du billet"
        email -> acheteur "Lui remet son billet"
    }

    views {
        systemContext ticketrush "Contexte" "C4 niveau 1 : TicketRush, ses utilisateurs et ses dépendances externes." {
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
        }
    }
}
