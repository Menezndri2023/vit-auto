# Commissions VIT AUTO — référence unique

> Décision de l'exploitant du **2026-10-27**. Ce document remplace toutes les grilles
> antérieures citées ailleurs dans `docs/` et `ARCHITECTURE.md` (15/10, 5/3, 10/7…),
> conservées seulement comme historique.

## Barème

Une seule grille, pour **tous** les partenaires : Partenaires Fondateurs, abonnés et
comptes gratuits paient le même taux.

| Activité | Clé `PricingConfig` | Taux | Fait générateur |
|---|---|---|---|
| Location de véhicules | `location` | **10 %** | réservation réglée / clôturée |
| Vente de véhicules (demande d'essai, essai) | `vente` (`essai` → `vente`) | **2 %** | vente déclarée par le partenaire puis confirmée par l'admin, dans la fenêtre d'attribution de 90 jours |
| Vente d'un véhicule à l'export (annonces import-export) | `import_export` | **3 %** | libération des fonds de la transaction IE |
| Pièces détachées, vente locale (en stock, livrée dans le pays du vendeur) | `piece` | **5 %** | réception confirmée par le client |
| Pièces détachées, vente à l'export (importée à la commande **ou** livrée hors du pays du vendeur) | `piece_import` | **7 %** | idem |
| Chauffeurs professionnels | `chauffeur` | **10 %** | course réglée / clôturée |
| Activités et loisirs | `activite` | **10 %** | réservation réglée / clôturée |
| Logistique (transport, transit, douane) | — | **aucune** — mise en relation gratuite verrouillée (`FREE_REFERRAL`, voir `docs/logistique.md`) | — |
| Leasing | `leasing` | 5 % (hors barème du 2026-10-27, inchangé) | — |

## Les six pôles

| Pôle | Clés de taux | Taux |
|---|---|---|
| VIT-AUTO Rental (location courte et longue durée) | `location`, `leasing` | 10 % (leasing 5 %, hors barème) |
| VIT-AUTO Sales (concessionnaires, vendeurs, particuliers) | `vente` (demande d'essai, essai) | 2 % |
| VIT-AUTO Trade (importateurs, exportateurs, B2B) | `import_export` (vente d'un véhicule à l'export) ; logistique gratuite | 3 % ; logistique 0 |
| VIT-AUTO Parts (vendeurs, distributeurs, grossistes) | `piece` (local), `piece_import` (export) | 5 % / 7 % |
| VIT-AUTO Mobility (chauffeurs, transferts, services avec chauffeur) | `chauffeur` | 10 % |
| VIT-AUTO Experiences (loisirs, excursions, quad, buggy, karting) | `activite` | 10 % |

Tous reliés par **VIT-AUTO Marketplace** (catalogue, compte, recherche communs).

## Règles

- **Pas de cumul.** Chaque transaction prend **une** clé, choisie une seule fois
  (`cleCommission` dans `bookingController.js`, `"import_export"` dans
  `ieTransactionController.computeIeCommission`). Une vente export paie 3 %, pas 2 % + 3 % ;
  une pièce exportée paie 7 %, pas 7 % + 3 %. Le caractère « export » d'une pièce est figé
  sur la commande (`Booking.piece.international`) à sa création.
- **Logistique.** Aucune commission automatique tant que son modèle (commission
  contractuelle, forfait de mise en relation ou de coordination) n'est pas décidé. Le prix
  du transport reste celui du prestataire.
- **Taux figé.** Le taux est enregistré sur la transaction à sa création
  (`Booking.commissionRate`, `SalesLead.commission.rate`, `IETransaction`). Changer la grille
  ne recalcule **jamais** une transaction existante.
- **Serveur seul juge.** Le moteur est `resolveCommissionRate(type, partnerId)`
  (`server/services/pricingEngine.js`). Le front n'affiche que des estimations lues sur
  `GET /api/pricing/config`.
- **Idempotence.** Une ligne `CommissionLedger` par transaction (`transactionId` +
  `transactionType`) : rejouer un webhook ou une déclaration ne crée pas de seconde ligne.

## Assiette (base de calcul) — état réel du code

| Activité | Assiette | Exclu |
|---|---|---|
| Pièces | prix des pièces (`montantBase`) | livraison, frais d'importation |
| Vente (demande d'essai) | prix de vente final déclaré, converti en USD | — |
| Export (IE) | part exportateur du paiement (`ventilation.exportateur`) ; en achat direct, le prix du véhicule seul | logistique, droits et taxes, frais VIT AUTO |
| Location, chauffeur, loisirs | prix de la prestation + options **fournies par VIT AUTO** − remise fidélité | options fournies par le partenaire (son assurance, son GPS…), livraison, caution |

Règle de l'exploitant du **2026-10-27**. Le fournisseur de chaque option se règle dans
l'admin (Configuration métier → « Fournisseur des options », `PricingConfig.
rentalOptionsFournisseur`). Aujourd'hui, **toutes** les options sont fournies par le
partenaire : l'assiette d'une location est donc son prix seul (moins la remise fidélité).
Passer une option sur « VIT AUTO » uniquement quand VIT AUTO fournit réellement le service
(par exemple l'assurance via l'assureur partenaire de VIT AUTO).

La règle est figée sur la réservation (`Booking.assietteRegle`, `montantOptionsVitAuto`).
Une réservation créée avant le 2026-10-27 garde sa commission sur le montant total.
Recalcul au règlement ou au changement de dates : `assietteCommission` retire du montant
final la livraison et la part des options fournie par le partenaire.

Les frais de service client (0,5 %, minimum 1 $US, maximum 25 $US) sont payés par le
**client** ; ce n'est pas une commission partenaire.

## Partenaire Fondateur

Le mécanisme reste en place : `foundingPartner.entreprise|particulier` dans `PricingConfig`,
pendant `durationMonths` (12) à compter de `PartnerOnboarding.commissions.lockedAt`.
Depuis le 2026-10-27, ses taux sont **égaux** au standard. Chaque ligne de la nouvelle
grille est égale ou inférieure à l'ancien taux fondateur, **sauf** la pièce à l'export
(5 % fondateur → 7 %, choix explicite de l'exploitant).

L'avantage fondateur est désormais :
- outils avancés de l'espace pro offerts 12 mois (`services/fondateur.js`, `planAccess.js`) ;
- accompagnement au lancement ;
- badge et mise en avant.

Si un tarif fondateur **distinct** est décidé un jour, il suffit de le saisir dans l'admin
(Configuration métier). La page Tarifs, la LOI et l'Accord réaffichent alors d'eux-mêmes
la colonne « Fondateur » et la mention « retour au standard ».

## Mise en production

- Migration automatique au démarrage : `grille-commissions-unique-2026-10-27`
  (`server.js` → `scripts/setCommissionRates.mjs`, `appliquerGrilleUnique`). Elle réécrit
  uniquement les clés du barème dans le document `PricingConfig` « global », conserve
  `leasing` et tout le reste, et réaligne `PartnerOnboarding.commissions.vente` de 3 à 2
  (uniquement les dossiers à 3 : un taux négocié n'est pas touché).
- Vérification à la main, en lecture seule : `node server/scripts/setCommissionRates.mjs`
  (simulation par défaut).
- Retour arrière : ressaisir les anciens taux dans l'admin (Configuration métier). Les
  transactions créées entre-temps gardent leur taux figé.

## Historique

| Date | Grille |
|---|---|
| 2026-09-12 | standard 15 / 5 / 5 / 15 / 15 — fondateur 10 / 3 / 3 / 10 / 10 (location / vente / export / chauffeur / loisirs) |
| 2026-09-14 | + pièces 10 % / 7 %, importation 7 % / 5 % |
| **2026-10-27** | **grille unique** 10 / 2 / 3 / 10 / 10, pièces 5 % local / 7 % export |

## Grille versionnée, taux conservé, préavis (décision de l'exploitant, 2026-10-30)

**Taux conservé.** Chaque réservation porte `commissionFigee: true` et `grilleVersion` dès sa
création ; au règlement (transaction, confirmation partenaire, clôture forcée), le taux de
création est réutilisé. Avant le 2026-10-30, il était **recalculé** au règlement avec la
grille du moment (`bookingController.js`, `tauxAuReglement`). Les réservations antérieures
sans l'indicateur gardent ce recalcul ; la migration
`taux-conserves-reservations-ouvertes-2026-10-30` pose l'indicateur sur les réservations
ouvertes créées depuis la grille du 27/10.

**Versions.** Les sections `commissions` et `foundingPartner` ne s'éditent plus à chaud :
`PATCH /api/admin/business-config/pricing/:section` crée une version (`GrilleTarifaire`),
notifie les partenaires réels (espace + e-mail : version, date d'envoi, date d'effet, lignes
modifiées) et répond 202. Une **hausse** prend effet au plus tôt **30 jours** après ; une baisse
peut être immédiate (`immediat: true`). La version s'applique d'elle-même à sa date (vérifiée
dans `getConfig`). Liste : `GET …/pricing/grilles` ; annulation : `PATCH …/grilles/:id/annuler`.
Le délai de 30 jours est une règle interne : sa validité juridique, au regard des contrats et
du droit applicable, reste à confirmer.

**Pièces détachées (confirmé par l'exploitant le 2026-10-30).** Ce sont des **ventes**, pas des
réservations : vente locale **5 %**, vente à l'export **7 %**, pour **tous** les partenaires,
fondateurs compris. Aucune suspension, aucune notification particulière.

Constats de l'audit (code) :
- grille fondateur avant le 27/10 : pièces 7 % / export 5 % ; après : 5 % / 7 % (une baisse,
  une hausse), appliquée immédiatement à la publication du 28/10, sans préavis ;
- la LOI générée avant le 27/10 ne citait que location, vente et chauffeur : **aucun taux de
  pièces n'était contractuel** ; depuis, le texte cite la grille complète ;
- le texte signé est conservé (`PartnerOnboarding.loi.content` / `agreement.content`, figés
  avant signature, avec leur empreinte SHA-256) et c'est lui que servent les PDF.

## Commission minimale : aucune (décision provisoire, 2026-10-28)

Commission = assiette × taux de la grille, arrondie au centime. Aucun plancher, nulle part :
ni dans `resolveCommissionRate`, ni dans `bookingController` (création, règlement,
confirmation, clôture forcée), ni dans `salesLeadService.declareSale`, ni dans
`computeIeCommission`, ni dans les factures. Garanti par `tests/commissionSansMinimum.test.js`.

Seul repli existant, qui n'est pas un plancher : un type absent de la grille prend
5 % (`?? 0.05` dans `pricingEngine.resolveCommissionRate`).

**Si un minimum est décidé un jour**, il se configurerait à un seul endroit :
une section `commissions.minimums` de `PricingConfig` (par catégorie et par devise), lue
par une fonction unique `appliquerMinimum(cle, montant, devise)` dans `pricingEngine.js`,
appelée là où `commissionAmount` est calculé. La décision doit préciser : catégories,
montant, devise, exceptions (fondateurs compris), date d'effet, et sort des opérations
en cours. Rien de cela n'existe aujourd'hui.

## Frais de service : SUSPENDUS (décision de l'exploitant, 2026-10-30)

Les deux frais de service sont suspendus tant que leur nature, leur payeur, leur montant et
leurs conditions ne sont pas validés :

| Frais | Barème conservé (inactif) | Ce qui se passait |
|---|---|---|
| `serviceFee` (réservations) | 0,5 %, min 1 $US, max 25 $US | retiré du reversement partenaire, affiché au client (1 $US fixe) |
| `importEstimateFee` (achat export) | 3 %, min 333 $US, max 1 666 $US | ajouté au total acheteur, **en plus** des 3 % de commission exportateur |

- Interrupteur `actif` dans chaque section de `PricingConfig` ; **absent = suspendu** (c'est
  l'état du document de production). `computeServiceFee` et `computeImportEstimateFee`
  renvoient 0.
- Au règlement d'une réservation (transaction, confirmation, dates, prolongation, clôture
  forcée), `fraisServiceAuReglement` retient 0 pendant la suspension — y compris pour une
  réservation créée avec 1 $US figé — et réécrit `serviceFeeFCFA` en conséquence.
- Interfaces : plus aucune ligne « Frais de service » quand le montant est nul ; la page
  Import/Export l'annonce seulement si le serveur dit le frais actif.
- Les réservations et transactions **terminées** gardent leurs montants historiques.
- Réactiver = décision explicite (`actif: true`) ; ne jamais cumuler automatiquement frais et
  commission. Tests : `tests/fraisServiceSuspendus.test.js`.

<details><summary>Constat d'origine (2026-10-28)</summary>

⚠️ **Écart à trancher : le frais de service.** La phrase ci-dessus (« payés par le client »)
ne correspond pas au serveur : `bookingController` le **retire du reversement partenaire**
(`partnerPayout = total − commission − serviceFee`) sans l'ajouter au total client, alors
que la page de réservation l'ajoute au total client (1 $US fixe, même pour un essai). Ce
frais a un plancher de 1 $US : c'est le seul montant plancher de la plateforme.

</details>
