# Manuel de l'Administrateur — VIT AUTO

> Rédigé le 2026-07-16, basé sur l'état réel de l'Admin Panel (`/admin`) à cette date. La sidebar est organisée en groupes.

## TABLEAU DE BORD
- **Vue d'ensemble** : statistiques globales (utilisateurs, partenaires, annonces, commandes, revenus), alertes (annonces/commandes en attente), graphiques revenus 6 mois et répartition des comptes.
- **Analytics** : analytics avancé.

## UTILISATEURS & CONFORMITÉ
- **Comptes** : liste complète, filtres rôle/pays/recherche.
- **KYC / Identités** : voir Manuel du Support §2.
- **Certifications** : dossiers de certification partenaire (7 niveaux) pour les comptes professionnel/entreprise.

## CATALOGUE
- **Annonces & Validations** : sous-onglets En attente / Publiées / Rejetées / Chauffeurs / Toutes. Actions par ligne : 👁 Prévisualiser, ✏️ Modifier (modale complète : photos, tous les champs, bascule Location/Vente/**Exportation**), ✅ Approuver, ✕ Rejeter (avec motif), 🗑️ Supprimer.
- Bouton "🖼️ Générer les vignettes manquantes" : régénère la vignette compressée des véhicules qui n'en ont pas (utile après un import en masse ou pour rattraper d'anciennes annonces).

## MARKETING & CMS
- **Contenu & Mise en avant** : gestion des mises en avant catalogue.

## SERVICES
- **Réservations** : toutes les commandes (location/vente/essai/chauffeur/leasing).
- **Litiges** : voir Manuel du Support §3.1.
- **Chauffeurs** : approbation des profils chauffeurs.
- **Transactions I/E** : suivi des transactions Import/Export en cours, litiges Import/Export.
- **Partenaires Export** : dossiers importateurs + **modération des annonces Import/Export** (Publier/Refuser/Archiver/✏️ Modifier).
- **Transport Intl.** : suivi logistique des transactions Import/Export en acheminement.
- **Coûts Import** : configuration du moteur de calcul de coût d'importation —
  - *Barèmes par pays de destination* : droits de douane, TVA, transit, redevances, frais portuaires, livraison, assurance, fret par défaut (montants en USD).
  - *Liaisons de fret* : tarif de fret + transport intérieur pour une paire origine→destination précise (prioritaire sur le barème générique du pays).
  - ⚠️ Sans configuration d'au moins un pays, le calculateur reste indisponible côté acheteur — ce n'est pas un bug, c'est voulu (pas de valeurs inventées).
- **Financement** : demandes de leasing/crédit classique — décision manuelle (Accepter/Refuser + note client).
- **Assurance** : demandes d'assurance — décision manuelle + prime proposée.

## PARTENAIRES
- **Vérification Partenaires** : système de confiance avec critères/score (bronze/argent/or/platine), suspension possible (bloque la publication).
- **Partner Hub PMS** : showrooms publics des partenaires (Partner Management System, 20 étapes : leads, devis, showroom).
- **Founding Partners** : suivi des dossiers d'onboarding (LOI + Accord), statut de signature.

## FINANCE
- **Commissions** : vue des commissions par transaction.
- **Factures** : génération/consultation des factures mensuelles.
- **Paiements** : demandes d'abonnement/paiement en attente.
- **Escrow / Séquestre** : transactions Import/Export avec fonds en séquestre — vérification manuelle des paiements virement/mobile money/crypto avant passage en "in_escrow".

## COMMUNICATION
- **Notifications & Broadcast** : envoi de notifications groupées.
- **Avis clients** : modération des avis (masquer/réafficher).
- **Publicités & Campagnes** : gestion des bannières publicitaires.
- **Support Client** : voir Manuel du Support §1.1.

## SYSTÈME
- **Rôles & Permissions** : gestion fine des scopes admin (super_admin, finance, kyc, import_export, support, moderation) — la plupart des routes existantes ne vérifient pas encore ces scopes individuellement (accès total par défaut pour tout compte admin), seules les routes les plus récentes le font.
- **Journal d'audit** : historique des actions admin sensibles.

## Rappels importants

- **Aucun chiffrement au repos** des données sensibles (KYC, identité) à ce jour — traiter tout accès à ces données avec la plus grande prudence (voir ARCHITECTURE.md §7.4).
- **Aucun remboursement automatique** — toute décision de remboursement doit être exécutée manuellement en dehors de la plateforme.
- Les mots de passe admin et les identifiants MongoDB Atlas doivent être **rotés régulièrement** (point de vigilance déjà identifié lors de l'audit sécurité de juillet 2026).
