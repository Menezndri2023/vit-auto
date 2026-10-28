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

## Limite

Pas encore d'écran dédié : la vue est disponible par l'API ; l'espace partenaire
garde ses deux écrans (CRM du PMS, demandes d'essai).
