# ADR 012 — Protection contre les robots et les doublons : preuve de travail ALTCHA et défense en profondeur

Statut : Proposé (2026-11-24) · Responsable : P2

## Contexte

Le sujet exige une **protection contre les robots et les accès en double** dans la file d'attente. Lors des vraies mises en vente, des robots tentent d'occuper les premières places pour revendre les billets plus cher. Ils vident aussi la file de son sens pour les acheteurs humains (E-1).

Scénarios concernés :
- **S-1** : un client automatisé sans preuve de travail valide est refusé dans 100 % des cas à l'entrée de la file.
- **E-1** : aucun compte n'a deux positions.

Contraintes :
- la solution doit tourner **dans le Docker Compose**, sans service externe (M-2) ;
- elle ne doit pas **collecter de données personnelles** inutiles (RGPD) ;
- elle ne doit pas ruiner l'expérience des humains au pire moment (P-1).

## Décision

Aucune mesure ne suffit seule. Nous empilons **quatre couches indépendantes** (défense en profondeur, cours partie 9) :

| Couche | Mécanisme | Ce qu'elle arrête |
|---|---|---|
| 1. Point d'entrée | **Limitation de débit Traefik** par adresse IP sur l'entrée de la file | Le martèlement massif depuis une même source |
| 2. Coût d'entrée | **ALTCHA** : une preuve de travail calculée par le navigateur avant d'entrer dans la file | Les robots qui créent des milliers d'entrées : chaque entrée leur coûte du calcul |
| 3. Identité | **Compte obligatoire** (ADR 010) | Les acheteurs anonymes et jetables |
| 4. Unicité | **Une position par compte** (`ZADD NX`, ADR 008) et **jeton lié à l'acheteur** (ADR 011) | Les doublons et les admissions revendues |

**Fonctionnement d'ALTCHA :**
1. Le serveur délivre un défi signé (HMAC), avec une difficulté réglable.
2. Le navigateur cherche la solution : environ une seconde de calcul sur un téléphone, invisible pour l'acheteur, qui n'a rien à cliquer.
3. Le serveur vérifie la solution très vite, sans conserver d'état, sauf l'identifiant du défi, gardé dans Redis pour qu'il ne serve qu'une fois.
4. **La difficulté peut être augmentée pendant la vente** si un afflux de robots est détecté.

## Alternatives écartées

- **reCAPTCHA, hCaptcha ou Cloudflare Turnstile.** Ce sont des services tiers : appel externe à chaque entrée, transmission de données de navigation à un tiers (RGPD), et indisponibles si la démo tourne hors ligne. Les captchas visuels sont aussi pénibles et peu accessibles.
- **La limitation de débit seule.** Un robot réparti sur des centaines d'adresses IP la contourne sans effort.
- **L'empreinte de l'appareil (fingerprinting).** C'est intrusif et discutable au regard du RGPD. Les robots la falsifient facilement.
- **Une vérification d'identité forte (SMS, pièce d'identité).** Elle est efficace, mais disproportionnée et coûteuse pour un projet, et elle ralentit les humains.

## Conséquences

- \+ Chaque entrée dans la file coûte du calcul : un robot qui voulait 10 000 positions doit fournir 10 000 fois ce calcul, alors qu'un humain ne le paie qu'une fois.
- \+ Tout est auto-hébergé, sans donnée transmise à un tiers ni appel externe.
- \+ La difficulté réglable donne un levier pendant la vente, sans redéployer.
- − La preuve de travail **ralentit** les robots, elle ne les arrête pas : un attaquant avec beaucoup de puissance de calcul paiera le prix. Elle se combine aux comptes et à l'unicité par compte pour rester efficace.
- − Sur un téléphone ancien, le calcul peut prendre plusieurs secondes. La difficulté doit être calibrée sur un appareil modeste.
- − Le test de charge doit résoudre aussi les défis, ou utiliser un mode de test documenté qui les désactive. Il faut le signaler dans le rapport de charge.
