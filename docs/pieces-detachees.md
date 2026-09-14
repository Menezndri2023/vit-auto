# Secteur « pièces détachées » — vente directe et vente importation, livrées

Décision de l'exploitant (2026-09-14) : un partenaire du secteur **pièces**
vend des pièces détachées soit **en stock** (vente directe), soit **importées à
la commande** (vente importation) ; dans les deux cas la pièce est **livrée**
au client — jamais de retrait sur place. Le circuit va de la publication de
l'annonce à la réception confirmée par le client, avec commission VIT AUTO.

## 1. Modèle de données

- `server/models/SparePart.js` — l'annonce : catégorie (`PART_CATEGORIES`),
  titre, fabricant, référence OEM, état (neuf / reconditionné / occasion),
  véhicules compatibles (`compatibility[]` + texte libre), mode de vente
  (`saleMode` direct | import), `importInfo` (pays d'origine, délai annoncé,
  frais d'importation par commande, douane incluse, `depositPercent`), prix
  (USD + devise d'affichage figée + montant saisi), `stock` (null = sur
  commande), `minOrderQty`, poids, `shipping` (gratuit | forfait [offert
  au-delà d'un montant] | distance [barème pays au km], délais min/max, pays
  desservis), photos, localisation, modération (`status`), `ventes`.
- `Booking.type = "piece"` + `Booking.part` (ref) + `Booking.piece` : quantité,
  prix unitaire figé, mode, frais d'importation, acompte (`depositUSD`,
  `depositReceivedAt`), adresse de livraison (+ position, frais, distance,
  délais), suivi d'expédition (`tracking`), drapeaux de stock
  (`stockReserved` / `stockRestored` / `saleCounted`).
- Constantes partagées : `server/constants/spareParts.js` ⇔
  `src/constants/spareParts.js`.

## 2. Parcours

| Étape | Qui | Où |
|---|---|---|
| Publication (catégorie, référence, compatibilité, prix, stock, livraison, photos) | partenaire secteur `pieces` | `/vendor/submit-part` → `POST /api/parts` (gates : publication, périmètre `refusDePerimetre`, quota `refusDeQuota`) |
| Modération | admin | `GET /api/parts/pending`, `PATCH /api/parts/:id/status` (onglet Catalogue → Pièces) |
| Catalogue | public | `/catalogue?mode=Pieces` (filtres catégorie, marque/modèle, référence, pays livrable) — `GET /api/parts` |
| Fiche + devis de livraison | client | `/part/:id` — `GET /api/parts/:id/shipping-quote?quantity&lat&lng` (même calcul que la facturation : `services/partShipping.js`) |
| Commande | client (téléphone ou e-mail vérifié) | `POST /api/bookings { type:"piece", partId, piece:{ quantity, delivery:{ address, ville, country, lat, lng } } }` — adresse obligatoire, pays desservi, quantité ≥ minimum, **stock réservé atomiquement** (`services/partStock.js`), montants recalculés côté serveur |
| Transmission | système | **directe** au vendeur (comme tout service, règle 2026-09-14) : notification, WhatsApp, délai de réponse |
| Confirmation (+ acompte reçu pour une importation) | vendeur | `PATCH /api/bookings/:id/status { status:"confirmed", depositReceived:true }` |
| Préparation / commande fournisseur | vendeur | `preparing` |
| Expédition avec suivi | vendeur | `in_progress` + `{ tracking:{ carrier, trackingNumber } }` |
| Livrée | vendeur | `waiting_client_validation` (transition `in_progress → waiting_client_validation` réservée aux pièces) |
| Réception confirmée / problème | client | `PATCH /api/bookings/:id/validate { action:"validate" \| "dispute" }` → `completed` (vente comptée, reversement, fidélité) ou `disputed` |
| Annulation | client (`pending`/`confirmed`) ou vendeur/admin | stock restitué une seule fois |

Paiement : **espèces au livreur à la réception** (`TYPES_ESPECES_UNIQUEMENT`
inclut `piece` — aucun paiement en ligne tant qu'aucun prestataire n'est
branché). Pour une importation, l'acompte annoncé sur l'annonce est réglé au
vendeur à la confirmation ; le vendeur le déclare reçu.

## 3. Commission (validée par l'exploitant le 2026-09-14, modifiable dans PricingConfig)

| Mode | Standard | Partenaire Fondateur |
|---|---|---|
| Vente directe (`piece`) | **10 %** | **7 %** |
| Vente importation (`piece_import`) | **7 %** | **5 %** |

Assiette : **le prix des pièces seul** (`montantBase`) — jamais la livraison
ni les frais d'importation, qui reviennent intégralement au vendeur.
Justification : marges de la pièce détachée (20–40 % sur le neuf) plus
étroites que les services ; 10 % est la norme des places de marché auto
(eBay Motors / Amazon Automotive 12 %, Jumia 10–15 %) ; l'importation porte
un risque logistique et des paniers plus élevés → taux réduit.

## 4. Import en masse

`POST /api/parts/import { fileBase64, fileName, dryRun? }` (partenaire du
secteur ; gates publication/périmètre/quota) — CSV « ; » ou « , », ou .xlsx,
≤ 500 lignes, lu par `vehicleImportService.parseUploadedFile`. Colonnes
reconnues (alias FR/EN, accents ignorés) : titre, categorie (code ou libellé),
fabricant, reference, etat, prix, devise (converti en USD), stock, qte_min,
mode (direct/import), pays_origine, delai_jours, frais_import, acompte,
livraison (gratuit/forfait/distance), forfait_livraison, offerte_des,
delai_min, delai_max, compatibilite (« Marque Modèle 2004-2012 | … »), photos
(URL http séparées par |, au moins une), description, ville. Chaque ligne
passe par `normaliserChamps` ; les refus sont rapportés par ligne, les autres
créées `pending`. Bouton « Modèle CSV » + « Importer un fichier » dans
« Mes pièces détachées ».

## 5. Pages d'entrée (référencement)

`/activites/:ville` et `/pieces-detachees/:marque` (SectorLanding.jsx) :
contenu dérivé des annonces, noindex sans annonce, sitemap ≥ 2 annonces,
maillage depuis le catalogue.

## 6. Vérification

- Tests : `server/tests/spareParts.test.js` (publication, périmètre,
  catalogue, devis, commande, stock, transitions, réception, annulation).
- Parcours critique « Pièce détachée — commande livrée » dans
  `scripts/parcoursCritiques.mjs` (commande depuis le site, vendeur jusqu'à
  la livraison, réception confirmée, commission).
- Données semées : `server/scripts/apiLocale.mjs` (une pièce en stock, une
  importée).
