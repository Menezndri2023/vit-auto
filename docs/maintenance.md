# Maintenance de VIT AUTO

Ce guide décrit comment le site et l'application restent en bon état : ce qui est surveillé automatiquement, ce qu'il faut vérifier soi-même, et quoi faire quand quelque chose casse.

Le système est né d'un incident du 5 octobre 2026. Un partenaire « pièces » de Côte d'Ivoire a publié une annonce, le serveur l'a refusée (vérification d'identité en cours), l'écran l'a renvoyé en silence vers la page KYC, et l'administrateur ne trouvait l'annonce nulle part. Aucune erreur, aucune alerte : **les pannes les plus coûteuses ne lèvent pas d'exception**. Elles se voient seulement en comptant ce qui attend.

## 1. Ce qui tourne tout seul

| Quoi | Quand | Où l'on voit le résultat |
|---|---|---|
| **Veille de maintenance** (`server/utils/maintenanceWatchdog.js`) : dossiers d'identité en attente, lecture automatique des pièces, publications refusées, partenaires bloqués, annonces en attente de modération (véhicules, chauffeurs, loisirs, import/export, pièces) | En continu (calcul à la demande) | Admin → **Santé système** (toutes les vérifications, vertes comprises) |
| **Digest quotidien** (`server/utils/dailyOpsDigest.js`) : demandes sans réponse, litiges, fraude, leads hors délai, plus les points non verts de la veille | Chaque matin à 7 h (heure du serveur) | Notification et e-mail aux administrateurs |
| **Journal des publications refusées** : chaque refus d'une garde serveur (identité, certification, secteur, quota, palier) | À chaque refus | Admin → Santé système → « Publications refusées » |
| **Sonde externe** (`.github/workflows/surveillance-production.yml`) : site, API, catalogue non vide | Toutes les 6 heures, depuis GitHub | E-mail de GitHub en cas d'échec |
| **Santé des communications** (`server/utils/communicationHealthCheck.js`) | Toutes les 6 heures | Admin → Emails & Livraison |
| **Garde avant envoi** (`.githooks/pre-push`) : tests, build, API locale, balayage navigateur | À chaque `git push` | Le push est refusé si quelque chose casse |

## 2. Routines

**Chaque jour (5 minutes)**
- Lire le digest « À traiter aujourd'hui ».
- Admin → **KYC / Identités** : traiter les dossiers en attente. Un partenaire particulier ne peut rien publier tant que son identité n'est pas validée.
- Admin → **Santé système** : tout point rouge ou orange a un bouton « Traiter → ».

**Chaque semaine**
- Admin → Santé système → **Publications refusées** : relancer chaque partenaire refusé (téléphone ou e-mail affichés). C'est souvent un nouveau partenaire qui croit avoir publié.
- Vider les files de modération (onglets Annonces, Chauffeurs, Activités, Pièces). Une annonce en attente depuis des semaines est un partenaire perdu.
- Vérifier dans GitHub → Actions que la « Surveillance production » est verte.

**Chaque mois**
- Suite complète des tests serveur, **seule** (environ 1 h) : `cd server && npx vitest run --maxWorkers=1`.
- Dépendances : `npm outdated` (racine et `server/`) ; mettre à jour en une branche, garde avant envoi comprise.
- Contrôler le quota et les rebonds e-mail (Resend), l'espace ImageKit, l'espace MongoDB Atlas.
- Tester une restauration de sauvegarde MongoDB Atlas sur une base de test.

## 3. Diagnostiquer

Depuis le poste de l'exploitant (le `.env` du serveur pointe vers la production), **en lecture seule** :

```bash
cd server && node scripts/diagnosticProduction.mjs
```

Le script affiche les mêmes vérifications que l'onglet Santé système, plus les publications refusées des 7 derniers jours.

Contrôle complet du site en conditions réelles :

```bash
VERIF_ADMIN_ID=… VERIF_ADMIN_PWD=… node scripts/verifierLocalement.mjs https://vit-auto.com
```

Le limiteur de l'API accepte 200 requêtes par 5 minutes : ne lancez pas ce balayage en boucle.

## 4. Quand quelque chose casse

1. **Constater sans toucher** : diagnostic ci-dessus, onglet Santé système, journaux Render, Sentry.
2. **Reproduire en local** dans les conditions de production : `npm run api:local` puis `npm run preview:csp`. Ne jamais déboguer directement sur la production.
3. **Corriger avec un test** qui échouait avant la correction.
4. **Envoyer par la garde** (`git push` sans `--no-verify`).
5. **Ajouter une vérification à la veille** si la panne était silencieuse. C'est la règle qui empêche la même panne de revenir sans qu'on la voie.

## 5. Pièges déjà rencontrés

- **Une publication refusée ne laissait aucune trace.** Désormais, chaque refus est journalisé (`refuserPublication` dans les contrôleurs de création).
- **Les écrans quittaient le formulaire au moment d'un refus** : le travail était perdu et le message trompeur. Désormais, un encadré s'affiche sur place (`src/components/RefusPublication`).
- **Les justificatifs envoyés depuis le Profil étaient stockés bruts dans la fiche utilisateur** : au-delà de 16 Mo, l'envoi échouait en « Erreur serveur ». Ils passent désormais par le stockage privé, avec une URL chiffrée (`server/utils/deposerPiece.js`). Les photos sont compressées avant l'envoi (`src/utils/compresserDocument.js`).
- **Les comptes de démonstration semés par script** (revue Apple) faussent les statistiques : la veille les exclut de la mesure de lecture des pièces.
- **Panier multi-véhicules resté sur l'ancienne validation admin** : les demandes n'arrivaient jamais au partenaire. Toute nouvelle voie de création de commande doit passer par la transmission directe, comme `createBooking`.
- **Commission des pièces recalculée au règlement** au mauvais taux et sur le mauvais montant : utiliser `cleCommission()` et `assietteCommission()` (bookingController).
- **PDF** : ne jamais écrire du texte à `doc.y - n` après un `rect()`. Utiliser `section()`, `row()` et `bandeau()` (`server/utils/pdfGenerator.js`). Vérifier le rendu en image avant d'envoyer, avec pdf.js dans Playwright (voir l'historique du 2026-10-06).
- **Comptes de démonstration** (revue Apple) : ils ne sont pas marqués « test ». Les exclure de toute statistique.
- Voir aussi le fichier `CLAUDE.md` (règle de test local avant tout envoi).
