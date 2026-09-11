# Publier VIT AUTO sur l'App Store

Rédigé le 2026-09-11, d'après l'état réel du projet et de la machine à cette date.

## Pourquoi rien n'est publié à ce jour

Payer l'Apple Developer Program **ne publie rien** : il faut qu'un binaire signé
soit compilé puis envoyé à App Store Connect, et cela n'est possible qu'avec un
compte **actif** (Apple encaisse d'abord, vérifie l'identité ensuite, et
n'active l'adhésion qu'après). Au 2026-09-11 :

- le compte est « en attente » depuis le 28 juillet (délai officiel : 24–48 h) ;
- aucun binaire n'a jamais été envoyé : pas de Team ID, pas de certificat,
  pas d'archive, pas de fiche App Store Connect ;
- la machine de développement n'a pas Xcode (Command Line Tools seulement) ;
- la CI iOS échouait depuis sa création (Node 20 alors que Capacitor 8 exige
  Node 22, puis `pod install` alors que le projet est en Swift Package Manager).

Ce que le dépôt contient désormais : la CI iOS compile réellement le projet
(`mobile.yml`) et un workflow de publication (`ios-release.yml`) signe et envoie
l'app à App Store Connect **sans rien installer localement**. Il ne manque que
les identifiants Apple — étape 1 ci-dessous.

## Étape 1 — Débloquer le compte Apple Developer (à faire par le titulaire)

1. Ouvrir l'app **Apple Developer** sur iPhone (ou <https://developer.apple.com/account>)
   et lire le statut exact du dossier : « Pending », « Waiting for documents »,
   « Payment pending »… Le libellé dit tout.
2. Chercher dans la boîte mail (spam compris) tout message de
   `developer@apple.com` / `no_reply@email.apple.com` depuis le 28 juillet :
   Apple demande souvent une pièce d'identité ou un selfie **et n'avance pas
   tant que la demande reste sans réponse**.
3. Vérifier que les 99 $ ont été **débités** (relevé bancaire + historique
   d'achats Apple). Un paiement « en attente » = dossier jamais ouvert.
4. Contacter le support : <https://developer.apple.com/contact/> → *Membership
   and Account* → *Enrollment*. Par téléphone, c'est nettement plus rapide que
   le formulaire. Préparer :
   - l'**Enrollment ID** (dans l'e-mail de confirmation d'achat) ;
   - l'Apple ID utilisé ;
   - la date et le montant du paiement ;
   - une pièce d'identité au **nom légal exact** de l'Apple ID (la moindre
     différence de format déclenche une vérification manuelle) ;
   - si l'inscription est au nom de l'entreprise : le numéro **D‑U‑N‑S** et
     une preuve d'autorité de signature — sans cela, préférer réinscrire en
     tant qu'**individu** (plus rapide ; le nom du vendeur sur l'App Store
     sera alors le nom de la personne, modifiable plus tard).

Le compte est actif quand <https://developer.apple.com/account> affiche
**Membership details** avec un **Team ID** (10 caractères).

## Étape 2 — Créer la clé d'API App Store Connect (5 minutes)

1. <https://appstoreconnect.apple.com> → **Users and Access** → onglet
   **Integrations** → **App Store Connect API** → **Team Keys** → **+**.
2. Nom : `GitHub CI`, accès : **Admin** (nécessaire pour que Xcode crée
   lui-même le certificat de distribution et le profil de provisionnement).
3. Télécharger le fichier `AuthKey_XXXXXXXXXX.p8` — **il ne peut être
   téléchargé qu'une seule fois** ; le garder en lieu sûr.
4. Noter le **Key ID** (colonne de la clé) et l'**Issuer ID** (au-dessus de la
   liste).

## Étape 3 — Renseigner les 4 secrets GitHub

Dépôt GitHub → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret** :

| Secret | Valeur |
|---|---|
| `APPLE_TEAM_ID` | Team ID (page Membership details) |
| `APP_STORE_CONNECT_KEY_ID` | Key ID de l'étape 2 |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID de l'étape 2 |
| `APP_STORE_CONNECT_PRIVATE_KEY` | **contenu intégral** du fichier `.p8` (de `-----BEGIN PRIVATE KEY-----` à `-----END PRIVATE KEY-----`) |

## Étape 4 — Créer la fiche de l'app dans App Store Connect

App Store Connect → **Apps** → **+** → **New App** :

- Plateforme : iOS · Nom : **VIT AUTO** · Langue principale : Français
- **Bundle ID** : `com.vitauto.app` — s'il n'apparaît pas dans la liste, le
  créer d'abord sur <https://developer.apple.com/account/resources/identifiers>
  (App IDs → +, **cocher Push Notifications**) ;
- SKU : `vitauto-ios` · Accès : Full Access.

## Étape 5 — Lancer la publication

GitHub → **Actions** → **VIT AUTO — Publication iOS** → **Run workflow** →
saisir la version (ex. `1.0.0`) → **Run**.

Le workflow compile, signe (Apple gère certificat et profil) et envoie le
build. Il s'arrête immédiatement, avec la liste de ce qui manque, si un secret
est absent. Durée : 15–25 min. Le build apparaît ensuite dans App Store Connect
→ **TestFlight** (traitement Apple : 10–30 min). Le numéro de build est le
numéro d'exécution du workflow — relancer le workflow suffit pour un nouveau
build, jamais de doublon.

Premier envoi : un e-mail « Missing Compliance » est normal si le projet ne
déclarait pas `ITSAppUsesNonExemptEncryption` — c'est fait dans `Info.plist`.

## Étape 6 — Compléter la fiche et soumettre à la review

Dans App Store Connect → l'app → version 1.0 :

1. **Captures d'écran** : iPhone 6,7" (1290×2796) obligatoires ; **iPad 13"
   (2064×2752) aussi**, car le projet cible iPhone + iPad
   (`TARGETED_DEVICE_FAMILY = 1,2`). Les produire depuis le simulateur Xcode
   (⌘S) ou depuis un appareil TestFlight.
2. **Description, mots-clés, URL d'assistance** : `https://vit-auto.com/help` ;
   **URL de politique de confidentialité** : `https://vit-auto.com/privacy`.
3. **App Privacy** (« étiquettes nutritionnelles ») : déclarer exactement ce
   que `ios/App/App/PrivacyInfo.xcprivacy` déclare — nom, e-mail, téléphone,
   adresse, position précise, photos, pièce d'identité (Other User Contact
   Info), informations de paiement, historique d'achats, identifiant
   utilisateur, identifiant d'appareil ; toutes **liées à l'utilisateur**,
   **sans suivi publicitaire**. Une incohérence entre les deux entraîne un
   rejet.
4. **App Review Information** : l'app exige une connexion → fournir un
   **compte de démonstration** (e-mail + mot de passe d'un compte client de
   test réel, KYC déjà validé) et un compte partenaire. Sans cela, rejet
   automatique (règle 2.1).
5. **Notes pour la review** — à coller telles quelles, elles anticipent le
   motif de rejet le plus fréquent pour une app Capacitor (règle 4.2,
   « site web emballé ») :

   > VIT AUTO est une place de marché de location, vente et import/export de
   > véhicules en Afrique et en France. L'app utilise des capacités natives
   > indispensables au service : appareil photo natif pour la vérification
   > d'identité (KYC, scan de pièce + selfie), géolocalisation pour la
   > recherche de véhicules à proximité et le calcul des frais de livraison,
   > notifications push pour le suivi des réservations et des paiements,
   > détection hors-ligne. Compte de démonstration : voir App Review
   > Information.

6. **Classification d'âge** : questionnaire → 4+ (aucun contenu sensible) ;
   **Prix** : gratuit ; **Disponibilité** : tous les pays ou la liste des pays
   configurés dans la plateforme.
7. **Add for Review** → **Submit**. Délai de review : 24–72 h en général.

## Facultatif — Xcode sur la machine de développement

Non nécessaire pour publier (la CI s'en charge), mais utile pour les captures
d'écran et le débogage sur simulateur. Homebrew et `mas` sont installés ;
Xcode se télécharge depuis l'App Store (session App Store ouverte requise) :

```bash
sudo mas install 497799835          # Xcode (≈ 4 Go à télécharger, 15 Go installés)
sudo xcode-select -s /Applications/Xcode.app
sudo xcodebuild -license accept
npx cap open ios                    # ouvre ios/App/App.xcodeproj
```

Le projet est en Swift Package Manager : **pas de `pod install`**, ouvrir
`App.xcodeproj` (et non un `.xcworkspace`).

## Ce qui reste hors périmètre de ce manuel

- **Notifications push réelles sur iOS** : l'entitlement `aps-environment`
  est en place et l'App ID recevra la capacité Push, mais la remise passe par
  Firebase (`PushChannel.js` côté serveur) : il faut un projet Firebase avec
  la clé APNs téléversée, `GoogleService-Info.plist` dans `ios/App/App` et
  `FCM_SERVER_KEY` sur le serveur. Tant que ce n'est pas fait, l'enregistrement
  du token réussit et l'envoi reste un no-op silencieux.
- **Google Play** : nécessite un compte Google Play Console (25 $) et une
  keystore de release (`signingConfigs` absent de `android/app/build.gradle`).
