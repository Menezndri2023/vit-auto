# Politique d'archivage & Politique de conservation des preuves électroniques — VIT AUTO

> Document interne. Rédigé le 2026-07-16. Les deux sujets sont regroupés ici car ils reposent aujourd'hui sur la même infrastructure (MongoDB) sans dispositif dédié séparé.

## 1. Politique d'archivage

### Ce qui existe réellement
- Les données ne sont **jamais supprimées automatiquement** après une durée définie — véhicules, réservations, transactions restent en base indéfiniment (statuts `archived`/`sold`/`cancelled` marquent l'état, sans suppression physique).
- Le journal d'audit (`kycAuditLog`, journal d'audit admin) s'accumule sans purge automatique.

### Ce qui manque
- ⚠️ **Aucune politique de durée de conservation formalisée par type de donnée** (combien de temps garder une réservation terminée, un compte inactif, un document KYC refusé...). La Politique de confidentialité (`/privacy`) mentionne "3 ans après la dernière activité" pour les données personnelles générales, mais ce n'est **pas appliqué automatiquement** — c'est un engagement déclaratif, pas un mécanisme technique.
- Pas d'archivage à froid séparé (tout reste dans la même base de production active) — impact potentiel sur les coûts et les performances à long terme.

## 2. Politique de conservation des preuves électroniques

Utile en cas de litige (client/partenaire) ou de demande judiciaire.

### Ce qui existe réellement et sert de preuve de facto
- Historique de statut horodaté sur les réservations et transactions Import/Export (`statusHistory`), avec l'identité de l'auteur du changement.
- Journal d'audit KYC (`kycAuditLog`) et journal d'audit admin général.
- Contrats/factures générés en PDF, conservés en base.
- Messages de chat (client/partenaire/support) conservés en base.

### Ce qui manque
- ⚠️ **Pas d'horodatage certifié tiers** (type RFC 3161) sur ces éléments — l'horodatage est celui du serveur applicatif, modifiable en théorie par quiconque a accès direct à la base, donc de valeur probatoire limitée en cas de contestation sérieuse.
- **Pas de procédure documentée d'export/scellement** d'un dossier complet (réservation + messages + documents + historique) en cas de demande judiciaire ou de litige majeur — à construire avant d'en avoir besoin dans l'urgence.
- **Pas de politique de conservation minimale légale par pays** documentée (certains pays imposent une durée minimale de conservation des transactions commerciales, ex. obligations comptables/fiscales) — à valider avec un expert-comptable par marché.

## 3. Recommandation

Avant de communiquer une garantie de conservation de preuves à un partenaire ou une autorité, formaliser : (1) une durée de conservation minimale/maximale par type de donnée, avec sa base légale par pays ; (2) une procédure d'export scellé d'un dossier complet ; (3) évaluer l'opportunité d'un horodatage tiers pour les pièces les plus sensibles (KYC, contrats signés).
