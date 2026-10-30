# Séquestre Import/Export : SUSPENDU (décision de l'exploitant, 2026-10-30)

Tant que les exigences juridiques, contractuelles et celles du prestataire de paiement ne
sont pas validées, VIT AUTO **n'encaisse, ne bloque, ne sécurise ni ne débloque aucun fonds**
pour une transaction Import/Export. L'acheteur règle l'exportateur directement, selon leur
contrat, hors de la plateforme.

## Côté serveur

- `config/featureFlags.js` : `SEQUESTRE_IE_ACTIF` (variable `IE_ESCROW_ENABLED`), **fermé par
  défaut** ; aucun réglage admin ne le rouvre.
- Répondent `503 SEQUESTRE_SUSPENDU`, sans rien écrire : `POST /pay`, `POST /pay-balance`,
  `PATCH /verify-payment`, `PATCH /release-funds`, et `PATCH /dispute/resolve` avec
  `releaseToPartner`. Un litige peut toujours être tranché, sans libération.
- Webhook Stripe : un paiement IE reçu pendant la suspension n'est **jamais** transformé en
  « fonds sécurisés » ; il est journalisé (Sentry + historique) et signalé aux admins pour
  régularisation manuelle. Aucun remboursement automatique.
- Tâche `escrow_check` (queue) : lecture seule, inchangée.
- Paiement en ligne des réservations : `initiatePayment` exige aussi `PAYMENTS_ENABLED`
  (un compte marchand configuré suffisait à encaisser). Remboursements admin conservés.

## Règlement direct (déclaratif)

`POST /api/import-export/transactions/:id/reglement-direct` (statut `payment_pending`) :
- l'**acheteur** déclare avoir réglé (référence facultative) — le statut ne change pas ;
- l'**exportateur** confirme la réception → `preparing` (préparation de l'export).
- Un achat direct non validé par l'équipe ne peut pas être déclaré réglé.
- Livraison confirmée par l'acheteur → `completed` (aucun `funds_released`, aucun versement).
- Historique : « aucun fonds détenu ni vérifié par VIT AUTO ».

## Données existantes

Rien n'est supprimé ni migré : statuts `payment_submitted`, `in_escrow`, `funds_released`,
références d'escrow et ventilations restent lisibles. L'onglet admin « Séquestre (suspendu) »
sert à régulariser les transactions ouvertes avant la suspension.

## Textes

Libellés neutres (« Paiement confirmé », « Exportateur réglé »), CGV art. 6 et 7, Politiques,
page d'accueil (caution, description), Import/Export, grille partenaires : plus aucune
mention de fonds détenus, bloqués ou sécurisés par VIT AUTO. **CGV et Politiques : relecture
juridique à prévoir.**

## Point ouvert

Commission export (3 %) sur une vente réglée en direct : elle n'est plus enregistrée
automatiquement (elle l'était à la libération des fonds). Mode de perception à décider.

Tests : `server/tests/sequestreSuspendu.test.js`, `src/pages/screens.reglementDirect.render.test.jsx`.
