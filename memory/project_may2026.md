---
name: Fonctionnalités ajoutées mai 2026
description: Notifications sonores + bell animation, boutons actualiser, admin validations + broadcast, chat temps-réel + assistant virtuel, GPS livraison auto
type: project
---

## Implémentations du 2 mai 2026

### Feature 1 — Notifications sonores
- `src/context/NotificationContext.jsx` : son synthétisé via Web Audio API (3 notes), polling 15s, `soundEnabled` + `toggleSound()`, détection nouveaux messages via `prevUnreadRef`
- `src/components/NotificationBell/NotificationBell.jsx` : animation cloche (CSS `ringBell`), bouton 🔔/🔕 sound toggle, badge non-lu

### Feature 2 — Boutons Actualiser fonctionnels
- `src/context/VehicleContext.jsx` : expose `refreshVehicles` (re-fetch API) + `vehiclesLoading`
- `src/pages/Catalogue.jsx` : bouton "↻ Actualiser" + spinner, toast de confirmation
- `src/pages/Dashboard.jsx` : bouton "↻ Actualiser" appelle `loadMyOrders`, toast
- `src/pages/VendorDashboard.jsx` : bouton "↻ Actualiser" amélioré avec état loading + toast

### Feature 3 — Admin amélioré
- `src/pages/AdminPanel.jsx` : nouvel onglet "✅ Validations" (annonces pending + commandes pending), modal rejet avec raison, modal action commande, bouton "📢 Broadcast", actions ✅/✕ dans onglet Commandes
- `server/controllers/notificationController.js` : `sendAdminNotification` (broadcast ciblé par rôle)
- `server/routes/notifications.js` : route POST `/admin/broadcast`
- `server/routes/bookings.js` : route PATCH `/:id/admin-status`

### Feature 4 — Système de chat
- `server/models/Chat.js` : modèle Chat (participants, type, messages embedded, unreadCount Map)
- `server/controllers/chatController.js` : CRUD chats + messages, notifications auto à l'envoi
- `server/routes/chats.js` : routes GET/POST /api/chats et /api/chats/:id
- `src/context/ChatContext.jsx` : polling 5s messages actifs / 20s liste chats, `openOrCreateChat`, `sendMessage`, `selectChat`
- `src/components/Chat/Chat.jsx` : bouton flottant 💬 avec badge non-lu, fenêtre liste canaux + vue conversation
- `src/components/Chat/VirtualAssistant.js` : 17 FAQ + greetings/thanks, réponses par mots-clés
- `src/App.jsx` : `ChatProvider` + `<Chat />` intégrés

### Feature 5 — GPS auto-livraison
- `src/pages/Booking.jsx` : GPS retiré des options payantes pour `livraison`, badge vert "GPS de livraison inclus gratuitement", `gpsAutoIncluded` dérivé de `pickupMethod`

**Why:** Demande utilisateur du 2 mai 2026 — compléter les fonctionnalités manquantes sans casser l'existant.
**How to apply:** Ne pas régénérer ces fonctionnalités si elles sont déjà présentes. Pour le chat, le backend utilise du polling (pas Socket.io). Pour les notifs, Web Audio API sans fichier externe.
