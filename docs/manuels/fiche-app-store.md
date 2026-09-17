# Fiche App Store — VIT AUTO (version 1.0)

Rédigée le 2026-09-15, après l'envoi du build 5 (v1.0.0) à App Store Connect.
Textes tirés du site en production (aucun chiffre inventé : « 28 pays » est
le nombre de pays configurés). Toutes les longueurs respectent les limites
d'App Store Connect. À coller dans App Store Connect → Apps → VIT AUTO →
version 1.0 (langue : Français).

## Informations de l'app (App Information)

| Champ | Valeur |
|---|---|
| Nom (30) | `VIT AUTO` |
| Sous-titre (30) | `Location, achat, import auto` |
| Catégorie principale | Voyages (Travel) |
| Catégorie secondaire | Shopping |
| Droits d'auteur | © 2026 VIT AUTO |
| URL de politique de confidentialité | `https://vit-auto.com/privacy` |

## Version 1.0

**Texte promotionnel (170)** — modifiable sans nouvelle review :

> Louez, achetez ou importez un véhicule dans 28 pays. Réservation en ligne, contrat automatique, paiement sécurisé, livraison suivie par GPS.

**Mots-clés (100)** — séparés par des virgules, sans espace après :

```
location voiture,achat auto,import véhicule,export,chauffeur,pièces auto,Abidjan,Casablanca,Afrique
```

**URL d'assistance** : `https://vit-auto.com/help`
**URL marketing** : `https://vit-auto.com`

**Description (4000)** :

```
VIT AUTO est la place de marché automobile qui réunit location, achat, import-export, chauffeurs, activités de loisirs et pièces détachées, dans 28 pays d'Afrique, du Maghreb et d'Europe.

LOUER UN VÉHICULE
• Catalogue filtré par ville, type, état et budget
• Réservation en ligne à toute heure, réponse du partenaire suivie dans votre espace
• Contrat généré automatiquement et signable en ligne
• Livraison à domicile avec frais calculés par GPS, connus avant de confirmer
• Prolongation et annulation motivée depuis l'app

ACHETER OU FAIRE UN ESSAI
• Véhicules neufs et d'occasion, prix face au marché
• Demande d'essai en quelques secondes, rendez-vous confirmé par le vendeur
• Financement et crédit sur les annonces qui le proposent

IMPORTER OU EXPORTER
• Commandez depuis la Chine, Dubaï, l'Europe ou le Maghreb
• Inspection, transport, dédouanement et livraison suivis étape par étape
• Incoterms 2020 affichés sur chaque annonce, coût d'import estimé avant d'acheter
• Paiement sous séquestre, libéré à la réception confirmée

CHAUFFEURS, LOISIRS, PIÈCES
• Chauffeurs professionnels vérifiés, à la journée ou en mission
• Activités et loisirs : plongée, quad, jetski, excursions
• Pièces détachées livrées, en vente directe ou par importation

CONFIANCE
• Chaque partenaire est contrôlé : identité, documents du véhicule, assurance
• Vérification d'identité par pièce et selfie, directement depuis l'appareil photo
• Paiement chiffré : carte bancaire, Orange Money, Wave, CMI
• Notifications en temps réel sur vos réservations et paiements
• Points de fidélité sur chaque transaction

VIT AUTO est aussi l'espace des partenaires : publiez vos véhicules, vos activités ou vos pièces, gérez vos réservations, votre calendrier et vos reversements depuis l'app.
```

## Captures d'écran

Produites par `node scripts/capturesAppStore.mjs` (Chromium de la garde,
site de production, User-Agent iPhone/iPad, compte de démonstration
connecté) dans `~/Desktop/Captures-App-Store/` :

- `iphone-6.7/` 1290 × 2796 · `iphone-6.5/` 1284 × 2778 ;
- `ipad-13/` 2064 × 2752 · `ipad-12.9/` 2048 × 2732.

Le créneau proposé par App Store Connect varie (le compte VIT AUTO demande
l'iPhone 6,5" : « 1242 × 2688 ou 1284 × 2778 ») — prendre le dossier dont
les dimensions correspondent au message du créneau.

Ordre : accueil, catalogue, fiche véhicule, import/export, réservation
(badge CERTIFIÉ), espace client, vérification d'identité. Glisser les 7 dans
l'ordre sur chaque onglet d'App Store Connect (3 minimum, 10 maximum).
L'app affichant le site en direct, ces captures sont fidèles à ce que le
reviewer verra ; le catalogue a besoin de ~8 s pour se remplir (le script
attend).

## App Privacy (étiquettes)

Déclarer exactement ce que `ios/App/App/PrivacyInfo.xcprivacy` déclare —
une divergence entraîne un rejet. Réponse à « Do you collect data ? » :
**Oui**. Pour chaque type : **Linked to the user's identity : Oui** ·
**Used for tracking : Non** · **Purpose : App Functionality**.

| Catégorie App Store Connect | Type |
|---|---|
| Contact Info | Name, Email Address, Phone Number, Physical Address, Other User Contact Info (pièce d'identité) |
| Financial Info | Payment Info, Purchase History |
| Location | Precise Location |
| User Content | Photos or Videos |
| Identifiers | User ID, Device ID |

## Classification par âge

**Contenu** (violence, sexualité, jeux d'argent, alcool, horreur, médical…) :
**Aucun / Non** partout.

**Fonctionnalités** — répondre honnêtement, c'est vérifié à la review :

| Question | Réponse |
|---|---|
| Messagerie / chat entre utilisateurs | **Oui** (chat client ↔ partenaire, supervisé) |
| Contenu généré par les utilisateurs | **Oui** (annonces, photos, avis) — modération, signalement : **Oui** |
| Accès web non restreint | **Non** (l'app n'ouvre que vit-auto.com) |
| Publicité de tiers | **Non** (bannières internes seulement) |
| Achats intégrés | **Non** (paiements de services réels, pas d'IAP) |
| Concours, loteries | **Non** |

Résultat attendu : **12+ / 13+** — normal pour une place de marché avec
messagerie ; déclarer « Non » au chat pour obtenir 4+ serait une fausse
déclaration, motif de rejet.

## Prix et disponibilité

Gratuit · tous les pays et régions (ou la liste des 28 pays configurés).

## App Review Information — OBLIGATOIRE

L'app exige une connexion : sans compte de démonstration, rejet automatique
(règle 2.1). Le compte existe en production, créé par
`node server/scripts/creerCompteReviewApple.mjs --apply` (relancer pour
réinitialiser le mot de passe, `--supprimer` pour l'effacer) :

- **User name** : `review-apple@vit-auto.com`
- **Password** : dans `~/Desktop/COMPTE-REVIEW-APPLE.txt` (jamais dans le dépôt)
- Client, e-mail et téléphone vérifiés, identité VERIFIE avec score 96/100 —
  le reviewer arrive directement sur un compte prêt à réserver. Pas marqué
  compte de test : il voit le catalogue public complet.

Champs : Sign-in required **Oui** · User name / Password : ceux du compte
client · Contact : prénom, nom, téléphone, e-mail de la personne joignable
pendant la review.

**Notes (4000)** :

```
VIT AUTO is a vehicle marketplace (rental, sale, import/export, drivers, leisure activities, spare parts) operating in 28 countries across Africa, the Maghreb and Europe.

The app relies on native capabilities that the service requires:
- Native camera for identity verification (KYC: ID document scan + selfie), needed before any booking or listing.
- Geolocation to find vehicles nearby and to compute home-delivery fees from the real distance.
- Push notifications for booking, payment and delivery updates.
- Offline detection with a dedicated banner.

Demo account (client, identity already verified): see fields below. A partner account is also provided to review the listing side.
```

## Soumission

Sélectionner le **build 5** (ou le plus récent) → Version Release :
**Manually release this version** (pour choisir le jour de mise en ligne)
→ **Add for Review** → **Submit to App Review**. Délai habituel : 24 à 72 h.

En cas de rejet 4.2 (« site web emballé ») : répondre dans Resolution Center
en renvoyant aux capacités natives listées dans les notes, avec les captures
du KYC caméra et de la livraison GPS.

## Demande d'information Apple (règle 2.1, 2026-09-16) — réponse

Premier verdict sur la version 1.0 (build 6) : « Guideline 2.1 – Information
Needed – New App Submission ». Ce n'est pas un rejet sur le fond : Apple le
demande à tout compte développeur récent. Il faut (1) une vidéo d'écran sur
un iPhone réel, (2) une réponse en six points dans App Store Connect, (3) la
même réponse collée dans les Notes de l'App Review Information.

Ce qui a été construit pour y répondre honnêtement (commit du 2026-09-17) :
- **Suppression réelle du compte** (5.1.1 v) : la route « Supprimer mon
  compte » ne faisait que désactiver (« réversible via le support ») — ce
  qu'Apple juge explicitement insuffisant. Désormais : suppression pure sans
  réservation, anonymisation définitive sinon (voir usersController).
- **Signaler + bloquer dans le chat** (1.2) : boutons dans l'en-tête d'une
  conversation client ↔ partenaire ; un utilisateur bloqué ne peut plus
  écrire ni recevoir (`User.blockedUsers`, `POST/DELETE /api/users/:id/block`).
- **Compte partenaire de démonstration** : `review-partner@vit-auto.com`
  (`node server/scripts/creerCompteReviewApple.mjs --apply --partenaire`,
  mot de passe dans `~/Desktop/COMPTE-REVIEW-PARTENAIRE.txt`).

### Scénario de la vidéo (iPhone, iOS à jour, TestFlight build 6 ou suivant)

Réglages → Centre de contrôle → ajouter « Enregistrement de l'écran », puis
lancer l'enregistrement AVANT d'ouvrir l'app. 4 à 6 minutes, sans son.
1. Lancement de l'app (splash) → accueil → catalogue → fiche d'un véhicule.
2. **Inscription** d'un nouveau compte client (adresse jetable, code e-mail).
3. Connexion avec ce compte → réservation d'un chauffeur (aucun document)
   jusqu'à l'écran de confirmation → « Mes réservations ».
4. Chat : ouvrir la conversation avec le partenaire, montrer **Signaler** (la
   fenêtre) puis **Bloquer** → bandeau « vous avez bloqué » → Débloquer.
5. Vérification d'identité : /kyc, montrer l'ouverture de la caméra (sans
   aller au bout).
6. Se déconnecter, se connecter avec `review-partner@vit-auto.com` → espace
   partenaire → « Publier une annonce » jusqu'à l'étape photos (caméra).
7. Retour au compte créé en 2 → Profil → **Supprimer le compte** → mot de
   passe → déconnexion → tenter de se reconnecter : refusé.
Ne pas montrer la page /plans (abonnements partenaires contractés hors app).

### Texte de réponse (Resolution Center ET Notes) — en anglais

```
Thank you for reviewing VIT AUTO. Answers to your six points:

1. SCREEN RECORDING — attached (recorded on a physical iPhone, latest iOS). It shows: app launch, account registration with e-mail code, login, a full chauffeur booking, the client ↔ partner chat with the Report and Block actions, the identity-verification camera flow, the partner side (login with the partner demo account, listing creation with photo capture), and account deletion from Profile → "Supprimer le compte" (permanent: personal data erased, the account can no longer sign in).

2. PURPOSE AND AUDIENCE — VIT AUTO is a vehicle-services marketplace for Africa, the Maghreb and Europe (28 countries). It connects customers with verified professional partners for car rental, vehicle purchase (test-drive request), chauffeur services, leisure activities, spare parts and international vehicle import/export. The problem it solves: in these markets, renting or buying a vehicle still relies on phone calls, informal listings and no identity verification on either side. Value: verified partners, verified customers (ID + selfie check), transparent prices in the customer's currency, bookings tracked from request to completion, and a direct chat with the partner. Audience: adults (18+) travelling or living in these countries, and professional vehicle partners (rental companies, dealers, chauffeurs, leisure operators, parts sellers, exporters).

3. SETUP AND ACCESS — No sample files are needed. Two demo accounts are provided in App Review Information:
   • Customer: review-apple@vit-auto.com / (password in the credentials field) — identity already verified, so booking is immediate.
   • Partner (rental company): review-partner@vit-auto.com / (password in the Notes) — sees the partner dashboard, can publish a listing and receive bookings.
   Main features: Catalogue → vehicle → "Réserver"; Services → Chauffeur → "Réserver ce chauffeur"; bottom bar "Chat" for conversations; Profile → "Vérification d'identité" (camera) and "Supprimer le compte". Registration with a new e-mail works too: a 6-digit code is sent by e-mail.

4. EXTERNAL SERVICES — Hosting: Render (API) and Vercel (web assets), MongoDB Atlas (database), Upstash Redis (rate limiting). Images: ImageKit (storage/CDN). E-mail: Resend. SMS verification codes: Twilio Verify. Authentication: our own e-mail/password accounts plus optional "Continue with Google" (Google Identity Services). Identity verification: document OCR runs on-device (Tesseract.js inside the app), reviewed by our staff. Error monitoring: Sentry. Maps/geolocation: the device's location API only. No third-party AI service is used in the app. No payment processor is active in the app: bookings are paid to the partner at pickup (cash, card or transfer at the partner's premises), and partner subscription plans are business contracts signed and invoiced outside the app (the in-app plans page is informational and only sends a request to our team). There are no in-app purchases and no digital goods sold in the app.

5. REGIONAL DIFFERENCES — Features are identical in every region. Only the content adapts: the catalogue shows listings of the customer's country first (worldwide listings remain accessible), prices are shown converted into the local currency next to the partner's price, and the interface is available in French, English and Arabic. Nothing is restricted by region.

6. REGULATED INDUSTRY / THIRD-PARTY MATERIAL — VIT AUTO is an intermediary marketplace, not a rental company, carrier or financial institution; it does not require a licence to operate. Partners are independent professionals responsible for their own business licences and vehicle insurance, and they accept our partner terms (https://vit-auto.com/conditions-partenaires) before publishing. The app contains no protected third-party material: listings, photos and descriptions are supplied by partners under those terms; illustrative vehicle photos carry their author credit on the listing. Terms: https://vit-auto.com/cgu — Privacy: https://vit-auto.com/privacy — Support: contact@vit-auto.com.

User-generated content (listings, reviews, chat messages) is moderated: every listing is approved by our staff before publication; users can report any listing, review, profile or chat contact ("Signaler") and block another user from the chat ("Bloquer"); reported content is reviewed by our moderation team and abusive accounts are suspended.
```

Champs App Review Information à mettre à jour : Sign-in required = Oui ;
User name / Password = compte CLIENT ; dans Notes : le texte ci-dessus, suivi
de « Partner demo account: review-partner@vit-auto.com / <mot de passe> ».
Joindre la vidéo (fichier .mov/.mp4 < 500 Mo) dans le fil du Resolution Center
(bouton trombone) — pas dans les Notes, qui n'acceptent que du texte.
