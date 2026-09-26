# Soumettre et suivre le sitemap — Google Search Console

> Rédigé le 2026-09-26, après la mise en place du sitemap servi par l'API et des versions linguistiques (FR/EN/AR/ES/ZH). État vérifié ce jour : **735 URL**, dont 115 jeux d'alternates, **zéro adresse orpheline**.

Rien de ce qui suit ne peut être fait à votre place : Search Console exige une preuve de propriété du domaine, et cette preuve passe par votre compte Google et votre hébergeur DNS.

---

## 1. Créer la propriété

Sur [search.google.com/search-console](https://search.google.com/search-console), « Ajouter une propriété ».

**Choisissez « Domaine », pas « Préfixe d'URL ».**

La raison est concrète pour VIT AUTO : le site répond sur `vit-auto.com` **et** `www.vit-auto.com` (c'est déjà une source d'incidents — voir le correctif CORS du 2026-07-10). Une propriété « Préfixe d'URL » ne couvre qu'une seule de ces formes, et vous suivriez la moitié du trafic sans le savoir. Une propriété « Domaine » couvre les deux, plus `http://` et tous les sous-domaines.

Le prix à payer : la validation se fait par **enregistrement DNS TXT**, chez le registrar du domaine — pas par un fichier déposé sur le site. Comptez quelques minutes à quelques heures de propagation.

---

## 2. Soumettre le sitemap

Menu de gauche → **Sitemaps** → saisir :

```
sitemap.xml
```

Ne collez pas l'URL entière, seulement le chemin. Google le résout contre la propriété.

### Ce que vous devez voir

| Champ | Valeur attendue |
|---|---|
| État | Réussite |
| URL découvertes | ~735 (le chiffre bouge avec le catalogue) |
| Type | Sitemap |

Si l'état reste « N'a pas pu être récupéré » plus de 24 h, la cause la plus probable n'est pas Google : le sitemap est servi par l'API Render, relayée par une réécriture Vercel. Vérifiez d'abord l'origine directement :

```
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://vit-auto-api.onrender.com/sitemap.xml
```

Attendu : `200 application/xml; charset=utf-8`. Si l'origine répond mais pas `vit-auto.com/sitemap.xml`, le problème est la réécriture `vercel.json`, pas le sitemap.

---

## 3. Le délai, et ce qu'il faut en penser

Soumettre un sitemap ne déclenche pas l'indexation, cela déclenche l'**exploration**. Comptez :

- **quelques heures** pour que le sitemap soit lu et le nombre d'URL affiché ;
- **quelques jours à quelques semaines** pour que les pages remontent dans le rapport *Pages* ;
- **plus longtemps encore** pour que les versions linguistiques soient traitées comme telles.

Il n'y a rien à faire pendant ce temps, et resoumettre le sitemap n'accélère rien.

---

## 4. Lire le rapport « Pages »

Menu de gauche → **Indexation** → **Pages**. Les motifs de non-indexation qui vous concernent en particulier :

**« Page en double sans URL canonique sélectionnée par l'utilisateur »**
→ C'est exactement le défaut corrigé le 2026-09-25 : 19 pages sur 25 se déclaraient doublons de l'accueil. S'il réapparaît, c'est que `useDocumentMeta` n'est pas appelé sur la page concernée.

**« Autre page avec balise canonique correcte »**
→ Normal et attendu sur les versions linguistiques : Google indexe la version qu'il juge pertinente pour chaque requête et regroupe les autres. Ce n'est **pas** une erreur.

**« Explorée, actuellement non indexée »**
→ Google a vu la page et a décidé de ne pas l'indexer, en général parce qu'elle est jugée mince. Sur VIT AUTO, c'est le sort attendu des vitrines et showrooms sans annonce — ils sont d'ailleurs déjà en `noindex, follow` de notre côté.

**« Bloquée par le fichier robots.txt »**
→ Vérifiez que la page concernée fait bien partie des espaces privés (`/admin`, `/profile`, `/kyc`…). Depuis le 2026-09-26, `robots.txt` bloque aussi leurs versions préfixées (`/en/admin`, `/ar/kyc`).

---

## 5. Vérifier une page précise

La barre de recherche en haut ouvre l'**outil d'inspection d'URL**. C'est le seul endroit qui vous dit ce que Google a réellement vu.

Collez par exemple `https://vit-auto.com/en/faq`, puis **Tester l'URL en direct** → **Afficher la page explorée**.

Trois choses à contrôler :

1. **Le HTML rendu contient le contenu anglais.** Le site est une application monopage : le HTML brut est presque vide, tout est produit par JavaScript. Google l'exécute, mais c'est ici que vous le vérifiez plutôt que de le supposer.
2. **L'URL canonique sélectionnée par Google** doit être `https://vit-auto.com/en/faq`, pas la version française. Si Google choisit une autre canonique que celle déclarée, il vous le dit explicitement — c'est l'information la plus utile de tout Search Console.
3. **Aucune balise `noindex`** n'apparaît.

⚠️ **Un `curl` ne remplace pas cet outil.** En `curl`, toutes les pages de VIT AUTO rendent le même titre et la même description : c'est le HTML avant JavaScript, ce n'est pas ce que voit Google. J'ai failli signaler un défaut majeur inexistant sur cette base le 2026-09-25.

---

## 6. Les versions linguistiques : à quoi s'attendre

Google **a supprimé le rapport « Ciblage international »**. Il n'existe plus d'écran qui liste les erreurs `hreflang`. Concrètement, vous ne saurez pas directement si un jeu d'alternates est accepté ou rejeté.

Ce que vous pouvez observer à la place :

- dans le rapport **Pages**, les URL préfixées apparaissent progressivement (`/en/…`, `/ar/…`, `/es/…`, `/zh/…`) ;
- dans **Performances**, en filtrant par pays, vous verrez si les bonnes versions sortent sur les bons marchés ;
- l'outil d'inspection d'URL vous donne la canonique retenue, page par page.

Le contrôle mécanique, lui, est déjà automatisé de notre côté et bloque tout `git push` qui le casserait :
- `server/tests/sitemap.test.js` refuse un alternate qui pointe vers une page absente du sitemap, et exige que les cinq versions d'une page portent un jeu identique ;
- `src/i18n/i18n.pagesTraduites.test.js` refuse qu'une page se déclare traduite alors qu'elle contient du français en dur ;
- `scripts/verifierLocalement.mjs` ouvre réellement `/en/faq`, `/ar/catalogue`, `/es/plans` et `/zh/services` dans un navigateur et vérifie `lang`, `dir`, la canonique et les six alternates.

---

## 7. Ce qu'il ne faut PAS faire

- **Ne pas demander l'indexation page par page** pour rattraper un retard. Le quota est d'une poignée de demandes par jour et cela n'accélère rien à l'échelle de 735 URL.
- **Ne pas resoumettre le sitemap** chaque jour. Google le relit tout seul.
- **Ne pas interroger la production en boucle** pour voir si un correctif est passé. Le 2026-09-26, une série de requêtes espacées de 30 secondes a déclenché la protection anti-bot de Vercel : tout le domaine a répondu **403** depuis l'adresse concernée pendant plus de huit minutes — ce qui ressemble trait pour trait à une panne totale. Pour vérifier l'origine sans passer par le CDN : `https://vit-auto-api.onrender.com/sitemap.xml`.

---

## 8. Bing et Yandex — déjà branchés, sans aucun compte

Contrairement à Google, Bing et Yandex acceptent **IndexNow** : on leur signale directement les pages à (re)lire, et la propriété du domaine se prouve par un simple fichier hébergé sur le site. Aucun compte, aucun DNS.

C'est en place :

- la clé est le fichier `public/<clé>.txt`, servi sur `https://vit-auto.com/<clé>.txt` ;
- `scripts/indexNow.mjs` lit le **sitemap de production** — pas une liste écrite à la main — et soumet les URL.

```bash
node scripts/indexNow.mjs --dry-run    # montre ce qui serait soumis
node scripts/indexNow.mjs              # soumet tout le sitemap
node scripts/indexNow.mjs /faq /plans  # seulement ces pages
```

Quand s'en servir : après une mise en ligne qui change beaucoup de pages, ou quand une page importante vient d'être publiée. **Pas tous les jours** — cela n'accélère rien et un 429 finit par tomber.

⚠️ **Le fichier clé doit être DÉPLOYÉ avant toute soumission.** IndexNow le lit pour vérifier la propriété ; s'il ne le trouve pas, il répond 403 et rien n'est signalé. Après un changement de clé : déployer d'abord, soumettre ensuite. Un test (`src/seo.indexnow.test.js`) verrouille les deux pièges silencieux — un contenu de fichier différent de son nom, et deux fichiers clés concurrents.

Bing Webmaster Tools reste utile pour **voir** ce qui est indexé : la propriété s'y **importe** depuis Search Console en quelques clics, une fois l'étape 1 faite. Mais l'indexation, elle, n'attend pas ce compte.
