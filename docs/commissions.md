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
| Pièces détachées, en stock | `piece` | **5 %** | commande réglée / réception |
| Pièces détachées, importées à la commande | `piece_import` | **5 %** | idem |
| Chauffeurs professionnels | `chauffeur` | **10 %** | course réglée / clôturée |
| Activités et loisirs | `activite` | **10 %** | réservation réglée / clôturée |
| Logistique (transport, transit, douane) | `services.transport`, `services.transit`, `services.douanes` | **aucune** (taux non décidé) | — |
| Leasing | `leasing` | 5 % (hors barème du 2026-10-27, inchangé) | — |

## Règles

- **Pas de cumul.** Chaque transaction prend **une** clé, choisie une seule fois
  (`cleCommission` dans `bookingController.js`, `"import_export"` dans
  `ieTransactionController.computeIeCommission`). Une vente export paie 3 %, pas 2 % + 3 % ;
  une pièce importée paie 5 %, pas 5 % + 3 %.
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
| Location, chauffeur, loisirs | **montant total** de la réservation : prix + options (GPS, siège, assurance…) + frais de livraison − remise fidélité | caution (hors total, réglée au partenaire) |

⚠️ **À valider par l'exploitant** : pour la location, le chauffeur et les loisirs,
l'assiette inclut les options et la livraison. Si seule la prestation doit être taxée,
c'est une modification de `createBooking` et des trois recalculs du règlement
(`assietteCommission`). Elle n'est pas faite tant qu'elle n'est pas décidée.

Les frais de service client (0,5 %, minimum 1 $US, maximum 25 $US) sont payés par le
**client** ; ce n'est pas une commission partenaire.

## Partenaire Fondateur

Le mécanisme reste en place : `foundingPartner.entreprise|particulier` dans `PricingConfig`,
pendant `durationMonths` (12) à compter de `PartnerOnboarding.commissions.lockedAt`.
Depuis le 2026-10-27, ses taux sont **égaux** au standard. Chaque ligne de la nouvelle
grille est égale ou inférieure à l'ancien taux fondateur, donc aucun fondateur ne paie plus
qu'avant.

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
| **2026-10-27** | **grille unique** 10 / 2 / 3 / 10 / 10, pièces 5 % |
