# Vente par demande d'essai — architecture (2026-09-12)

Ce document est le plan livré AVANT le code, puis tenu à jour avec ce qui a été
construit. Il répond point par point à la consigne « avant de coder, fournir… ».

## 0. Deux « ventes » distinctes — ne pas les confondre

| | Vente classique (ce document) | Vente à l'import (inchangée) |
|---|---|---|
| Annonce | `Vehicle` avec `type:"vente"`, véhicule situé dans le pays du visiteur | `ImportExportListing` (et `Vehicle` dont `country` est un pays d'origine d'import) |
| Parcours | Visibilité → lead → **demande d'essai** → RDV → essai → opportunité → vente conclue **hors plateforme** | Réservation gratuite + négociation, ou **achat direct** au prix affiché, paiement escrow sur la plateforme (`IETransaction`, 14 étapes) |
| Commission | 3 % du prix final déclaré, due uniquement si vente conclue dans la fenêtre d'attribution | `commissions.*.import_export`, prélevée à la libération des fonds |
| Code | `SalesLead` (nouveau) | `ieTransactionController.js`, `createDirectPurchase` |

Le CTA de la fiche véhicule tranche : `estAImporter` (pays d'origine d'import ≠ pays
du visiteur) → « Acheter à l'import » (flux IE) ; sinon `isSale` → **« Demander un
essai »** (ce flux). La location, le chauffeur et les loisirs ne sont pas touchés.

## 1. Architecture proposée

Un **nouveau domaine** `SalesLead`, à côté de `Booking` et non dedans :

- `Booking` type `essai` porte validation admin, pièces d'identité, score de
  fraude, contrat, paiement — tout ce qu'un lead ne doit PAS exiger (« ne pas
  demander trop d'informations », « traiter une demande en quelques secondes »).
  Son enum `status` est référencé à 15+ endroits ; y greffer 15 statuts de plus
  aurait cassé les filtres et badges existants. Il reste en place pour
  l'historique et n'est plus relié depuis la fiche véhicule.
- `Lead` (PMS) est le CRM privé du partenaire (statuts nouveau→gagne, budget,
  Incoterm, devis). Il n'est pas le lead marketplace suivi par VIT AUTO.

Architecture générique : le workflow vit dans `server/constants/leadWorkflows.js`
sous la clé `SALE_TEST_DRIVE` (statuts, transitions, libellés, résultats). Chaque
lead porte `workflow:"SALE_TEST_DRIVE"` ; le service ne connaît que la table de
transitions du workflow du lead. Un futur workflow (ex. `LEASING_REQUEST`,
`FLEET_QUOTE`) s'ajoute par une entrée dans cette table, sans toucher au modèle.

Réutilisé, pas dupliqué : `notify()` (in-app + push + filet e-mail),
`queue.enqueue` e-mail/SMS/WhatsApp (clients invités sans compte), `notifyAdmins`,
`CommissionLedger` (`transactionType:"sale"`, prévu et jamais alimenté),
`PricingConfig` (bloc `salesLead` éditable admin), pattern `partnerResponseReminders`
(setInterval en mémoire, pas de job Redis), `auditTrail` (même forme
d'historique horodaté), `PartnerBusiness.businessId`, `Vehicle.status:"sold"`.

## 2. Modèles / données

### Nouveau : `server/models/SalesLead.js`
- `reference` `VA-LEAD-AAAA-NNNNNN` (unique)
- `workflow` = `SALE_TEST_DRIVE`
- Liens obligatoires : `vehicle`, `partner` (User propriétaire), `businessId`
  (hérité du véhicule), `client.userId` (facultatif — invité possible)
- `client` : `firstName, lastName, phone, whatsapp, email, city, country, consent`
- `listingSnapshot` : titre, marque, modèle, année, prix USD, devise d'affichage,
  ville — figé à la création (l'annonce peut changer ou disparaître)
- `source` = `vit_auto` (+ `sourceDetail` : `vehicle_page`, `callback`, …)
- `requestType` : `test_drive` | `callback`
- `requested` : `date, slot (morning|afternoon|evening|custom), customSlot, message`
- `flags` : `financing, multipleVehicles, urgent, international, professional`
- `qualification` : `level 1|2|3, reasons[], qualifiedAt, qualifiedBy, autoSendAt`
- `status` (15 valeurs de la consigne) + `milestones` (horodatages
  `sentToPartnerAt, partnerFirstResponseAt, scheduledAt, completedAt, soldAt, lostAt`)
- `appointment` : `date, time, address, instructions, confirmedAt`
- `alternative` : `date, slot, time, note, proposedAt, clientResponse`
- `sla` : `reminder1SentAt, reminder2SentAt, escalatedAt, responseTimeMs`
- `outcome` : `testDrive (completed|no_show|postponed), commercial (interested|
  negotiation|sold|not_interested|sold_elsewhere|other), note, reportedAt,
  requestedAt`
- `followUp` : `sentAt, response (interested|offer|thinking|not_interested),
  respondedAt`
- `sale` : `finalPrice, currency, finalPriceUSD, soldAt, declaredAt, declaredBy,
  confirmedAt, confirmedBy`
- `commission` : `rate, amountUSD, currency, dueWithinAttribution, ledgerId,
  computedAt`
- `attribution` : `windowDays, expiresAt`
- `contact` : `disclosedToPartnerAt, disclosureStage`
- `history[]` : `{action, actorType CLIENT|PARTNER|ADMIN|SYSTEM, actorId, source,
  timestamp, from, to, metadata}` — la traçabilité de la consigne (§18)
- `clientAccessToken` (invité : lien signé pour consulter/répondre)
- `lostReason`, `cancelReason`, `internalNotes`, `assignedAdmin`

### Modifié : `PricingConfig` + `config/defaultPricingConfig.js`
Bloc `salesLead` (strict Mongoose : un champ non déclaré est perdu en silence) :
`commissionRate 0.03`, `attributionDays 90`, `responseSlaMinutes 120`,
`reminderMinutes 120`, `escalationMinutes 360`, `adminInterventionMinutes 1440`,
`highValueUSD 40000`, `mediumValueUSD 15000`, `contactDisclosureStage`.

### Modifié : `Notification.type` — valeur `sales_lead`.

### Non modifiés : `Vehicle`, `User`, `Booking`, `Lead`, `PartnerBusiness`.

## 3. API (`/api/sales-leads`)

Client / public
- `POST /` (optionalAuth, limiteur dédié) — crée le lead, qualifie, transmet si niveau 1
- `GET /mine` (auth) — mes demandes
- `GET /public/:reference?t=` — vue client (invité par jeton, ou propriétaire connecté)
- `POST /public/:reference/alternative` `{accept|newDate,newSlot}` — répondre au créneau proposé
- `POST /public/:reference/follow-up` `{response}` — réponse au suivi post-essai
- `POST /public/:reference/cancel`

Partenaire (auth + délégation équipe)
- `GET /partner?status=&businessId=` — « Mes opportunités »
- `GET /partner/stats?businessId=` — §16
- `POST /:id/accept` `{time, address, instructions}`
- `POST /:id/propose-alternative` `{date, slot, time, note}`
- `POST /:id/refuse` `{reason}`
- `POST /:id/outcome` `{testDrive|commercial, note, newDate…}` — §9
- `POST /:id/declare-sale` `{finalPrice, currency, soldAt}` — §12
- `POST /:id/note`

Admin (scope `bookings`)
- `GET /admin?partner=&vehicle=&status=&city=&from=&to=&minPrice=&maxPrice=&source=&level=`
- `GET /admin/funnel` — pipeline §17
- `GET /:id` — dossier complet + historique
- `POST /:id/admin/qualify` `{level, transmit:true}` — §3
- `POST /:id/admin/confirm-sale` / `reject-sale` — SALE_PENDING → SOLD / NEGOTIATION
- `POST /:id/admin/status` `{status, reason}` — intervention (§7, §8)
- `POST /:id/admin/assign` `{adminId}`

## 4. Workflow frontend

- Fiche véhicule (`VehicleDetails.jsx`) : CTA principal **« Demander un essai »**,
  secondaires « Être rappelé » (même formulaire, `requestType:"callback"`, sans
  date) et « Contacter le vendeur » (service client centralisé, inchangé).
  Modale mobile-first `TestDriveRequestModal` : nom, téléphone, WhatsApp
  (pré-coché « même numéro »), ville, date, créneau (4 chips), message,
  précisions facultatives (financement / plusieurs véhicules / urgent), consentement.
  Préremplie si connecté. Un écran, un envoi.
- Page `/essai/:reference` (`TestDriveLead.jsx`) : suivi du rendez-vous (véhicule,
  date, heure, adresse, instructions), réponse à un autre créneau
  ([Accepter] [Choisir un autre créneau]), suivi post-essai (4 boutons §10),
  annulation. Accessible connecté, ou par le lien à jeton envoyé par
  e-mail/SMS/WhatsApp.
- Espace client (`Dashboard.jsx`) : bloc « Mes demandes d'essai ».
- Dashboard partenaire (`VendorDashboard.jsx`) : onglet **« Mes opportunités »**
  (`PartnerOpportunities`) — bandeau statistiques §16, filtres par étape §15,
  cartes (client, véhicule, date, statut, historique dépliable) et actions
  contextuelles en un clic : Accepter / Autre créneau / Indisponible ; Résultat
  de l'essai ; Vente conclue.
- Admin (`AdminPanel.jsx`) : onglet **« Leads vente »** (`AdminSalesLeads`) —
  funnel §17, filtres, tableau, fiche lead avec historique complet, qualification,
  confirmation de vente, intervention.

## 5. Workflow backend (`services/salesLeadService.js`)

```
createLead  → NEW → qualify()
   niveau 1 → sendToPartner()      → SENT_TO_PARTNER (partenaire notifié)
   niveau 2 → QUALIFYING (admins notifiés) ; auto-transmis après 4 h sans action
   niveau 3 → QUALIFYING (admins notifiés, prioritaire) ; jamais auto-transmis
partnerAccept        → PARTNER_ACCEPTED ⇒ TEST_DRIVE_SCHEDULED (client confirmé implicitement : c'est SON créneau)
partnerPropose       → ALTERNATIVE_PROPOSED
clientRespond accept → CUSTOMER_CONFIRMED ⇒ TEST_DRIVE_SCHEDULED
clientRespond other  → SENT_TO_PARTNER (nouveau créneau, SLA relancé)
partnerRefuse        → LOST (vehicle_unavailable | refused)
scheduler post-essai → demande de résultat au partenaire ; suivi client à +3 h
reportOutcome        → TEST_DRIVE_COMPLETED | CUSTOMER_NO_SHOW | (reporté = nouvelle date)
                       | CUSTOMER_INTERESTED | NEGOTIATION | LOST
followUp client      → CUSTOMER_INTERESTED (partenaire notifié) | NEGOTIATION (offre)
                       | (réfléchit : relance J+7) | LOST
declareSale          → SALE_PENDING + commission calculée + CommissionLedger pending
admin confirmSale    → SOLD + ledger confirmed + Vehicle.status "sold"
```
Chaque transition passe par `transition(lead, to, actor, action, metadata)` qui
vérifie la table du workflow, écrit `history[]`, pose les `milestones`.

## 6. Notifications

| Événement | Partenaire | Client | Admin |
|---|---|---|---|
| Lead créé | — | accusé de réception | si niveau 2/3 |
| Transmis | 🚗 Nouvelle demande d'essai VIT AUTO (in-app, push, e-mail, WhatsApp texte si configuré) | — | — |
| SLA 2 h / 6 h / 24 h | rappel / rappel renforcé | — | intervention à 24 h |
| Accepté | — | ✅ Essai confirmé (véhicule, date, heure, adresse, instructions) | — |
| Autre créneau | — | 🔄 Le vendeur propose un nouveau créneau | — |
| Client confirme / choisit un autre | 📅 | — | — |
| Refus | — | ❌ + invitation à voir d'autres véhicules | ⚠️ |
| Après l'essai | « Quel est le résultat ? » | « Souhaitez-vous poursuivre ? » (4 actions) | — |
| Client intéressé | « Le client souhaite poursuivre son projet d'achat » | — | — |
| Vente déclarée | — | — | 💰 à confirmer |
| Vente confirmée | 🎉 + commission | — | — |

Canal client : compte → `notify()` ; invité → e-mail (`generic_notification`) +
SMS (`generic`) + WhatsApp texte, chacun silencieux si non configuré.

## 7. Règles de commission

- Taux `PricingConfig.salesLead.commissionRate` = **0,03** (3 %), éditable admin.
- Assiette : prix de vente final déclaré, converti en USD (`currencyEngine`).
- Due uniquement si `status` atteint `SOLD` **et** `sale.soldAt ≤ attribution.expiresAt`.
- Écriture `CommissionLedger` `{transactionType:"sale", transactionId: lead._id,
  type:"platform_fee"}` : `pending` à la déclaration, `confirmed` à la confirmation
  admin, `cancelled` si rejetée. Unique par lead (index existant).
- Aucun abonnement, frais d'inscription ou de publication n'est exigé pour ce flux.
  Le taux `commissions.standard.vente` (5 %) reste celui des anciens `Booking`
  « essai » conclus sur place ; il n'intervient pas ici.

## 8. Règles d'attribution

- `attribution.windowDays` = `PricingConfig.salesLead.attributionDays` (90), figé
  sur le lead à la création ; `expiresAt = createdAt + windowDays`.
- Toute vente de CE véhicule à CE client déclarée avant `expiresAt` est attribuée
  à VIT AUTO. Après : déclaration acceptée, commission 0, `dueWithinAttribution:false`,
  l'admin peut trancher.
- Doublon : une nouvelle demande du même téléphone sur le même véhicule alors
  qu'un lead est ouvert renvoie le lead existant (pas de second lead, pas de
  double attribution).
- À inscrire dans les conditions partenaires (texte à ajouter par l'exploitant).

## 9. Dashboard partenaire

Onglet « Mes opportunités » : KPIs (leads, essais, confirmés, réalisés, ventes,
taux de conversion, temps de réponse moyen, CA via VIT AUTO, commission) ;
filtres par étape ; cartes avec actions ; sélecteur d'entité pour les
multi-entités (même `businessId` que le reste du dashboard).

## 10. Dashboard admin

Onglet « Leads vente » (groupe SERVICES, scope `bookings`) : funnel
LEADS → DEMANDES → ESSAIS → OPPORTUNITÉS → NÉGOCIATIONS → VENTES ; filtres
partenaire / véhicule / statut / ville / niveau / dates / prix ; fiche lead avec
historique horodaté complet, coordonnées client complètes, qualification,
confirmation/rejet de vente, changement de statut motivé, prise en charge.

## Confidentialité (§19)

- Le partenaire ne voit jamais les coordonnées client avant
  `contactDisclosureStage` (défaut `PARTNER_ACCEPTED`) : avant, prénom + initiale,
  ville, téléphone masqué (`+225 07 •• •• 12`).
- Le client ne reçoit que l'adresse du rendez-vous et le service client VIT AUTO
  (déjà centralisé, voir `customerServiceContact`).
- L'admin voit tout.

---

## État livré (2026-09-12)

Tout ce qui précède est construit et vérifié :

- Serveur : `constants/leadWorkflows.js`, `models/SalesLead.js`, `services/salesLeadService.js`,
  `services/salesLeadNotifier.js`, `controllers/salesLeadController.js`, `routes/salesLeads.js`
  (monté sur `/api/sales-leads`), `utils/salesLeadScheduler.js` (démarré dans `server.js`),
  bloc `PricingConfig.salesLead` (section éditable via `/api/admin/business-config/pricing/salesLead`),
  type `Notification.sales_lead`.
- Front : `TestDriveRequestModal` (fiche véhicule, CTA « Demander un essai » / « Être rappelé » /
  « Contacter le vendeur »), page `/essai/:reference` (`TestDriveLead.jsx`), bloc « Mes demandes
  d'essai » de l'espace client, onglet partenaire « Mes opportunités » (`PartnerOpportunities`),
  onglet admin « Leads vente (essais) » (`AdminSalesLeads`), constantes `src/constants/salesLeads.js`.
- Tests : `server/tests/salesLead.test.js` (16 tests : création, qualification 1/2/3,
  auto-transmission, doublon, masquage des coordonnées, autre créneau par jeton, refus, SLA
  en trois paliers, résultat d'essai, suivi client, vente en XOF → commission 3 % en USD,
  ledger, attribution expirée, rejet admin, funnel, transitions interdites) ;
  `src/pages/screens.essai.render.test.jsx` (3 écrans).
- Vérification bout en bout en conditions de production (dist/ sous CSP de `vercel.json`, API
  locale sur base Mongo en mémoire, Chromium) : invité mobile → demande → partenaire propose un
  autre créneau → client accepte par lien signé → partenaire voit enfin le téléphone → essai
  réalisé → vente 120 000 MAD → admin confirme → lead `SOLD`, commission 360 USD, ledger
  `confirmed`, véhicule `sold`, 11 entrées d'historique. `API_CIBLE=http://localhost:5001`
  est désormais accepté par `scripts/servirAvecCsp.mjs` pour rejouer ce scénario.

### Choix à connaître
- Les dates calendaires (jour souhaité, rendez-vous, vente) sont ancrées à **midi UTC** ; l'heure
  du rendez-vous est une chaîne `HH:MM`. Sans cela le 15 saisi s'affichait « 14 » (vu en
  vérification locale sur un poste à l'ouest de Greenwich).
- Une demande de **rappel** (sans date) s'arrête à `PARTNER_ACCEPTED` ; le vendeur déclare ensuite
  directement le résultat commercial.
- Le lead de **niveau 3** n'est jamais transmis automatiquement : un admin doit le valider
  (onglet « Leads vente », bandeau « À qualifier »). Le niveau 2 est transmis seul après
  `level2AutoSendMinutes` (4 h) si personne n'agit.
- L'ancien `Booking` type `essai` reste en base et dans les onglets Commandes/Réservations pour
  l'historique ; il n'est plus proposé depuis la fiche véhicule. `/booking/:id` reste utilisé pour
  la location, le leasing/crédit et l'achat à l'import.
- À faire par l'exploitant : inscrire la règle d'attribution (90 jours) et la commission (3 %)
  dans les conditions partenaires ; configurer WhatsApp (`WHATSAPP_TOKEN`/`WHATSAPP_PHONE_ID`)
  pour que les relances partenaires partent aussi par ce canal (silencieux sinon).
