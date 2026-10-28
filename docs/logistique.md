# VIT-AUTO Logistique — mise en relation gratuite

> Décision de l'exploitant du **2026-10-27** (addendum au prompt maître, modèle A).
> Rattaché au pôle **VIT-AUTO Trade** ; utilisable aussi pour une commande Parts.

## Modèle économique : FREE_REFERRAL

- Aucune commission, aucun taux, aucun frais de mise en relation, aucun abonnement requis.
- Aucun paiement intégré : le client règle le prestataire directement, selon le devis.
- VIT AUTO n'est ni transporteur, ni transitaire, ni commissionnaire en douane, ni assureur.
- Le revenu logistique de VIT AUTO vaut **0** ; la valeur d'une opération n'est pas un revenu.

Verrous dans le code (une monétisation future exigera une décision, une validation juridique
et un **changement de code**, jamais un réglage) :

| Où | Verrou |
|---|---|
| `DemandeLogistique.remuneration` | `modele` ∈ {`FREE_REFERRAL`}, `montantUSD` doit valoir 0 (validateurs Mongoose) |
| `PricingConfig.logistique` | `commissionActive` = false, `taux` = null, `fraisMiseEnRelationUSD` = null (validateurs) ; section absente de `businessConfigController.SECTIONS`, donc non éditable |
| `serviceRequestController.setDecision` | catégories `transport`, `transit`, `douanes` : commission forcée à 0, quel que soit `PricingConfig.services` |
| `logistiqueController` | ne crée ni `CommissionLedger`, ni facture, ni paiement |

## Parcours

| Étape | Qui | Route (`/api/logistique`) | Statut |
|---|---|---|---|
| Demande (ou brouillon) | client connecté | `POST /demandes` | `recue` / `brouillon` |
| Qualification | admin | `POST /admin/demandes/:id/qualifier` (`valider` / `infos` / `refuser`) | `validee` / `infos_requises` / `annulee` |
| Réponse aux précisions | client | `PATCH /demandes/:id` | `recue` |
| Sollicitation des prestataires compatibles | admin | `GET …/compatibles`, `POST …/solliciter` | `recherche_prestataires` |
| Réponse, précisions, refus | prestataire | `POST /prestataire/demandes/:id/reponse` | — |
| Devis (chaque actualisation = nouvelle version) | prestataire | `POST /prestataire/demandes/:id/devis`, `…/devis/:devisId/retirer` | `devis_recus` |
| Comparaison, acceptation ou refus | client | `POST /demandes/:id/devis/:devisId/accepter` / `refuser` | `devis_accepte` |
| Confirmation, préparation, transport, livraison | prestataire **retenu**, dans l'ordre | `POST /prestataire/demandes/:id/etape` | `commande_confirmee` → `en_preparation` → `en_transport` → `livraison_declaree` |
| Preuve de livraison | prestataire retenu | `POST /prestataire/demandes/:id/preuve` | — |
| Réception confirmée = opération conclue | client | `POST /demandes/:id/confirmer-livraison` | `cloturee` |
| Annulation (avant transport) / litige (après engagement) | client | `POST /demandes/:id/annuler`, `…/litige` | `annulee` / `litige` |
| Résolution d'un litige, clôture sur justificatif, annulation | admin, note obligatoire, tracée | `POST /admin/demandes/:id/intervention` | `cloturee` / `annulee` |

Règles :
- L'admin **ne déclare jamais** « en transport » ni « livrée » à la place du prestataire.
- Un devis accepté **n'est pas** une opération conclue ; une livraison déclarée non plus. Seule la
  réception confirmée (ou une clôture admin justifiée) pose `jalons.clotureeLe`.
- L'acceptation fige une **copie exacte** du devis (`devisAccepte.copie`) avec sa date.
- Un devis expiré ne peut pas être accepté.

## Commande commerciale, dossier logistique et Incoterms® 2020 (2026-10-28)

**La commande Trade ou Parts reste la référence commerciale.** Le dossier logistique est un dossier
opérationnel distinct ; il peut exister sans commande.

### Conditions Incoterms® sur la commande — `/api/incoterms`

- `IETransaction.conditionsIncoterm` et `Booking.conditionsIncoterm` (Parts) : règle parmi les **onze**
  (EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP), version `2020`, **lieu nommé obligatoire**,
  pays, mode, références de devis et de contrat, notes, historique. Libellé : « FOB Port de Jebel
  Ali, Incoterms® 2020 ».
- Accord = validation de l'acheteur **et** du vendeur (lus sur la commande). Toute modification remet
  l'accord à zéro, exige un **motif** une fois l'accord obtenu, et s'inscrit dans l'historique et le
  journal d'audit. L'admin lit, ne modifie pas.
- Une règle maritime (FAS/FOB/CFR/CIF) choisie pour un transport non maritime déclenche un avertissement.
- **Aide au choix** (`POST /api/incoterms/recommandation`) : FOB n'est recommandé qu'en maritime, marchandise
  chargée à bord, transport principal organisé par l'acheteur ; **FCA** pour un conteneur remis au
  terminal (FOB y est « à examiner ») ; CFR/CIF, CPT/CIP, DAP/DPU/DDP, EXW selon le scénario. Elle ne
  choisit jamais à la place des parties et ne constitue pas un avis juridique.
- Panneau « Conditions Incoterms® 2020 » : suivi Trade (acheteur, exportateur, admin) et commandes
  Parts transfrontalières (client et vendeur). `Quote.incoterm` accepte désormais les onze règles.

### Dossier logistique — parties, rôles, exportateur

- **Plusieurs dossiers par commande** (expéditions partielles). Un envoi rejoué ne crée pas de doublon :
  clé `cleIdempotence` unique par demandeur, le serveur renvoie le dossier déjà créé.
- **Parties** (`parties.acheteur`, `parties.vendeur`) lues sur la commande, jamais reçues du navigateur.
  Le dossier peut être créé par l'**acheteur** ou par le **vendeur** ; l'acheteur non demandeur suit le
  dossier en lecture, seul le demandeur décide (devis, rôles, annulation).
- **Donneur d'ordre** et **payeur** : déclarés (« à confirmer » par défaut), **jamais déduits de
  l'Incoterm** — l'interface n'affiche qu'une indication (« sous FOB, le transport principal est
  habituellement organisé par l'acheteur »). Figés à l'acceptation.
- L'Incoterm de la commande est recopié **pour information** (`incotermCommande`).
- **Espace exportateur** (`/logistique/vendeur`, `/api/logistique/vendeur/...`) : confirmation de la
  disponibilité, du lieu d'enlèvement, du poids, du volume, du chargement, des contraintes de manutention
  et des documents prévus. Il ne voit ni les prix du transport ni les coordonnées du client ; il n'est
  pas pour autant donneur d'ordre ni payeur.
- **Devis** : nature (`estimatif` / `ferme`), trajet, mode, postes facultatifs (préparation et
  manutention, transport local et international, frais portuaires et de terminal, assurance, droits et
  taxes, autres). Si les postes inclus sont chiffrés, leur somme **égale** le montant ; un poste non
  inclus signale un frais possible en sus sans être ajouté. Aucun droit ni taxe n'est calculé.
- **Acceptation** : devis exact, version, date, auteur, partie contractante et payeur déclarés. Ce n'est
  pas une preuve de paiement.
- **Documents** (`documents[]`) : chaque rôle dépose ce qui relève de lui (acheteur : facture, import,
  assurance ; vendeur : facture, liste de colisage, justificatif d'export ; prestataire retenu : transport,
  preuve de livraison, assurance). Lecture : demandeur, acheteur, vendeur, prestataire retenu, admin —
  jamais un prestataire simplement sollicité. Aucun document n'est obligatoire ni « vérifié ».
- Les événements de devis (qui portent les montants) sont exclus des vues du vendeur et des
  prestataires : un prestataire ne voit jamais le prix d'un concurrent.
- Clôturer le dossier logistique ne clôture pas la commande commerciale, et inversement.

## Rattachement à une commande Parts ou Trade

- Le formulaire propose les commandes **du client** (`GET /commandes-rattachables`) : commandes de
  pièces (`Booking` type `piece`) et transactions VIT-AUTO Trade (`IETransaction`), hors annulées.
  Choisir une commande **préremplit** trajet et marchandise ; le client corrige librement. Un pays
  d'origine écrit en toutes lettres (« Émirats Arabes Unis ») n'est pas converti : le champ reste vide.
- Seule la **référence** est stockée (`liens.booking` ou `liens.transaction`) ; les données de la
  commande ne sont pas recopiées. Le serveur vérifie que l'utilisateur est l'acheteur ou le vendeur de
  la commande et qu'elle n'est pas annulée. Plusieurs dossiers par commande sont permis (voir plus haut).
- Visible : client (lien vers la commande), admin (référence et statut de la commande),
  prestataire (seulement la nature : « Commande de pièces détachées » / « Transaction VIT-AUTO Trade »).
- Accès direct : bouton « Organiser le transport » sur une commande de pièces (tableau de bord) et sur
  le suivi d'une transaction Trade (`/logistique?commande=booking:<id>` ou `transaction:<id>`).
- Une demande peut toujours exister sans commande. Le rattachement ne déclenche ni paiement ni commission.

## Confidentialité

- Un prestataire ne voit **que** les demandes où il est sollicité.
- Il ne voit ni l'identité ni les coordonnées du client, sauf si **son** devis est accepté.
- Le client ne voit ni les sollicitations internes, ni les notes admin, ni les versions remplacées.
- La preuve de livraison est stockée dans le dossier privé ImageKit.

## Prestataires

Ceux de la **Zone Transit** (`models/Prestataire.js`, inscription sur invitation). Sont sollicitables
les types `transporteur` et `transitaire`, actifs, couvrant le pays de départ **ou** d'arrivée.
Espace : `/transit/logistique`.

## Indicateurs (`GET /admin/indicateurs`, export `…/indicateurs.csv`)

Calculés uniquement sur les jalons et événements enregistrés. Un ratio sans dénominateur vaut
`null` (« indisponible »), jamais 0. Montants **déclarés** par devise, jamais additionnés entre
devises : devis, commandes confirmées, opérations conclues. `revenusVitAuto` = 0. Également :
délais de première réponse et jusqu'au premier devis, conversions, performance par prestataire,
trajets les plus demandés, motifs d'annulation et de refus. L'export CSV ne contient aucune
donnée personnelle.

## Limites connues

- Écrans en français uniquement, comme les autres espaces connectés (Mes importations, Zone Transit).
- Notifications in-app et temps réel ; pas d'e-mail ni de WhatsApp dédiés pour l'instant.
- Aucun suivi GPS : seules les étapes et références de suivi déclarées par le prestataire sont affichées.

## Décisions à prendre avant toute monétisation

1. Le mode : commission contractuelle, forfait de mise en relation, forfait de coordination ou abonnement.
2. L'assiette et le fait générateur (devis accepté ? opération conclue ?).
3. La validation juridique : statut d'intermédiaire, et activité réglementée si encaissement pour compte de tiers.
4. Les conditions contractuelles signées avec les prestataires.
