# 📋 Vit-Auto Platform - Documentation des Fonctionnalités

## Vue d'ensemble

Vit-Auto est une plateforme complète de location et vente de véhicules avec:
- Système d'authentification JWT
- Dashboard vendor/admin
- Notifications en temps réel (toasts)
- Gestion des annonces avec validation
- Statistiques et analytics

---

## 🔐 Authentification

### Création de compte
1. Cliquer sur "Inscription"
2. Remplir les champs (prénom, nom, email, téléphone, mot de passe)
3. **Important**: Le premier compte créé devient automatiquement admin
4. Toast de confirmation s'affiche

### Connexion
1. Cliquer sur "Connexion"
2. Entrer email + mot de passe
3. Token JWT stocké en localStorage
4. Redirection au dashboard

### Rôles utilisateur
- **User** : publication de véhicules, réservations
- **Admin** : validation des annonces, statistiques globales

---

## 🚗 Flow Vendeur

### 1. Publier un véhicule
- Aller `/vendor`
- Remplir le formulaire (nom, type, prix, fuel, etc.)
- Soumettre → annonce en statut `pending`
- Admin doit valider pour apparaître en catalogue

### 2. Suivi des annonces
- Aller `/vendor/dashboard`
- Voir toutes les annonces personnelles
- Vérifier le statut : `pending`, `approved`, `rejected`

---

## 👨‍💼 Flow Admin

### 1. Validation des annonces
- Aller `/admin`
- Voir les annonces en attente
- "Valider" ou "Refuser" → mise à jour du statut

### 2. Statistiques globales
- Aller `/stats` (en tant qu'admin)
- Voir :
  - Total véhicules
  - Approuvés vs en attente
  - Réservations
  - Revenue totale

---

## 🔔 Notifications (Toasts)

Les toasts apparaissent en bas à droite pour:
- ✅ **Success** : action réussie (vert)
- ❌ **Error** : problème rencontré (rouge)
- ℹ️ **Info** : information générale (bleu)

Cliquez sur le `×` pour fermer rapidement.

---

## 💾 Base de données

### Mode offline (défaut)
- Utilise une base de données en mémoire
- Données perdues au redémarrage
- Parfait pour développement local

### Mode MongoDB
- Définir `MONGO_URI` dans `server/.env`
- Persistance des données
- Synchronisation avec API

---

## 🛠️ Architecture technique

```
frontend/
├── contexts/
│   ├── AuthContext.jsx      # Auth + JWT
│   ├── VehicleContext.jsx   # Véhicules + booking
│   └── ToastContext.jsx     # Notifications
├── pages/
│   ├── Login.jsx
│   ├── Register.jsx
│   ├── VendorSubmit.jsx
│   ├── VendorDashboard.jsx
│   ├── AdminPanel.jsx
│   ├── DashboardStats.jsx
│   └── ...
└── components/
    ├── Toast/
    ├── Navbar/
    └── ...

backend/
├── routes/
│   ├── auth.js
│   ├── vehicles.js
│   ├── bookings.js
│   └── payments.js
├── models/
│   ├── User.js
│   ├── Vehicle.js
│   └── Booking.js
├── middleware/
│   └── auth.js
├── db/
│   ├── offlineDB.js      # Base en mémoire
│   └── index.js          # Abstraction DB
└── index.js
```

---

## 🚀 Dépannage

### Le serveur ne démarre pas
1. Vérifier que le port 5001 n'est pas utilisé
2. `$env:PORT=5002` pour changer de port

### MongoDB non disponible
- ✓ Le serveur bascule automatiquement en mode offline
- ✓ Message `⚠️  MongoDB indisponible, utilisation du mode offline`

### Les toasts ne s'affichent pas
- Vérifier que `<ToastProvider>` entoure `<App>` dans `app.jsx`

---

## 📞 Support

Pour toute question, consulter:
- `/admin` pour statistiques
- `/stats` pour analytics personnelles
- `.env` pour configuration serveur
