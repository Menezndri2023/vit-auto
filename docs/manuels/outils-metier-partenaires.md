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
