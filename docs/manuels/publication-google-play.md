# Publication Google Play — VIT AUTO (Android)

Rédigé le 2026-10-03. L'app iOS est en vente depuis le 23/09 ; l'app Android
est le même projet Capacitor (`com.vitauto.app`, interface embarquée, API
`https://vit-auto.com`). Rien n'est à installer sur le Mac : le workflow
`android-release.yml` compile et signe sur GitHub.

## 0. Le piège du calendrier : 14 jours de test fermé

Un compte Play Console **personnel** créé après le 13 novembre 2023 ne peut pas
publier directement en production. Google exige d'abord un **test fermé avec au
moins 12 testeurs inscrits pendant 14 jours d'affilée**, puis un questionnaire,
puis une vérification (quelques jours). Compter **3 semaines minimum** entre le
premier AAB et la mise en vente. Un compte **organisation** (numéro D-U-N-S)
n'a pas cette obligation.

Les testeurs : 12 adresses Gmail réelles (proches, partenaires, équipe) qui
acceptent le lien d'inscription ET installent l'app. Un testeur qui se
désinscrit avant la fin fait retomber le compteur sous 12.

## 1. Compte Play Console (exploitant)

1. `https://play.google.com/console/signup` — frais uniques de 25 USD.
2. Type de compte : personnel (ou organisation si D-U-N-S disponible — voir § 0).
3. Vérification d'identité (pièce + adresse) et vérification d'un téléphone
   Android via l'app Play Console. Délai : de quelques heures à quelques jours.

## 2. Secrets GitHub (une fois)

Clé d'envoi déjà générée le 2026-10-03, hors dépôt :
`~/vit-auto-signing/android/` (`upload-keystore.p12`, `keystore.password`,
`key.alias`, certificat `upload.crt`, empreinte SHA-256
`82:68:BD:83:0D:8B:2A:EC:9C:A3:5E:83:6F:31:CE:B4:DB:CF:2D:97:B9:29:85:65:4A:78:16:DF:5F:8B:CF:61`).
**La sauvegarder** (gestionnaire de mots de passe ou clé USB) — en cas de
perte, Google peut la remplacer (Play App Signing) mais la procédure prend
plusieurs jours.

GitHub → dépôt → Settings → Secrets and variables → Actions → New repository
secret, trois fois, valeurs dans `~/vit-auto-signing/android/SECRETS-GITHUB.txt` :

| Secret | Valeur |
|---|---|
| `ANDROID_KEY_ALIAS` | `vitauto-upload` |
| `ANDROID_KEYSTORE_PASSWORD` | contenu de `keystore.password` |
| `ANDROID_KEYSTORE_BASE64` | la longue ligne base64 |

## 3. Premier AAB

GitHub → Actions → « VIT AUTO — Publication Android (Google Play) » → Run
workflow → version `1.1` (alignée sur iOS). ~6 min. Télécharger l'artefact
`vit-auto-android-1.1-<n>` (zip contenant `app-release.aab`).

Le **premier** AAB se téléverse à la main : Google refuse qu'une API crée
l'app. Les suivants peuvent partir seuls (§ 8).

## 4. Créer l'app dans la Play Console

Créer une application → nom `VIT AUTO`, langue par défaut Français (France),
Application, Gratuite, cocher les déclarations.

Puis **Tests → Test fermé → Créer un canal** (ou « Alpha ») :
- Pays : tous, ou les 28 pays configurés ;
- Testeurs : créer une liste d'adresses e-mail (≥ 12) ;
- Nouvelle version → **Play App Signing : accepter** (Google garde la clé de
  signature, notre clé ne sert qu'à l'envoi) → téléverser `app-release.aab` →
  notes de version → Enregistrer → Envoyer pour examen.
- Copier le **lien d'inscription** des testeurs et le leur envoyer.

## 5. Fiche du Store (Croissance → Fiche principale)

| Champ | Valeur |
|---|---|
| Nom (30) | `VIT AUTO` |
| Description courte (80) | `Louez, achetez ou importez un véhicule dans 28 pays, en toute confiance.` |
| Description complète (4000) | reprendre le bloc **Description** de `fiche-app-store.md` à l'identique |
| Icône 512 × 512 | `~/Desktop/Captures-App-Store/google-play/icone-512.png` |
| Bannière 1024 × 500 | `~/Desktop/Captures-App-Store/google-play/banniere-1024x500.png` |
| Captures téléphone (2 à 8) | `~/Desktop/Captures-App-Store/android-telephone/` (1080 × 1920, les 7) |
| Captures tablette 10" | `~/Desktop/Captures-App-Store/android-tablette/` (1600 × 2560) |
| Catégorie | Voyages et infos locales (ou Auto et véhicules) |
| E-mail de contact | `contact@vit-auto.com` |
| Site web | `https://vit-auto.com` |

⚠️ Les captures iPhone sont **refusées** par Google Play : leur grand côté
dépasse 2× le petit (1284 × 2778). Régénérer les formats Android :
`node scripts/capturesAppStore.mjs android` (pays du catalogue figé sur le
Maroc ; sinon la détection IP suit la machine qui capture).

## 6. Contenu de l'application (Règles → Contenu de l'application)

Chaque rubrique doit être remplie, sinon la version reste bloquée.

- **Règles de confidentialité** : `https://vit-auto.com/privacy`
- **Accès à l'application** : « Tout ou partie des fonctionnalités sont
  restreintes » → identifiants client `review-apple@vit-auto.com` et
  partenaire `review-partner@vit-auto.com` (mots de passe dans
  `~/Desktop/COMPTE-REVIEW-APPLE.txt` et `COMPTE-REVIEW-PARTENAIRE.txt`).
  Vérifier avant l'envoi que les comptes se connectent et que les annonces de
  démo sont actives (`creerCompteReviewApple.mjs --apply --partenaire
  --annonces`) — contrôler par `/api/vehicles/:id`, jamais par le code HTTP
  de la page (SPA, répond toujours 200).
- **Annonces** : Non, l'app ne contient pas de publicité.
- **Classification du contenu** (questionnaire IARC) : catégorie « Toutes les
  autres types d'application » ; violence/sexualité/jeux d'argent/drogues :
  Non ; **interaction entre utilisateurs : Oui** (chat client ↔ partenaire) ;
  partage de la position : Oui ; achats de biens numériques : Non.
- **Public cible** : **18 ans et plus** (location, vérification d'identité,
  paiements).
- **Applications d'actualités** : Non. **Santé** : Non. **Appli
  gouvernementale** : Non.
- **Fonctionnalités financières** : l'app ne propose ni prêt, ni crédit en
  propre, ni portefeuille ; le crédit affiché sur certaines annonces est celui
  du vendeur. Répondre selon les cases proposées, sans cocher « prêts personnels ».
- **Suppression des données** : « les utilisateurs peuvent demander la
  suppression de leur compte » → URL
  `https://vit-auto.com/privacy#suppression-compte` (section « 10 bis » de la
  page, Profil → Sécurité → Supprimer le compte ; l'ancre est citée ici, ne pas
  la renommer).
- **Sécurité des données** : voir § 7.

## 7. Sécurité des données (Data safety)

Collecte : **Oui**. Chiffrement en transit : **Oui**. Suppression possible :
**Oui** (URL ci-dessus). Partage avec des tiers : **Non** (les prestataires
techniques — hébergement, paiement, e-mail — sont des sous-traitants, que
Google exclut du « partage »). Pour chaque type ci-dessous : collecté, non
facultatif sauf mention, finalité **Fonctionnement de l'application** (+
**Prévention des fraudes, sécurité** pour l'identité).

| Catégorie Play | Types |
|---|---|
| Informations personnelles | Nom, Adresse e-mail, Numéro de téléphone, Adresse, Autres infos (n° de passeport / pièce) |
| Informations financières | Infos de paiement de l'utilisateur, Historique des achats |
| Position | Position exacte (facultative) |
| Messages | Autres messages dans l'application (chat) |
| Photos et vidéos | Photos (pièce d'identité, selfie, annonces) |
| Infos et performances de l'appli | Journaux de plantage, Diagnostic (Sentry) |
| Identifiants de l'appareil ou autres | Jeton de notification de l'appareil |

Cohérence obligatoire avec `https://vit-auto.com/privacy` : une divergence
entre la fiche et la politique est un motif de rejet.

## 8. Envois suivants automatiques (facultatif)

Google Cloud Console → projet → IAM → Comptes de service → créer → clé JSON.
Play Console → Utilisateurs et autorisations → inviter l'adresse du compte de
service, droits « Publier sur les canaux de test » (et production plus tard).
Coller le JSON dans le secret `PLAY_SERVICE_ACCOUNT_JSON`. Le workflow envoie
alors l'AAB sur la piste choisie, **en brouillon** : rien n'est diffusé sans
un clic dans la Play Console.

## 9. Production

Après 14 jours de test fermé avec ≥ 12 testeurs : Tableau de bord → « Demander
l'accès à la production » → questionnaire (comment le test s'est passé, ce qui
a été corrigé) → examen Google → Production → Créer une version → reprendre
l'AAB du test fermé (pas besoin d'en recompiler un) → déploiement.

## Notes techniques

- `versionCode` = numéro d'exécution du workflow (toujours croissant).
  `versionName` = saisie. Google ne ferme pas un nom de version comme Apple,
  mais garder iOS et Android alignés évite la confusion au support.
- **Push Android coupé** : sans `google-services.json` (projet Firebase),
  `PushNotifications.register()` fait planter l'app. Le code le saute tant
  que `VITE_PUSH_ANDROID` ne vaut pas `1`. Pour l'activer : créer le projet
  Firebase, ajouter l'app `com.vitauto.app`, poser `google-services.json`
  dans `android/app/` (via un secret dans le workflow) et
  `VITE_PUSH_ANDROID=1` au build web. Les notifications app ouverte (Socket.io)
  fonctionnent sans.
- Géolocalisation : permissions déclarées dans `AndroidManifest.xml` ; GPS et
  caméra marqués facultatifs pour ne pas exclure les tablettes.
- Paiement : comme sur iOS, **ne jamais vendre de contenu numérique** (plans
  partenaires) dans l'app sans la facturation Google Play. Les services réels
  (location, achat de véhicule) en sont exemptés.
- Non vérifié localement (ni Java ni SDK Android sur le Mac Intel) : la
  compilation release n'est prouvée qu'en CI. **Tester l'app du test fermé sur
  un vrai téléphone Android** (catalogue qui se remplit, connexion, KYC par
  l'appareil photo, « près de moi », bouton retour) avant de demander la
  production.
