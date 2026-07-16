# Manuel du Support Client — VIT AUTO

> Rédigé le 2026-07-16, basé sur l'état réel de la plateforme à cette date. À tenir à jour à chaque évolution du produit.

## 1. Où travailler

Toute l'activité support se passe dans l'**Admin Panel** (`/admin`), réservé aux comptes avec le rôle `admin`.

### 1.1 Support Client (chat)

**Sidebar → COMMUNICATION → 🎧 Support Client**

- Deux colonnes : liste des conversations à gauche, fil de discussion à droite.
- Un badge rouge indique le nombre de conversations en attente de réponse.
- Les conversations sont de deux types : `client_support` (clients) et `partner_support` (partenaires) — affichés avec une couleur d'avatar différente.
- La liste se rafraîchit automatiquement toutes les 15 secondes, et en temps réel via Socket.io dès qu'un message arrive.
- Un client/partenaire ouvre une conversation via la bulle de chat flottante du site (bas droite), option "🎧 Service Client" ou "Support Partenaires".
- **Comment répondre** : cliquer sur une conversation dans la liste, taper la réponse dans le champ en bas du fil, envoyer.

## 2. KYC — Vérification d'identité

**Sidebar → UTILISATEURS & CONFORMITÉ → 🛡️ KYC / Identités**

- Chaque dossier montre : pièce d'identité recto/verso, selfie, score de correspondance faciale (face-matching automatique), score OCR.
- Statuts : `EN_ATTENTE` → `VERIFIE` ou `REFUSE` (avec raison obligatoire en cas de refus).
- Un compte "particulier" (vendeur individuel) ne peut publier qu'après KYC `VERIFIE` — c'est le seul prérequis pour lui (pas de certification entreprise complète).
- Cooldown de 24h après un refus avant qu'un utilisateur puisse resoumettre.

## 3. Litiges

### 3.1 Réservations classiques (location/vente/chauffeur)
**Sidebar → SERVICES → ⚖️ Litiges**
- Un badge indique le nombre de réservations en litige.
- Chaque litige montre les déclarations du client et du partenaire ; l'admin tranche (résolution + note + décision de remboursement).

### 3.2 Transactions Import/Export
Le litige est ouvert directement par le client ou le partenaire depuis le suivi de sa transaction. L'admin le traite depuis **Sidebar → SERVICES → 🌍 Transactions I/E**, avec accès à tout l'historique de la transaction (14 étapes) avant de trancher.

⚠️ **Important** : un remboursement décidé ici n'est **pas exécuté automatiquement** — aucune intégration de remboursement Stripe n'existe à ce jour. Une décision de remboursement doit être suivie d'une action manuelle réelle (remboursement via le dashboard Stripe, virement, etc.) en dehors de la plateforme.

## 4. Questions fréquentes des utilisateurs

| Question client | Où trouver la réponse / quoi faire |
|---|---|
| "Je ne peux pas publier mon annonce" | Vérifier KYC (particulier) ou certification (entreprise/pro) dans Admin → KYC / Certifications |
| "Mon paiement n'est pas confirmé" | Paiement carte/Orange Money/Wave = automatique ; virement/mobile money autre/crypto/espèces = vérification manuelle admin (Sidebar → FINANCE → Escrow / Séquestre pour Import/Export, ou Paiements) |
| "Je veux annuler ma réservation" | Selon le statut — voir CGV article 7 ; pour l'Import/Export, orienter vers l'ouverture d'un litige si les fonds sont déjà en séquestre |
| "Combien vais-je payer au total pour mon import ?" | Renvoyer vers l'onglet "Transport" de la fiche annonce (calculateur automatique) — préciser que c'est une estimation, l'offre finale du fournisseur fait foi |
| "Je n'arrive pas à me connecter" | Vérifier email/téléphone vérifié (Admin → Comptes), et que le compte n'est pas bloqué (`failedLoginAttempts`/verrouillage temporaire après 5 tentatives) |

## 5. Ce qui n'existe pas encore (ne pas promettre au client)

- Pas de remboursement automatique instantané.
- Pas de suppression de compte en libre-service (voir Politique de confidentialité) — traiter la demande manuellement.
- Pas de moyen de paiement MTN/Moov/PayPal/Cash réellement intégré — ces options nécessitent une vérification manuelle si elles sont choisies.
