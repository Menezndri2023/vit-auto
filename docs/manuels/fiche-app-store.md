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

- **iPhone 6,7"** (1290 × 2796) : 3 à 10 captures — obligatoire.
- **iPad 13"** (2064 × 2752) : obligatoire tant que le projet cible l'iPad
  (`TARGETED_DEVICE_FAMILY = 1,2`). Sans iPad sous la main : demander à passer
  le projet en iPhone seul pour la 1.0 (un réglage), ce qui lève l'exigence.

Écrans conseillés, dans cet ordre : accueil, catalogue filtré, fiche
véhicule, réservation (récapitulatif avec frais de livraison), espace
client (réservations), vérification d'identité, import/export.
Produits depuis TestFlight sur iPhone : bouton latéral + volume haut.

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
(règle 2.1). À créer **en production** avant de soumettre :

1. Un compte **client** avec une adresse dédiée (ex. `review-apple@vit-auto.com`),
   e-mail vérifié, **KYC validé par l'administration** (sinon le testeur bloque
   à la vérification d'identité), quelques favoris et une réservation.
2. Un compte **partenaire** approuvé, avec une ou deux annonces publiées.
3. Ne pas marquer ces comptes comme comptes de test (`isTestAccount`) : ils
   doivent voir le catalogue public complet.

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
