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

## Rattachement à une commande Parts ou Trade

- Le formulaire propose les commandes **du client** (`GET /commandes-rattachables`) : commandes de
  pièces (`Booking` type `piece`) et transactions VIT-AUTO Trade (`IETransaction`), hors annulées.
  Choisir une commande **préremplit** trajet et marchandise ; le client corrige librement. Un pays
  d'origine écrit en toutes lettres (« Émirats Arabes Unis ») n'est pas converti : le champ reste vide.
- Seule la **référence** est stockée (`liens.booking` ou `liens.transaction`) ; les données de la
  commande ne sont pas recopiées. Le serveur vérifie que la commande appartient au client et
  n'est pas annulée, et refuse une seconde demande active sur la même commande (409
  `DEMANDE_EXISTANTE`, avec l'identifiant de la demande ouverte).
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
