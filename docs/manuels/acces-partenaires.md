# Accès des partenaires : secteurs, plans, quotas

Rédigé le 2026-09-14, d'après l'état réel de la plateforme à cette date.
Décisions de l'exploitant du même jour : un partenaire ne voit et ne publie
que dans son secteur ; le cumul de secteurs est un avantage de plan ; les
quotas existent, adaptés au plan, avec immunité de lancement ; le socle
gratuit se limite au strict nécessaire.

## Trois axes, jamais mélangés

| Axe | Répond à | Décide de | Payant |
|---|---|---|---|
| **Secteur** — location, vente, import/export, chauffeur, loisirs | Quel métier ? | Ce que je publie, ce que je vois, mon taux de commission | Non |
| **Type d'entité** — particulier, professionnel, entreprise, concessionnaire | Qui suis-je juridiquement ? | Les documents exigés (KYC seul ou dossier d'entité) | Non |
| **Plan** — Gratuit, Essentiel, Business, Premium, Entreprise | Combien d'outils et de visibilité ? | Fonctionnalités, visibilité, cumul de secteurs, quotas | Oui |

Règles d'or :
- **Un plan n'ouvre jamais un secteur.** Payer Business ne donne pas le droit
  de publier des activités si l'on est loueur : le secteur s'ajoute par une
  demande validée par l'administration (charge documentaire).
- **Un secteur n'ouvre jamais un outil payant.**
- **Le plan ne réduit jamais la commission.** La seule faveur est celle du
  Partenaire Fondateur, liée à la signature de l'accord (12 mois).
- **Même prix pour tous les métiers.** Un seul tarif par palier ; ce qui
  change, c'est le contenu affiché sur la page Tarifs selon le secteur.

## Le socle commun (Gratuit, tous secteurs)

Le strict nécessaire pour encaisser une première transaction :
compte et KYC, dossier d'entité selon le type, profil partenaire public,
publication **dans son secteur uniquement**, réception des demandes et
réservations de son secteur, messagerie supervisée, calendrier et congés,
reversements, factures, contrats, signalement, notifications, réservations
personnelles.

## Périmètre par secteur

| Module de l'espace partenaire | Loueur | Vendeur | Exportateur | Chauffeur | Loisirs |
|---|:-:|:-:|:-:|:-:|:-:|
| Mes véhicules — annonces **location** | ● | | | | |
| Mes véhicules — annonces **vente**, demandes d'essai | | ● | | | |
| Annonces import/export, pipeline IE, LOI/accord, Incoterms, séquestre | | | ● | | |
| Profil chauffeur, permis, propositions d'embauche, planning | | | | ● | |
| Mes activités, créneaux, capacité, fermeture météo | | | | | ● |
| Tarifs saisonniers, promotions, journal du véhicule | ● | ● | | | |
| Clientèle | ● | ● | ● | | ● |

**Le serveur refuse ce que le dashboard masque** (`server/utils/perimetre.js`,
code `SECTEUR_REQUIS`) : la création d'une annonce véhicule (location →
loueur, vente → vendeur), d'une activité (loisirs), d'un profil chauffeur
(chauffeur), d'une annonce export ou la conversion d'un véhicule en export
(exportateur). Un compte historique sans secteur déclaré n'est pas bloqué :
il déclare son secteur à sa première demande.

**Un loueur qui propose ses véhicules avec chauffeur** utilise l'option
« avec chauffeur » de son annonce de location — ce n'est pas un second
métier. Le partenaire chauffeur, lui, est un secteur à part entière, avec sa
commission (15 % / 10 % fondateur).

## Cumul de secteurs et quotas — par plan

| | Gratuit | Essentiel | Business | Premium |
|---|:-:|:-:|:-:|:-:|
| Secteurs cumulables | 1 | 1 | 2 | tous |
| Annonces actives par secteur | 5 | 15 | 60 | illimité |
| Mises en avant incluses / mois | 0 | 2 | 6 | 6 |
| Places en vitrine d'accueil | 0 | 1 | 2 | 3 |
| Statistiques | | ● | ● + export CSV | ● |
| 1ʳᵉ réponse support | 72 h | 48 h | 24 h | 4 h |
| Sièges d'équipe | 1 | 1 | 3 | 10 |
| Demandes clients 2 h en avance | | | ● | ● |
| Bilan mensuel par e-mail | | | ● | ● |
| Accès API | | | | ● |

Source unique : `server/constants/planFeatures.js` (`PLAN_SECTEURS`,
`PLAN_QUOTA_ANNONCES`), miroir d'affichage dans `src/constants/planFeatures.js`.

**Immunité de lancement** : jusqu'au **10 septembre 2027**
(`FIN_IMMUNITE_QUOTAS`), aucun quota ne s'applique, quel que soit le plan —
même durée que l'offre fondateur et la vitrine partenaires gratuite. Au-delà,
les Partenaires Fondateurs restent exemptés pendant leurs douze mois (dossier
signé, `lockedAt` posé). Le quota ne dépublie jamais l'existant : il bloque
la publication au-delà, à la création, avec le code `QUOTA_ANNONCES` et un
renvoi vers la page Tarifs. Un membre d'équipe consomme le quota du titulaire.

Les identifiants de plan en base restent `free`, `individuel_plus`,
`business`, `exportateur` ; seuls les noms commerciaux ont changé
(« Individuel Plus » → Essentiel, « Exportateur » → Premium), parce qu'un
palier ne doit porter ni un nom de métier ni un type d'entité.

## Ajouter un secteur — parcours

1. Espace partenaire → « Mes secteurs » → choisir le secteur, décrire ce
   qu'on compte y publier → **Demander l'ajout**. Refusé immédiatement si le
   plan est au maximum (`PLAN_REQUIS`) ou si une demande est déjà en cours.
2. L'administration est notifiée (`sector_requested`) → Admin → onglet
   **Secteurs** : contexte du compte (secteurs actuels, type d'entité, KYC,
   certification, pays), motif, note facultative → **Accorder** ou
   **Refuser**. La limite du plan est revérifiée à l'approbation.
3. Le partenaire est notifié (`sector_approved` / `sector_rejected` avec la
   note). Le secteur apparaît dans son espace ; il peut y publier.

Routes : `GET /api/partner-sectors/me`, `POST /api/partner-sectors/requests`,
`GET|PATCH /api/partner-sectors/admin/requests[/:id]` (portée admin
`partners`). Modèle : `PartnerSectorRequest`.

## Outils par secteur, rattachés aux plans

Ce que la page Tarifs montre à chaque métier (`OUTILS_PAR_SECTEUR`). Tout ce
qui y figure **existe**. Ce qui suit « à construire » n'y figure pas — la page
ne vend pas de « bientôt ».

| Secteur | Essentiel | Business | Premium |
|---|---|---|---|
| Loueur | tarifs saisonniers, promotions | import de flotte, gestion de parc (planning, entretien, journal) | synchronisation API |
| Vendeur | prix face au marché | CRM (essais, leads, devis), showroom, bilan mensuel | API stock, financement/crédit |
| Exportateur | calculateur Incoterms | suivi de dossier, demandes en avance, LOI/accord | CRM export, API catalogue, coût d'import client |
| Chauffeur | profil mis en avant, planning | société de chauffeurs (équipe) | — |
| Loisirs | mise en avant, créneaux/capacité | fermeture météo, tarifs groupe/saison, équipe de moniteurs | — |

À construire (non vendus) : multi-agences/multi-pays et tarification selon
l'occupation (loueur) ; relance automatique des leads dormants (vendeur) ;
séquestre prioritaire (exportateur) ; dispatch des missions (chauffeur) ;
multi-sites et bons cadeaux (loisirs).

## Ce que cette version ne fait pas encore

- **Verrouillage serveur des outils par secteur et par plan.** Les outils
  ci-dessus sont *présentés* par palier ; plusieurs restent aujourd'hui
  accessibles à tous (import de flotte, PMS, showroom, tarifs saisonniers).
  Prochaine étape : une entrée `FEATURE_MIN_PLAN` par outil et
  `exigeFonctionnalite(...)` sur sa route — un compte gratuit reçoit alors
  plus que promis, jamais moins.
- **Retrait d'un secteur** par le partenaire ou l'administration.
- **Quota vu depuis le formulaire de publication** : le refus arrive à
  l'envoi, avec le message du serveur ; un compteur avant saisie serait plus
  aimable.
