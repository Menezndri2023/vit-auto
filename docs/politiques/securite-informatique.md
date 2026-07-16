# Politique de sécurité informatique — VIT AUTO

> Document interne. Rédigé le 2026-07-16, décrit l'état réel vérifié — pas une cible. À usage interne (équipe technique/direction), ne pas publier tel quel (révèle des détails d'architecture utiles à un attaquant).

## 1. Mesures en place

- Authentification par JWT (access + refresh token), mots de passe hashés (BCrypt).
- Verrouillage temporaire de compte après plusieurs échecs de connexion consécutifs.
- Rate limiting par IP sur les routes sensibles (login, inscription, KYC, API générale).
- En-têtes de sécurité HTTP (Helmet) : CSP, X-Frame-Options, HSTS, etc.
- Validation stricte des entrées (Zod/validation manuelle), échappement des regex sur recherche libre.
- Chiffrement au repos (AES-256-GCM) des données KYC les plus sensibles depuis le 2026-07-16 (photos d'identité, numéro de document, OCR brut, permis de conduire).
- Journal d'audit des actions administratives sensibles.
- TLS en transit (HTTPS) sur tous les environnements de production.
- Séparation des scopes admin (super_admin, finance, kyc, import_export, support, moderation) — partiellement appliquée (voir §3).

## 2. Gestion des secrets

- Secrets (JWT_SECRET, MONGO_URI, clés API tierces, FIELD_ENCRYPTION_KEY) stockés en variables d'environnement Railway — jamais commit dans le dépôt Git.
- ⚠️ **Point de vigilance identifié lors de l'audit de juillet 2026** : les mots de passe admin et les identifiants MongoDB Atlas doivent être **rotés** — action à planifier, pas encore réalisée à la date de rédaction.
- `FIELD_ENCRYPTION_KEY` : perdre cette clé rend **définitivement** indéchiffrables toutes les données KYC déjà chiffrées. Elle doit être sauvegardée dans un coffre-fort de secrets séparé (pas seulement dans Railway) — non fait à ce jour, à traiter en priorité.

## 3. Ce qui reste à faire (ne pas considérer comme acquis)

- Rotation des secrets/mots de passe admin.
- Sauvegarde séparée de `FIELD_ENCRYPTION_KEY` hors de Railway.
- Chiffrement au repos des autres champs sensibles restants (si de nouveaux champs PII sont ajoutés à l'avenir, les chiffrer dès leur création plutôt qu'après coup).
- Application effective des scopes admin fins sur l'ensemble des routes existantes (aujourd'hui, la plupart des routes admin ne vérifient pas encore le scope, seules les plus récentes le font).
- Tests de pénétration externes — jamais réalisés à ce jour.
- Programme de divulgation responsable (bug bounty ou email dédié `security@`) — inexistant.
- Détection d'intrusion / SIEM — inexistant, Sentry couvre les erreurs applicatives, pas la sécurité réseau.

## 4. Incident de sécurité — procédure actuelle

Il n'existe pas de procédure formelle documentée de réponse à incident à ce jour. En cas de suspicion de compromission : couper l'accès concerné (désactiver le compte/la clé), notifier l'équipe technique, évaluer l'étendue via le journal d'audit, notifier les utilisateurs affectés si des données personnelles sont concernées (obligation légale potentielle selon le pays et le volume, à évaluer avec un conseil juridique).
