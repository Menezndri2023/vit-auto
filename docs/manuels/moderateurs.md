# Manuel du Modérateur — VIT AUTO

> Rédigé le 2026-07-16. Un modérateur se concentre sur la qualité et la conformité du contenu publié — pas sur la finance ni les paramètres système. Utilise le scope admin `moderation`.

## 1. Modération des annonces véhicule

**Admin → Catalogue → Annonces & Validations**

- Une annonce reçoit un **score de validation automatique** (0-100) au moment de la publication, basé sur la complétude des champs et la qualité des informations fournies. En dessous d'un certain seuil, elle est auto-rejetée ; au-dessus, elle est auto-approuvée ; entre les deux, elle attend une revue manuelle.
- **Avant d'approuver, vérifier** :
  - Les photos sont réelles et cohérentes avec la description (pas de photo de stock évidente, pas de floutage suspect).
  - Le prix est cohérent avec le marché (pas une valeur aberrante, signe possible d'erreur ou d'arnaque).
  - La description ne contient pas de coordonnées de contact direct (email/téléphone) qui contourneraient la messagerie de la plateforme.
- **En cas de rejet**, un motif est **obligatoire** — le partenaire le voit sur son tableau de bord et peut corriger puis republier.
- ⚠️ Il n'existe **aucune modération automatique du contenu visuel** (pas de détection NSFW/violence) — la revue humaine est la seule protection à ce jour.

## 2. Modération des annonces Import/Export

**Admin → Partenaires Export → section "Annonces Import/Export"**

Mêmes principes, avec en plus à vérifier :
- Au moins un pays de destination est renseigné (obligatoire depuis le 2026-07-16, mais vérifier les annonces créées avant cette date).
- Le prix et la devise sont cohérents.
- Les documents d'export annoncés comme disponibles sont plausibles pour le pays d'origine déclaré.

## 3. Modération des profils chauffeurs

**Admin → Catalogue → sous-onglet Chauffeurs**
- Vérifier permis de conduire (numéro + catégorie), expérience déclarée, langues.
- Refuser avec motif si les informations semblent incohérentes ou incomplètes.

## 4. Modération des avis clients

**Admin → Avis clients**
- Un avis ne peut être laissé qu'après une commande réellement marquée "terminée" (pas de faux avis possible via l'interface standard).
- Masquer (pas supprimer) un avis abusif, diffamatoire ou hors sujet — l'action est réversible (bouton réafficher).
- Le masquage recalcule automatiquement la note moyenne affichée du véhicule/chauffeur concerné.

## 5. Vérification Partenaires (trust score)

**Admin → Vérification Partenaires**
- Système de score/critères distinct de la certification et du KYC — attribue un badge bronze/argent/or/platine.
- **Suspendre** un partenaire ici bloque réellement sa capacité à publier de nouvelles annonces (véhicule et Import/Export) — vérifié et câblé depuis l'audit de juillet 2026.

## 6. Litiges — rôle du modérateur

Le modérateur peut instruire un litige (rassembler les éléments des deux parties) mais la **décision finale de remboursement** relève généralement d'un admin avec le scope finance, car elle implique une action manuelle hors plateforme (voir Manuel du Support §3).

## 7. Priorités en cas de charge élevée

1. Annonces en attente depuis plus de 48h (impact direct sur le revenu du partenaire).
2. Litiges ouverts (impact direct sur la confiance client).
3. KYC en attente (bloque la publication d'un particulier).
4. Avis signalés.
