# Prospects — vue unifiée (2026-10-28)

Trois collections, trois usages, **aucune fusion des données** :

| Collection | Qui la tient | Contenu | Commission VIT AUTO |
|---|---|---|---|
| `Lead` | le partenaire (PMS) | ses propres prospects, toutes sources | non |
| `SalesLead` | VIT AUTO | demandes d'essai apportées par la plateforme | oui : vente conclue dans la fenêtre d'attribution (90 j) |
| `PartnerCrm` | l'équipe VIT AUTO | recrutement de **partenaires** (pas de clients) | sans objet |

## Lecture unifiée

- `GET /api/prospects` (partenaire) : ses `Lead` et ses `SalesLead`, normalisés.
  Les coordonnées d'une demande d'essai restent masquées tant qu'elles ne sont
  pas révélées (`salesLeadService.partnerView`, jamais réimplémenté).
- `GET /api/prospects/admin` (portées `partners` ou `bookings`) : tout, coordonnées
  comprises (`adminView`), filtrable par `?partenaire=<id>`.
- Filtres : `?etape=nouveau|en_cours|gagne|perdu`, `?source=partenaire|vit_auto`.
- Chaque prospect porte `source`, `commissionVitAuto` et, pour une demande
  d'essai, `attributionJusquau`.

Étapes communes : `nouveau`, `en_cours`, `gagne`, `perdu` ; le statut d'origine
reste dans `statut`.

## Recrutement → activation

La liste et la fiche `PartnerCrm` d'un prospect lié à un compte affichent son
activation **calculée** (inscrit / vérifié / activé / suspendu, critères manquants,
offres exploitables, demandes reçues) — services/activationPartenaire.js.
Le statut de pipeline saisi à la main reste distinct.

## Incoterms

`Lead.budget.incoterm` accepte les onze règles Incoterms® 2020 (+ « autre »).

## Écran « CRM Partenaires » (admin, 2026-10-28)

Onglet existant d'AdminPanel, enrichi sur les mêmes routes `/api/partner-crm/admin/*`
(aucun second backend) :

- recherche (entreprise, contact, e-mail, téléphone, référence) ; filtres statut, pays,
  secteur (métier), origine, responsable, « à relancer » ; pagination serveur (50/page) ;
- colonne **Activation** (calculée) et **Prochaine action** (rouge si l'échéance est
  dépassée ou du jour) ;
- fiche : activation réelle, correspondances possibles, journal des échanges en ajout
  seul (`echanges[]`, `POST /admin/:id/echanges`), prochaine action + échéance,
  abandon avec motif obligatoire (`ABANDONNE`, hors progression ; un compte lié remet
  le prospect à `INSCRIT`) ;
- **doublons** : à la création, même e-mail, même téléphone (8 derniers chiffres) ou
  même nom → 409 `DOUBLON_POSSIBLE` avec les correspondances (fiches CRM et comptes
  partenaires) ; « Créer quand même » envoie `confirmerDoublon: true`. Jamais de fusion ;
- indicateurs : comptes par étape, à relancer, abandonnés, et **activés (réel)**
  distinct de « convertis (déclarés) » ;
- permissions : toutes les routes exigent la portée `partners` (l'admin général passe) ;
  suppression réservée à l'admin général ;
- une erreur de chargement s'affiche comme une erreur, jamais comme « aucun prospect ».

## Limite

La vue unifiée `/api/prospects` (clients des partenaires) n'a pas encore d'écran ;
l'espace partenaire garde ses deux écrans (CRM du PMS, demandes d'essai).
