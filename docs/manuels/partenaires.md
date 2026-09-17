# Manuel du Partenaire — VIT AUTO

> Rédigé le 2026-07-16, basé sur l'état réel de la plateforme à cette date.

## 1. Devenir partenaire

À l'inscription, un compte partenaire choisit un statut : **particulier**, **professionnel** ou **entreprise**. Ce choix détermine le parcours de vérification :

- **Particulier** : vérification d'identité (KYC — pièce d'identité + selfie) suffit pour publier. Limité à **3 annonces actives** simultanées (10 pour un Founding Partner particulier).
- **Professionnel / Entreprise** : certification partenaire complète requise (documents entreprise, RCCM, IBAN...) avant de pouvoir publier — sauf Founding Partner déjà vérifié.

## 2. Publier une annonce

### 2.1 Véhicule (location ou vente)
Formulaire complet : marque/modèle/année/état, caractéristiques techniques, photos (jusqu'à 6, la première devient la vignette de couverture), tarification, pays/ville/adresse (pré-remplis automatiquement par géolocalisation IP puis GPS), options (climatisation, chauffeur, durée de location courte/longue).

**Tarif semaine (facultatif, loueurs, 2026-09-17)** : champ « Tarif semaine » ; affiché « ou X / semaine ». Dès 7 jours, chaque tranche de 7 jours est facturée au tarif semaine (après les mois entiers si un tarif mois existe), le reste au tarif journalier plafonné à une semaine ; jamais plus cher que le calcul journalier.

**Tarif mensuel (facultatif, loueurs et chauffeurs, 2026-09-16)** : dans le bloc tarification, un champ « Tarif mensuel » (véhicule) ou « Tarif au mois » (chauffeur). Affiché « ou X / mois » sur la carte et la fiche. À la réservation, dès 30 jours, chaque tranche de 30 jours est facturée au tarif mois, le reste au tarif journalier (plafonné à un mois de plus) ; le total ne dépasse jamais le calcul journalier. Pour un chauffeur, « Au mois » devient une unité de mission à part entière (30 jours à disposition).

### 2.1 bis Options et suppléments de location (règle commune à tous les loueurs)
Réglés une fois pour toute l'entité, dans **Mes entreprises → Politique de location**. Toutes ces options sont **facultatives et au choix du client** à l'étape 2 de sa réservation ; le serveur les facture au prix du partenaire, jamais à un prix envoyé par le client.

| Option | Tarif plateforme par défaut | Unité par défaut |
|---|---|---|
| Chauffeur privé, siège bébé, assurance complémentaire, GPS | oui (grille admin) | par jour |
| Conducteur additionnel | aucun | par jour |
| Kilométrage illimité | aucun | par jour |
| Remise / restitution en gare ou aéroport | aucun | forfait par location |

- Pour chaque option : « Tarif plateforme » (aucune règle), « Je la propose » (à votre prix, en USD, converti à l'affichage) ou « Je ne la propose pas » (elle disparaît du parcours ; une réservation qui la demanderait est refusée).
- L'**unité** se change par option : *par jour* (prix × durée) ou *par location* (forfait compté une fois — un siège enfant à 30 € la location, par exemple).
- Les trois suppléments d'agence n'ont **pas de tarif plateforme** : ils n'apparaissent au client que chez un partenaire qui les tarife. Un supplément « proposé » sans prix n'est pas proposé.

### 2.2 Annonce Import/Export
Réservé aux **Founding Partners**. Formulaire dédié : véhicule, pays d'origine, **prix et devise**, **au moins un pays de destination** (obligatoire), moyens de paiement acceptés, documents d'export disponibles, coût de transport estimé.

### 2.3 Modifier une annonce déjà publiée
- **Véhicule** : bouton "✏️ Modifier" dans "Mes annonces" — formulaire complet (photos, tous les champs, bascule Location ⇄ Vente ⇄ **Exportation**). Transformer en annonce Export crée une nouvelle annonce Import/Export à partir des données du véhicule et archive l'annonce d'origine.
- **Import/Export** : bouton "✏️ Modifier" dans "Mes annonces Import/Export" (onglet Import/Export du tableau de bord). Toute modification d'une annonce déjà approuvée la repasse en modération.

## 3. Le programme Founding Partner

- Signature électronique d'une LOI puis d'un Accord (même lien, même jeton de signature).
- Donne accès à : publication Import/Export, plafond d'annonces élevé (particulier), commissions préférentielles.
- **Commissions Founding Partner** (première année après signature) :
  - Entreprise / Professionnel / Exportateur : **10 % location, 2 % vente/Import-Export**
  - Particulier : **5 % location, 1 % vente**
  - Après 12 mois : entreprise/pro/exportateur repasse au tarif standard (15 %/3 %) ; particulier reste à un tarif réduit permanent (7 %/2 %).

## 4. Recevoir des commandes

- **Pièces détachées** (secteur « pièces ») : publiez depuis Nouvelle annonce → Pièce détachée (référence, compatibilité, prix, stock, livraison ; vente directe ou importation avec délai, frais d'importation et acompte). Pour un catalogue entier, « Modèle CSV » puis « Importer un fichier » (CSV « ; » ou « , », ou .xlsx ; colonnes : titre, categorie, fabricant, reference, etat, prix, devise, stock, qte_min, mode direct/import, pays_origine, delai_jours, frais_import, acompte, livraison gratuit/forfait/distance, forfait_livraison, offerte_des, delai_min, delai_max, compatibilite « Marque Modèle 2004-2012 | … », photos (URL http séparées par |), description, ville) — chaque ligne refusée est expliquée, les autres partent en validation. Une commande vous arrive directement : confirmez (et déclarez l'acompte reçu pour une importation), préparez, expédiez avec le n° de suivi, marquez « livrée » — le client confirme la réception, ce qui clôt la commande. Règlement en espèces au livreur ; commission VIT AUTO sur le prix des pièces seul (voir docs/pieces-detachees.md).
- **Toutes les demandes (location, activité, mission chauffeur, demande d'essai, proposition d'embauche, commande de pièce) vous sont transmises directement**, sans validation préalable de VIT AUTO (règle de l'exploitant, 2026-09-14) : la demande apparaît dans vos commandes à l'instant où le client la confirme, à vous de l'accepter ou de la refuser sous 24 h (délai de réponse et rappels habituels). Location, activités et missions chauffeur se règlent en espèces, auprès de vous, à la prestation.
- **Votre page publique** (`/partner/votre-identifiant`) : nom commercial, présentation, site web, ville et logo se rédigent depuis **Mon profil → Mon entreprise — page publique**. Elle liste vos annonces selon votre secteur (véhicules, chauffeurs, ou activités & loisirs — un partenaire loisirs ne propose pas de chauffeurs, son espace ne montre que ses activités). N'y mettez ni numéro ni e-mail : la mise en relation passe par VIT AUTO.
- **Import/Export (pipeline 14 étapes)** : confirmer disponibilité → discuter avec le client → (optionnel) inspection indépendante VIT AUTO → envoyer une **offre finale** détaillée (prix, frais d'export, transport, assurance).
  - 💡 **Astuce** : l'offre finale est **pré-remplie automatiquement** à partir du devis calculé par le moteur de coût d'importation dès que le client a choisi une destination — vérifiez et ajustez avant d'envoyer, ne partez pas de zéro.
  - Une fois l'offre acceptée par le client et payée, les fonds sont en séquestre jusqu'à confirmation de livraison.

## 5. Le calculateur de coût d'importation

Si votre pays de destination et votre liaison de fret sont configurés par l'admin (Admin → Coûts Import), l'acheteur voit une estimation automatique du coût total (transport, fret, assurance, douane, livraison, commission) directement sur votre annonce. Cela rassure l'acheteur international sur le coût réel "clé en main" avant même de réserver.

## 6. Ce qui reste manuel (ne pas promettre l'inverse à un client)

- Les paiements par virement, mobile money hors Orange Money/Wave, cryptomonnaie ou espèces nécessitent une vérification manuelle par un admin avant confirmation.
- Les remboursements ne sont jamais automatiques.
