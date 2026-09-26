# Outils métier et vitrine partenaire — conception

Rédigé le 2026-09-24, à la demande de l'exploitant : adapter l'espace partenaire
et les outils vendus à chaque métier, et faire du profil partenaire partageable
une fonctionnalité commercialisable.

Ce document complète `acces-partenaires.md`, qui décrit le modèle en vigueur
(secteur × entité × plan). **Le modèle ne change pas** — ses trois règles d'or
restent : un plan n'ouvre jamais un secteur, un secteur n'ouvre jamais un outil
payant, le plan ne réduit jamais la commission.

---

## Ce qui a été mesuré avant d'écrire

### Des outils vendus que rien ne verrouille

`src/constants/planFeatures.js` (`OUTILS_PAR_SECTEUR`) annonce 25 outils par
métier sur la page Tarifs. Le serveur n'en fait respecter que **huit routes**,
et seulement pour trois secteurs :

| Secteur | Annoncé | Verrouillé |
|---|:-:|:-:|
| Loueur | 4 | 4 |
| Vendeur | 6 | 2 |
| Exportateur | 7 | **0** |
| Chauffeur | 3 | **0** |
| Loisirs | 5 | **0** |
| Pièces | 0 | — |

Un chauffeur qui souscrit Essentiel pour « Planning et indisponibilités » paie
ce que le palier gratuit lui donne déjà. Ce n'est pas un défaut technique mais
une promesse sans contrepartie — et la source d'un litige le jour où un
partenaire s'en aperçoit.

### La vitrine partenaire ne montre pas la flotte

`/partner/:id` filtrait le catalogue **déjà chargé** dans le navigateur
(`useVehicles()`), lui-même paginé à 100 et filtré sur le pays du visiteur.
Mesuré en production le 2026-09-24, sur le partenaire le plus fourni
(270 annonces) :

| Visiteur | Annonces affichées | Part de la flotte |
|---|:-:|:-:|
| au Maroc | 32 | 12 % |
| **en Côte d'Ivoire** | **0** | **0 %** |
| sans pays détecté | 3 | 1 % |

Un partenaire qui partageait son lien à un client à l'étranger l'envoyait sur
une **page vide**. Impossible de vendre quoi que ce soit au-dessus de ça.

---

## 1. La vitrine partenaire, socle de l'offre

### Le principe

Un partenaire doit pouvoir donner **une seule adresse** — sur une carte de
visite, dans une conversation WhatsApp, sur sa devanture — qui présente tout ce
qu'il propose sur VIT AUTO et permet de réserver, commander ou lancer un import
sans quitter la page.

La flotte affichée est celle du partenaire, **jamais filtrée par le pays du
visiteur** : on regarde CE partenaire, on ne parcourt pas son propre pays. La
requête passe donc par `?owner=<id>&country=INTL`, et non par le catalogue
chargé côté client.

### L'échelle commerciale

| | Gratuit | Essentiel | Business | Premium |
|---|:-:|:-:|:-:|:-:|
| Page publique `/partner/:id` | ● | ● | ● | ● |
| Flotte complète, réservable | ● | ● | ● | ● |
| **Lien court** `vit-auto.com/p/<nom>` | | ● | ● | ● |
| **QR code à imprimer** | | ● | ● | ● |
| Bannière, couleurs, présentation longue | | | ● | ● |
| Showroom personnalisé (PMS) | | | ● | ● |
| **Statistiques de visite** de la vitrine | | | ● | ● |
| Formulaire de contact direct sur la vitrine | | | ● | ● |
| **Nom de domaine propre** | | | | ● |
| Catalogue exportable / API pour revendeurs | | | | ● |

Le socle gratuit reste utile et honnête : la vitrine existe et fonctionne. Ce
qui se vend, c'est de la **rendre partageable et mesurable**, pas de la
débloquer.

### Livré le 2026-09-25

Les deux premières lignes du tableau et la ligne « lien court / QR code » sont
en place.

| Où | Quoi |
|---|---|
| Tableau de bord partenaire | Carte « Ma vitrine à partager », en tête de l'onglet |
| Panneau d'administration | Bouton **🔗 Vitrine** sur chaque ligne de partenaire |
| `/p/<nom>` | Adresse courte, résolue côté serveur puis rendue par la même page |
| QR code | Image PNG téléchargeable, encodant l'adresse courte |

Décision de l'exploitant, prise ce jour-là : **la page reste publique à tous les
paliers.** Elle est déjà atteignable en cliquant le nom d'un partenaire sur une
annonce ; la fermer obligerait à casser ce lien dans le catalogue et priverait
de vitrine les partenaires au palier gratuit — presque tous aujourd'hui. Le
palier ouvre l'adresse **courte** et le **QR code** (`lienCourtVitrine`,
Essentiel), pas la page.

Trois points qui ne se devinent pas à la lecture du code :

- **L'administrateur lit le palier DU PARTENAIRE**, pas le sien. Le passe-droit
  administrateur de `exigeOutil` ne s'applique pas ici : sinon « octroyé selon
  le plan » cesserait de vouloir dire quoi que ce soit dès qu'un admin partage,
  et l'admin verrait une adresse courte que le partenaire n'a pas.
- **Un slug n'est jamais réattribué.** C'est une adresse imprimée sur des cartes
  de visite ; la faire bouger quand le nom change casserait ces cartes.
- **La résolution de `/p/<nom>` ne vérifie aucun palier.** Un lien cesse d'être
  ÉMIS si le palier se ferme, mais un lien déjà imprimé continue de fonctionner
  — le contraire ferait d'un changement de palier une panne pour les clients du
  partenaire, qui n'y sont pour rien.

Jusqu'à `FIN_IMMUNITE_QUOTAS`, tout partenaire garde ses outils : l'adresse
courte est donc ouverte à tous **aujourd'hui**, et la règle prend effet à cette
date, comme les autres outils.

---

## 2. Outils métier par secteur

Règle directrice proposée : **aucune case vide dans la matrice secteur ×
palier.** Si un secteur n'a rien à vendre à un palier, ce palier ne lui est pas
proposé à ce prix. Une garde automatique peut le vérifier, comme celles déjà en
place pour le repli international ou la caution.

### Chauffeur — aujourd'hui sans aucun outil

| Palier | Outil | Pourquoi il se vend |
|---|---|---|
| Essentiel | **Semaine type** — disponibilités récurrentes | Saisir ses horaires une fois plutôt qu'à chaque semaine |
| Essentiel | **Zones tarifaires** — tarif par zone desservie | Un trajet aéroport ne vaut pas un trajet intra-ville |
| Business | **Mise à disposition longue durée** — contrat entreprise, facturation mensuelle | Le revenu récurrent, ce que cherche tout chauffeur professionnel |
| Business | **Société de chauffeurs** — plusieurs chauffeurs sous un compte | Déjà annoncé, jamais verrouillé |
| Premium | **Relais de mission** — passer une course à un confrère du réseau | Ne plus refuser une course = revenu conservé |

### Loisirs — aujourd'hui sans aucun outil

| Palier | Outil | Pourquoi il se vend |
|---|---|---|
| Essentiel | **Calendrier de séances** — capacité par créneau | Éviter le surbooking, qui coûte un client et un avis |
| Business | **Tarifs de groupe** dégressifs et saisonniers | Les groupes sont le gros du chiffre en loisirs |
| Business | **Report météo automatique** plutôt qu'annulation | Une sortie reportée se facture ; annulée, non |
| Business | **Équipe de moniteurs** sous un même compte | Déjà annoncé, jamais verrouillé |
| Premium | **Billet à QR code**, scanné à l'arrivée | Fin des listes papier et des litiges de présence |

### Pièces détachées — secteur ouvert le 14/09, aucun outil

| Palier | Outil | Pourquoi il se vend |
|---|---|---|
| Essentiel | **Alerte de stock bas** | Une pièce vendue mais indisponible = une commande annulée |
| Business | **Import de catalogue par fichier** (jumeau de l'import de flotte) | Un stock de pièces se compte en centaines de références |
| Business | **Devis multi-pièces** avec frais de port par zone | Le panier moyen monte quand on peut chiffrer un lot |
| Premium | **Compatibilité par immatriculation** | Le client saisit sa plaque, on lui montre ce qui va |

### Import / Export — sept outils annoncés, zéro verrouillé

Rien à inventer : le calculateur Incoterms, le suivi de dossier, le séquestre,
les documents LOI et le CRM multi-devises **existent**. Il suffit de les placer
derrière `exigeOutil`. C'est le chantier le plus rentable du lot.

### Location et Vente — compléter l'existant

Location : **état des lieux photo** au départ et au retour (Business) — il
tranche les litiges de caution, qui sont le premier motif de friction.
Vente : **reprise du véhicule du client** (Business) et **simulateur de
financement** (Premium) — deux leviers de conversion mesurables.

---

## 3. Restructurer l'espace partenaire

`VendorDashboard.jsx` fait **5 729 lignes** et sert tous les métiers en masquant
ce qui ne s'applique pas. Un chauffeur ouvre une interface conçue pour une
agence de location, dont on a retiré des morceaux ; son onglet s'appelle
« Annonces » et change seulement d'icône.

Découpe proposée :

```
VendorDashboard  (coquille : en-tête, revenus, messagerie, calendrier, équipe)
  └── EspaceLoueur · EspaceVendeur · EspaceChauffeur
      EspaceLoisirs · EspacePieces · EspaceExport
```

Chaque métier charge son module à la demande. Trois bénéfices concrets :

- le vocabulaire parle le métier — « Mes missions » pour un chauffeur, « Mes
  séances » pour un loisir, pas « Annonces » ;
- un chauffeur ne télécharge pas le code d'une agence de location ;
- **on peut modifier l'espace loisirs sans risquer de casser la location**, ce
  qui est aujourd'hui impossible à garantir dans un fichier de cette taille.

Un partenaire multi-secteurs obtient un sélecteur de métier, pas un empilement.

---

## 4. L'activation reste sur demande

Décision de l'exploitant, et contrainte Apple : **aucun paiement de plan dans
l'application**. La page Tarifs informe et transmet une demande à l'équipe ; un
administrateur active le palier. Les notes de review affirment à Apple qu'aucun
achat n'a lieu dans l'app — y brancher un paiement de fonctionnalités numériques
sans achat intégré vaudrait un rejet au titre de la règle 3.1.1.

Conséquence pratique : chaque outil décrit ici doit fonctionner dès que
l'administrateur pose le palier, sans étape de paiement. C'est déjà le cas de
`exigeOutil`, qui lit l'abonnement actif.

---

## 5. Séquencement proposé

1. **La vitrine affiche la flotte entière.** Sans cela, rien de ce qui précède
   n'est vendable. Correctif mesuré, sans risque.
2. **Verrouiller les treize outils déjà vendus** (export, chauffeur, loisirs).
   Aligne la facturation sur l'offre, supprime un risque de litige.
3. **Lien court et QR code** — le premier vrai argument d'achat d'Essentiel pour
   les métiers qui n'en avaient aucun.
4. **Outils des pièces détachées**, secteur aujourd'hui sans raison de payer.
5. **Découpe de l'espace partenaire**, métier par métier, en commençant par
   celui qui a le moins à perdre (loisirs ou pièces).

Les points 1 et 2 se tiennent en quelques heures. Les suivants méritent d'être
pris un par un, chacun avec sa garde de non-régression.

---

# Révision du 2026-09-26 — ce qui a été rangé

Demande de l'exploitant : verrouiller ce qui est vendu, ranger les outils par
palier, **retirer de la vente ce qui n'en vaut pas la peine**, et proposer des
tarifs de packs cohérents.

## 1. L'audit, outil par outil

Sur les 25 outils annoncés, **neuf n'étaient pas vendables** — pour quatre
raisons distinctes, toutes vérifiées dans le code :

| Outil annoncé | Réalité | Décision |
|---|---|---|
| Planning et indisponibilités (chauffeur) | `Driver.blackoutDates`, ouvert à tous | **Gratuit** |
| Créneaux et capacité par séance (loisirs) | `Activity.capacity`, ouvert à tous | **Gratuit** |
| Fermeture automatique selon la météo | `Activity.weatherDependent`, ouvert à tous | **Gratuit** |
| Prix face au marché (vendeur) | n'existe pas | Retiré |
| Tarifs de groupe et de saison (loisirs) | n'existe pas | Retiré |
| Dossier financement et crédit | routes **admin** uniquement | Retiré |
| Suivi de dossier import/export | c'est le SERVICE, pas un outil d'abonnement | Retiré |
| Documents LOI et accord partenaire | relève de l'onboarding Fondateur | Retiré |
| Mise en avant dans la rubrique (chauffeur, loisirs) | le moteur lit le mérite et les boosts, jamais le plan | Retiré |

Deux entrées de la matrice serveur étaient **déclarées et jamais vérifiées** :

- `carrouselReserve` — retirée. Le moteur de mise en avant ne lit pas le plan.
- `statistiques` — **conservée** : elle EST vérifiée, dans `getPartnerInsights`.

⚠️ **Le deuxième cas m'avait d'abord échappé** : mon inventaire passait par un
`grep … | head -3`, et l'unique occurrence arrivait en quatrième position. J'ai
supprimé une garde réelle avant que `planTiers.test.js` ne me reprenne. La
leçon vaut d'être écrite ici : **ne jamais conclure d'une sortie tronquée.**

## 2. La matrice remise à plat

Le principe retenu : **aucune case vide, sans rien inventer.** Un secteur sans
outil propre à un palier n'est pas laissé vide — il reçoit les avantages
transversaux, qui sont réels et verrouillés (lien court, sièges d'équipe,
export tableur, demandes en avance, API).

| | Gratuit | Essentiel | Business | Premium |
|---|---|---|---|---|
| **Tous** | vitrine, contrat, messagerie, revenus | lien court + QR, classement prioritaire, statistiques d'analyse, 1 place vitrine | 3 sièges, export tableur, demandes en avance, bilan mensuel, 2 places | 10 sièges, API, 3 places, assistance 4 h |
| Location | planning | tarifs saisonniers, promotions | import de flotte, journal d'entretien | synchro du parc par API |
| Vente | — | promotions | CRM, showroom, bilan des ventes | synchro du stock par API |
| Export | 1 prix + 1 Incoterm | **prix par Incoterm** | CRM, demandes en avance | API catalogue revendeurs |
| Chauffeur | planning, zones desservies | — | société de chauffeurs | — |
| Loisirs | créneaux, capacité, report météo | — | équipe de moniteurs | — |
| Pièces | stock et références | — | — | — |

**Le verrou posé** : `incotermsMultiples` (Essentiel). Le secteur Export était
le seul à ne rien verrouiller ; c'est désormais faux. Refus explicite à la
création et à la modification d'une annonce, jamais un filtrage silencieux.

## 3. La garde qui empêche la rechute

`src/constants/planFeatures.coherence.test.js` relit
`server/constants/planFeatures.js` — la matrice qui fait autorité — et refuse :

- un outil annoncé sans nom de garde serveur ;
- une garde qui n'existe pas côté serveur ;
- **un palier annoncé différent du palier imposé** ;
- un libellé sans traduction dans les cinq langues.

Il ne peut pas être satisfait en éditant la page : c'est tout l'intérêt.

## 4. Tarifs des packs — proposition

Les montants étaient les **seuls du site libellés en euros**, figés et non
convertis : un client ivoirien voyait des FCFA partout et « 399 € » ici. Ils
passent par `fmtUSD` et suivent la devise du visiteur.

| Pack | Avant | Proposé | Pourquoi |
|---|---|---|---|
| Silver | 399 € | **390 $** | équivalent, arrondi |
| Gold | 799 € | **890 $** | ×2,3 — il ajoute l'inspection professionnelle (220 $) |
| Platinum | 1 499 € | **1 790 $** | ×2 — dédouanement et conseiller dédié |
| Executive | 2 999 € | **sur devis** | conciergerie 24/7 + financement + assurance : un prix fixe ne tient pas |

Inspection à l'unité : 90 $ / 220 $ / 490 $. L'expertise complète (490 $) coûte
plus que le pack Silver (390 $), ce qui est cohérent : un rapport d'expert
demande plus de travail qu'un accompagnement à l'achat.

**À valider par l'exploitant.** Une seule ligne à changer : `PACKS` dans
`src/pages/ImportExport.jsx`.

## 5. Outils proposés, non construits

Classés par rapport valeur/effort. Aucun n'est annoncé tant qu'il n'existe pas.

| Palier | Outil | Secteur | Pourquoi il se vend |
|---|---|---|---|
| Business | **Report météo** au lieu d'annulation | Loisirs | Une sortie reportée se facture ; annulée, non |
| Essentiel | **Zones tarifaires** — tarif par zone desservie | Chauffeur | Un trajet aéroport ne vaut pas un trajet intra-ville |
| Business | **Mise à disposition longue durée** | Chauffeur | Le revenu récurrent, ce que cherche tout professionnel |
| Premium | **Compatibilité par immatriculation** | Pièces | Le client saisit sa plaque, on lui montre ce qui va |
| Premium | **Billet à QR code** scanné à l'arrivée | Loisirs | Fin des listes papier et des litiges de présence |

Les outils « Pièces » restants sont les plus rentables : le secteur est ouvert
depuis le 2026-09-14 et n'avait **aucun** outil propre.

## 6. Livré le 2026-09-26 — Alerte de stock bas (Essentiel, secteur Pièces)

Premier outil propre au secteur. Le partenaire pose un seuil par référence ;
dès que le stock le franchit, une notification part.

| Où | Quoi |
|---|---|
| `SparePart.seuilStockBas` | Le seuil, par référence. `null` = pas d'alerte |
| `SparePart.alerteStockLe` | Horodatage de la dernière alerte, remis à `null` au réassort |
| `services/partStock.js` | L'alerte est posée dans `reserverStockPiece` — **le seul endroit où le stock descend** |
| `PartSubmit.jsx` | Champ « M'alerter quand le stock descend à », visible seulement si le stock est suivi |
| `FEATURE_MIN_PLAN.alerteStockBas` | `individuel_plus` |

Quatre décisions qui ne se devinent pas à la lecture :

- **On alerte au FRANCHISSEMENT, pas tant qu'on reste dessous.** Sans
  `alerteStockLe`, chaque vente sous le seuil renotifierait et le partenaire
  cesserait de lire ses notifications.
- **La pose du seuil est verrouillée, son RETRAIT ne l'est pas.** On ne piège
  pas un partenaire dans une alerte qu'il ne pourrait plus enlever si son
  abonnement s'arrête.
- **Une pièce « sur commande » (`stock: null`) n'alerte jamais** — il n'y a
  rien à surveiller.
- **La mise à jour est conditionnelle** (`alerteStockLe: null`), donc deux
  commandes simultanées ne produisent qu'une seule notification.

Quatre tests dans `server/tests/spareParts.test.js`, dont un vérifié en
désactivant l'alerte : il passe au rouge.

## 7. Livré le 2026-09-26 — Import du catalogue (Business, secteur Pièces)

⚠️ **Cet outil n'a pas été construit : il EXISTAIT DÉJÀ et était gratuit.**

`POST /api/parts/import` — avec son modèle de fichier téléchargeable, son
écran dans le tableau de bord, son mode simulation et son rapport d'erreurs
ligne par ligne — tournait depuis l'ouverture du secteur, sans aucun verrou.
Je l'ai découvert après avoir écrit **394 lignes d'un second import**, greffé
sur le pipeline d'import de flotte. Ces lignes ont été supprimées : deux
importeurs du même catalogue auraient divergé, comme les deux générateurs de
sitemap avant eux.

**Ce qui a réellement été fait** :

| | |
|---|---|
| `routes/parts.js` | `exigeOutil("importCatalogue")` sur `POST /import` |
| `FEATURE_MIN_PLAN.importCatalogue` | `business` |
| Colonne `seuil_alerte` | Lue à l'import, ignorée si le palier ne l'ouvre pas — l'import ne sert pas de porte dérobée |
| Modèle téléchargeable | Complété de la nouvelle colonne |

Le plan est résolu **une fois pour tout le fichier**, pas à chaque ligne : il
ne change pas au milieu d'un import, et une requête d'abonnement par référence
coûterait cher sur un catalogue de plusieurs centaines de lignes.

**La leçon, écrite ici parce qu'elle se rejouera** : avant de construire un
outil « qui manque », chercher s'il existe déjà sous un autre nom. Le document
de conception le listait comme à construire ; le code disait le contraire.

## 8. Livré le 2026-09-26 — Frais de port par zone (Business, secteur Pièces)

Le catalogue connaissait déjà les **pays desservis** (`shipping.countries`),
mais UN seul forfait pour tous : livrer dans sa propre ville coûtait au client
le même prix qu'à l'autre bout du corridor. Le partenaire perdait les
commandes proches — trop cher — et perdait de l'argent sur les lointaines.

`shipping.zones` porte désormais un forfait, un seuil de gratuité et des
délais **par groupe de pays**. Le pays de destination choisit la zone.

Quatre décisions :

- **Sans zone qui corresponde, on retombe EXACTEMENT sur le forfait unique.**
  Le palier gratuit ne perd rien, et une zone oubliée ne casse pas une vente.
- **Un pays ne peut appartenir qu'à une seule zone.** Deux zones qui se
  chevauchent rendraient le prix impossible à expliquer, au client comme au
  partenaire ; un arbitrage silencieux (la moins chère ? la plus chère ?)
  serait pire que le refus.
- **Le seuil de gratuité de la zone l'emporte** sur le seuil général — sinon
  une commande lointaine deviendrait gratuite au seuil du marché local.
- **Définir des zones demande le palier, les supprimer reste libre.** Même
  règle que le seuil d'alerte : on ne piège pas un partenaire dans une grille
  qu'il ne pourrait plus simplifier.

La saisie se fait en texte, une zone par ligne — `MA: 5 offerte dès 300` —
parce qu'un tableau de champs pour deux ou trois zones coûterait plus de clics
qu'il n'en ferait gagner. Le serveur revalide tout : pays réels, chevauchement,
bornes.

Cinq tests dans `server/tests/spareParts.test.js`, dont deux vérifiés en
neutralisant la recherche de zone : ils passent au rouge.

### Ce qui n'a PAS été fait

Le **devis multi-pièces** de la ligne d'origine reste à construire : une
commande porte aujourd'hui UNE pièce (`Booking.part`), et permettre un panier
de références touche le modèle de commande, le panier et le paiement. C'est un
chantier distinct, pas une variante de celui-ci.

## 9. Livré le 2026-09-26 — État des lieux photo (Business, secteur Location)

`Booking.cautionClaim` permettait déjà au partenaire de **retenir** sur la
caution. Sans aucune preuve attachée : le client n'avait rien à opposer, le
partenaire rien à produire, et l'administration arbitrait parole contre parole.
La caution est le premier motif de friction du secteur.

`Booking.etatDesLieux` porte deux relevés horodatés — départ et retour —
chacun avec ses photos, son kilométrage, son niveau de carburant et ses notes.
Ils ne bloquent rien : une location peut se dérouler sans. Ils rendent une
retenue **défendable**, et une contestation aussi.

Cinq décisions :

- **Un relevé déjà fait n'est jamais réécrit.** Le refaire effacerait
  précisément ce qu'il sert à prouver. Si le partenaire s'est trompé,
  l'administration corrige — pas lui.
- **Le retour exige le départ.** Comparer un état à un état jamais relevé ne
  prouve rien.
- **Au moins une photo**, sinon l'objet même du relevé disparaît.
- **Écriture conditionnelle** : deux enregistrements simultanés ne peuvent pas
  se superposer, le premier arrivé fait foi.
- **Dossier privé** (`FOLDERS.bookingDocs`) : un état des lieux montre des
  plaques, parfois les affaires du client, et reste accessible longtemps après
  la location. Les deux parties sont authentifiées, une URL signée suffit.

Six tests dans `server/tests/bookingCaution.test.js`, à côté de ceux de la
caution — c'est le même sujet. Vérifié en neutralisant la règle d'ordre : le
test passe au rouge.

## 10. Livré le 2026-09-26 — Tarifs de groupe (Business, secteur Loisirs)

**Premier outil payant du secteur loisirs.** Créneaux, capacité et report
météo existaient déjà et sont restés GRATUITS (voir §2) : ce qui manquait,
c'est le levier commercial. Les groupes font le gros du chiffre — un club, une
famille élargie, une sortie d'entreprise — et le partenaire n'avait qu'un prix
par personne, identique pour deux plongeurs comme pour quinze.

`Activity.tarifsGroupe` porte des paliers « à partir de N participants, le
prix par personne devient X ». Le calcul vit dans `services/tarifGroupe.js`,
point de passage unique du devis et du montant facturé — deux calculs
finiraient par diverger, et c'est le client qui découvrirait l'écart au
paiement.

Quatre décisions :

- **Le palier retenu est le PLUS ÉLEVÉ atteint.** « À partir de 10 » l'emporte
  sur « à partir de 5 » quand douze personnes réservent.
- **Les paliers ne sont pas supposés triés.** Le partenaire les saisit dans
  l'ordre qui lui vient ; un tri implicite serait une règle invisible de plus.
- **Un palier plus CHER que le tarif normal est ignoré.** C'est une erreur de
  saisie, jamais une intention : l'appliquer ferait payer un groupe plus cher
  qu'une somme d'individus.
- **Aucun effet sur un forfait de séance ni sur un essai.** Le premier ne
  dépend déjà pas du nombre de participants ; le second est individuel par
  nature et son prix est déjà une faveur.

Huit tests — six sur le calcul pur (`tests/tarifGroupe.test.js`), deux sur la
réservation réelle, le prix étant toujours recalculé côté serveur. Vérifiés en
neutralisant la recherche de palier : quatre passent au rouge.
