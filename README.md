# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Backend / MongoDB / Auth / Paiement / Dashboard

Ce projet inclut maintenant une API Node/Express, une base de données fonctionnelle (MongoDB ou en mémoire), authentification JWT, gestion de vendor et admin, et toasts notifications.

### 1️⃣ **Démarrer l'application**

#### Frontend
```bash
npm install
npm run dev
```

#### Backend
```bash
cd server
npm install
$env:PORT=5001  # ou PORT=5001 en Linux/Mac
npm run dev
```

**:point_right: MongoDB optionnel** : si MongoDB n'est pas disponible, le serveur basculera automatiquement en mode offline avec base de données en mémoire.

---

### 2️⃣ **Architecture & Flux**

#### Base de données
- **Mode online** : MongoDB (configure MONGO_URI dans `.env`)
- **Mode offline** : base de données en mémoire (`server/db/offlineDB.js`)
- Auto-détection et fallback intelligent

#### Authentification
- Register/Login via `src/pages/{Register,Login}.jsx`
- JWT tokens stockés dans localStorage
- Rôles : `user` (vendeur), `admin` (modérateur)
- Premier compte créé = admin automatiquement

#### Flux vendeur/admin
1. **Vendeur** :
   - `/vendor` → publier véhicule
   - `/vendor/dashboard` → voir ses annonces + statuts
   - `/stats` → ses statistiques personnes

2. **Admin** :
   - `/admin` → valider/refuser annonces
   - `/stats` → statistiques globales (revenue, total bookings, etc.)

---

### 3️⃣ **Routes API**

#### Auth (`/api/auth`)
- `POST /register` - inscription
- `POST /login` - connexion
- `GET /me` - profil connecté

#### Vehicules (`/api/vehicles`)
- `GET /` - liste approuvée (public)
- `GET /mine` - mes véhicules (auth)
- `GET /pending` - en attente (admin)
- `POST /` - créer (auth)
- `PATCH /:id/status` - valider (admin)

#### Réservations (`/api/bookings`)
- `GET /` - mes réservations (auth)
- `POST /` - créer réservation (auth)

#### Paiements (`/api/payments`)
- `POST /checkout` - simulateur (à remplacer par Stripe)

---

### 4️⃣ **Fonctionnalités implémentées**

✅ Auth JWT + rôles  
✅ Dashboard vendor + stats  
✅ Admin panel + validation  
✅ Notifications toasts (success/error/info)  
✅ Fallback offlineDB  
✅ Catalogue + filtres  
✅ Réservations & paiements (base)  
✅ Profile utilisateur  

---

### 5️⃣ **Configuration `.env` (serveur)**

```env
MONGO_URI=mongodb://localhost:27017/vitauto  # optionnel
JWT_SECRET=your_jwt_secret_here
PORT=5001
STRIPE_SECRET_KEY=your_stripe_secret_key     # optionnel
```

---

### 6️⃣ **Prochaines étapes**

- [ ] Stripe payment gateway integration
- [ ] Mobile money payments (MTN/Orange/Wave/Moov)
- [ ] Password reset + 2FA
- [ ] Upload images (Cloudinary/S3)
- [ ] Admin CSV reports
- [ ] User ratings & reviews
- [ ] Email notifications
- [ ] Jest + React Testing Library tests
