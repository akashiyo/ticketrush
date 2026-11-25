# 12. Glossaire (langage omniprésent)

> Première version, avant l'Event Storming. Un terme = un sens, dans un contexte donné. Les mêmes
> mots sont utilisés dans le code (`siege`, `billet`, `reservation`…).
>
> Les termes marqués ⚠ ont aujourd'hui deux noms ou deux sens dans les documents : à fixer à l'atelier.

| Terme                         | Contexte         | Définition                                                                                     |
| ----------------------------- | ---------------- | ---------------------------------------------------------------------------------------------- |
| **Acheteur**                  | Tous             | Personne connectée qui cherche, attend, réserve et paie. Un compte = un acheteur              |
| **Organisation**              | Organisateurs    | Le client de TicketRush (producteur, club, salle). C'est l'unité d'isolation des données (tenant) |
| **Organisateur**              | Organisateurs    | Membre d'une organisation, avec le rôle admin, gestionnaire ou lecteur                         |
| **Exploitant**                | Exploitation     | Membre de l'équipe TicketRush qui surveille et pilote la plateforme pour tous les organisateurs |
| ⚠ **Événement**               | Catalogue        | Le spectacle mis en vente : concert, match, à une date, dans une salle. À ne pas confondre avec un **événement du domaine** |
| ⚠ **Événement du domaine**    | Tous             | Un fait passé publié par un contexte (`PlaceBloquee`, `BilletEmis`). Nom au participe passé   |
| **Salle**                     | Catalogue        | Lieu physique qui accueille des événements                                                      |
| **Plan de salle**             | Catalogue        | Découpage d'une salle en catégories et en places pour un événement                              |
| **Catégorie**                 | Catalogue        | Groupe de places au même tarif : « Fosse », « Catégorie 1 »…                                   |
| ⚠ **Place / siège**           | Réservation      | L'unité vendue. **Siège** : place numérotée choisie par l'acheteur. **Placement libre** (fosse) : place non numérotée, attribuée automatiquement. La table s'appelle `siege` pour les deux |
| **Tarif**                     | Organisateurs    | Prix d'une catégorie pour un événement                                                          |
| **Mise en vente** (vente)     | File, Réservation | La période pendant laquelle les places d'un événement sont vendues, à partir de l'ouverture   |
| **Ouverture**                 | File d'attente   | L'instant où les admissions commencent                                                          |
| **Salle d'attente**           | File d'attente   | Page où patientent les acheteurs arrivés avant l'ouverture. Leur rang est tiré au sort         |
| **File (d'attente)**          | File d'attente   | L'ordre de passage des acheteurs d'une vente. Une seule position par compte                    |
| **Position**                  | File d'attente   | Rang de l'acheteur dans la file, avec son temps d'attente estimé                               |
| **Admission**                 | File d'attente   | Sortie de la file : l'acheteur reçoit le droit de réserver. Une admission n'est **pas** une réservation |
| **Débit d'admission**         | File d'attente   | Nombre d'acheteurs admis par seconde. Réglage de capacité                                       |
| **Défi (preuve de travail)**  | File d'attente   | Calcul imposé au navigateur avant l'entrée dans la file, contre les robots (ALTCHA)            |
| ⚠ **Jeton d'accès / jeton d'admission** | File → Réservation | JWT signé par la File à l'admission : acheteur, vente, valable 10 min, usage unique. Les deux noms circulent : en garder un |
| **Blocage**                   | Réservation      | Réservation temporaire d'une place pour un acheteur, pendant 10 min, le temps de payer          |
| **Expiration**                | Réservation      | Fin d'un blocage non payé : la place redevient réservable                                       |
| **Réservation**               | Réservation      | L'ensemble des places bloquées par un acheteur et leur paiement                                 |
| **Paiement**                  | Réservation      | Demande de débit au prestataire, identifiée par une clé d'idempotence                           |
| **Billet**                    | Réservation      | Preuve d'achat d'une place, émise après paiement accepté. Une place = au plus un billet          |
| **Survente**                  | Réservation      | Vendre une place deux fois, ou plus de billets que de places. Interdit : c'est l'invariant de C-1 |
| **Journal d'audit**           | Organisateurs    | Trace en ajout seul de chaque modification du back-office : qui, quoi, quand, avant, après     |
