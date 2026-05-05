# VIT AUTO — Guide de Déploiement Complet

## 1. PRÉREQUIS

- Node.js 18+
- Compte MongoDB Atlas (gratuit) : https://cloud.mongodb.com
- Compte Railway (gratuit) : https://railway.app
- Compte Vercel (gratuit) : https://vercel.com
- Android Studio (pour APK Android) : https://developer.android.com/studio
- Xcode 15+ sur macOS (pour iOS)

---

## 2. BASE DE DONNÉES — MongoDB Atlas

1. Créer un cluster gratuit sur https://cloud.mongodb.com
2. Créer un utilisateur DB : **Database Access → Add New Database User**
3. Autoriser les IPs : **Network Access → Add IP Address → Allow Access from Anywhere** (0.0.0.0/0)
4. Copier l'URI de connexion : **Connect → Connect your application**
   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/vit-auto?retryWrites=true&w=majority
   ```

---

## 3. BACKEND — Railway

### Déploiement initial
```bash
# 1. Installer Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Dans le dossier server/
cd server
railway init   # créer un nouveau projet
railway up     # déployer
```

### Variables d'environnement Railway (Settings → Variables)
```
MONGODB_URI    = votre URI MongoDB Atlas
JWT_SECRET     = votre clé secrète forte (64 chars min)
FRONTEND_URL   = https://vit-auto.vercel.app
APP_URL        = https://vit-auto.vercel.app
NODE_ENV       = production
PORT           = 5001

# Email (optionnel, sans ça les emails s'affichent dans les logs)
SMTP_HOST      = smtp.sendgrid.net
SMTP_PORT      = 587
SMTP_USER      = apikey
SMTP_PASS      = SG.xxxxxxxxx
SMTP_FROM      = VIT AUTO <noreply@vitauto.com>
```

### URL du backend Railway
Notez l'URL fournie : ex. `https://vit-auto-backend.up.railway.app`

### Créer le premier admin
```bash
# Depuis le terminal Railway (ou en local avec les bonnes vars d'env)
railway run npm run seed:admin
```

---

## 4. FRONTEND — Vercel

### Déploiement initial
```bash
# 1. Installer Vercel CLI
npm install -g vercel

# 2. Dans le dossier racine vit-auto/
vercel --prod
```

### Variables d'environnement Vercel (Settings → Environment Variables)
```
VITE_API_URL   = https://vit-auto-backend.up.railway.app
```

> **Important** : mettez à jour vite.config.js pour utiliser VITE_API_URL en production

### Déploiements suivants (auto)
Connectez votre repo GitHub à Vercel pour le déploiement automatique sur chaque push.

---

## 5. APPLICATION MOBILE — Capacitor

### Android (APK)

```bash
# 1. Build du frontend
npm run build

# 2. Synchroniser avec Capacitor
npx cap sync android

# 3. Ouvrir Android Studio
npm run cap:android
# OU
npx cap open android

# Dans Android Studio :
# Build → Generate Signed Bundle / APK → APK → Next
# Créer une keystore ou en utiliser une existante
# Build → APK (debug pour test, release pour Play Store)
```

**L'APK se trouve dans :** `android/app/build/outputs/apk/debug/app-debug.apk`

### iOS (IPA) — macOS requis

```bash
# 1. Build du frontend
npm run build

# 2. Synchroniser avec Capacitor
npx cap sync ios

# 3. Ouvrir Xcode
npm run cap:ios
# OU
npx cap open ios

# Dans Xcode :
# Product → Archive → Distribute App → App Store Connect (ou Ad Hoc pour test)
```

### Configuration importante avant build mobile

Dans `capacitor.config.json`, mettez l'URL de l'API de production :
```json
{
  "server": {
    "url": "https://votre-app.vercel.app",
    "cleartext": false
  }
}
```

---

## 6. PWA — Installation sur mobile sans App Store

L'application fonctionne déjà comme PWA. Sur mobile :
- **Android** : Chrome → Menu → "Ajouter à l'écran d'accueil"
- **iOS** : Safari → Partager → "Sur l'écran d'accueil"

---

## 7. CHECKLIST AVANT MISE EN PRODUCTION

- [ ] `JWT_SECRET` généré avec `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- [ ] `MONGODB_URI` pointe vers Atlas (pas localhost)
- [ ] `FRONTEND_URL` correctement configuré dans Railway
- [ ] SMTP configuré (ou accepter les logs console en mode dev)
- [ ] Premier admin créé via `seed:admin`
- [ ] Domaine personnalisé configuré sur Vercel
- [ ] SSL/HTTPS actif (automatique sur Vercel + Railway)
- [ ] Backup MongoDB Atlas activé (Free tier : M0 pas de backup auto → M2+ recommandé)

---

## 8. COMMANDES UTILES

```bash
# Développement local (frontend + backend)
npm run dev

# Build production frontend
npm run build

# Build + sync mobile
npm run build:mobile

# Prévisualiser le build
npm run preview

# Lint
npm run lint
```
