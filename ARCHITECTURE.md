# VIT AUTO — Architecture Technique Complète

> Document de référence unique. Toute nouvelle fonctionnalité doit s'inscrire dans ce cadre avant d'être développée.
> Version : 2026-07-02 | Révision : CTO Review v1.0
> **Mise à jour de vérification : 2026-07-16** — voir encadré ci-dessous.

> ⚠️ **Note de vérification (2026-07-16)** — Ce document mélangeait, dans sa version d'origine, l'état réel du projet et une architecture **cible** non encore implémentée, sans toujours le distinguer clairement. Corrections vérifiées ligne de code à l'appui à cette date :
> - **Médias : pas de Cloudinary.** Aucune référence à Cloudinary n'existe dans le code. Le stockage réel est double : base64 directement en base MongoDB pour la publication manuelle (véhicules/annonces Import-Export), et ImageKit uniquement pour le flux d'import en masse (CSV/Excel partenaire). Voir §5 et le journal des évolutions en fin de document (passe de compression/vignettes du 2026-07-16).
> - **Pas de chiffrement AES-256-GCM en base.** §7.4 affirmait un chiffrement des champs sensibles (`nationalId`, `taxNumber`, détails de paiement) — **aucun code de chiffrement de ce type n'existe dans le projet**, ces champs sont stockés en clair. C'est un vrai écart de sécurité à traiter, pas seulement une erreur de doc.
> - **Redis = Upstash**, pas "Railway Redis" — le circuit-breaker de `queue/index.js` gère explicitement les dépassements de quota Upstash (incident déjà survenu en production).
> - **Domaines réels** : `vit-auto.com` (Vercel) + `vit-auto.vercel.app`, un seul environnement de production. Aucune preuve de `admin.vit-auto.com`/`partners.vit-auto.com`/Cloudflare/Fly.io en usage réel — à traiter comme une piste future (§10), pas un état actuel.
> - **CI/CD réel** (`.github/workflows/ci.yml`) : lint + build frontend, vérification syntaxe + `npm audit` backend — **ne déploie rien**. Le déploiement est natif Railway (backend) et Vercel (frontend), déclenché automatiquement sur push vers `main` (configuré le 2026-07-11).
> - Les seuils de rate limiting (§7.4) et plusieurs valeurs numériques n'ont pas toutes été re-vérifiées une par une dans cette passe — seules les divergences trouvées ci-dessus sont confirmées à 100 %. Ne pas traiter le reste du document comme audité exhaustivement.
>
> Un **journal des évolutions majeures** (fonctionnalités livrées depuis le 2026-07-02) a été ajouté en fin de document.

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Infrastructure Cloud](#2-infrastructure-cloud)
3. [Architecture Frontend](#3-architecture-frontend)
4. [Architecture Backend](#4-architecture-backend)
5. [Architecture Base de Données](#5-architecture-base-de-données)
6. [Architecture DevOps](#6-architecture-devops)
7. [Architecture Sécurité](#7-architecture-sécurité)
8. [Architecture Métier](#8-architecture-métier)
9. [Architecture IA](#9-architecture-ia)
10. [Feuille de route de migration](#10-feuille-de-route-de-migration)

---

## 1. Vue d'ensemble

VIT AUTO est une **plateforme internationale** de vente, location, import/export de véhicules, opérant dans **14 pays** d'Afrique et d'Europe avec **8 devises** et 3 langues (FR / EN / AR).

### Principes directeurs

| Principe | Description |
|---|---|
| **Modularité** | Chaque domaine métier est un module indépendant (controller / service / repo / routes) |
| **API-first** | Tout passe par l'API REST — pas de logique métier dans le frontend |
| **Sécurité par défaut** | Helmet, rate limit, Zod validation, RBAC, audit log sur chaque action sensible |
| **Résilience** | L'email, la notification, le PDF ne bloquent jamais une requête principale |
| **Évolutivité** | Redis + BullMQ pour les tâches async ; pagination sur toutes les listes |
| **Internationalisation** | Prix via devises ISO 4217 ; dates UTC ; multilingue FR/EN/AR |

---

## 2. Infrastructure Cloud

### Schéma global

```
                     Utilisateurs (Web / Mobile)
                              │
               ┌──────────────┴──────────────┐
               │         Cloudflare            │
               │  DNS · CDN · WAF · DDoS      │
               └──────────────┬──────────────┘
                              │
               ┌──────────────┴──────────────┐
               │                             │
        ┌──────▼──────┐             ┌────────▼────────┐
        │   Vercel     │             │  Railway / Fly   │
        │  (Frontend)  │             │   (API Node.js)  │
        │  React/Next  │◄───REST/WS─►│   Express + WS  │
        └─────────────┘             └────────┬────────┘
                                             │
                              ┌──────────────┼──────────────┐
                              │              │              │
                    ┌─────────▼──┐  ┌───────▼─────┐  ┌────▼────┐
                    │ MongoDB    │  │   Upstash    │  │ ImageKit │
                    │  Atlas     │  │  (Cache+BQ)  │  │(import   │
                    │ (médias en │  │              │  │en masse  │
                    │ base64 aussi)│ └─────────────┘  │seulement)│
                    └───────────┘                    └─────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
      ┌───▼───┐          ┌────▼────┐         ┌───▼───┐
      │Resend │          │  Stripe  │         │ Sentry│
      │(Email)│          │(Paiement)│         │(Erreurs)│
      └───────┘          └─────────┘         └───────┘
```

### Domaines

**Réel (vérifié 2026-07-16)** : un seul environnement de production — `vit-auto.com` + `vit-auto.vercel.app` (frontend, Vercel), API sur un sous-domaine Railway généré (`*.up.railway.app`). Pas de sous-domaines dédiés admin/partenaires (mêmes routes React protégées par rôle, `/admin`, `/partner-pms` etc.), pas d'environnement staging séparé.

Table ci-dessous = **cible visée**, pas l'état actuel :

| Domaine | Cible | Environnement |
|---|---|---|
| `vit-auto.com` | Frontend public | Vercel (Production) — **existe** |
| `admin.vit-auto.com` | Admin Panel | Vercel (Production) — non fait |
| `partners.vit-auto.com` | Portail partenaires | Vercel (Production) — non fait |
| `api.vit-auto.com` | API REST | Railway / Fly.io — non fait (URL Railway brute utilisée) |
| `staging.vit-auto.com` | Staging complet | Vercel + Railway — non fait |

### Variables d'environnement requises

```env
# API
JWT_SECRET=<512 bits minimum>
JWT_REFRESH_SECRET=<512 bits minimum>
MONGO_URI=mongodb+srv://...
NODE_ENV=production
PORT=5001

# Email — Cas B : Resend (priorité sur SMTP)
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=VIT AUTO <noreply@vit-auto.com>

# Fallback SMTP (optionnel)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=

# Médias — pas de Cloudinary (voir note en tête de document) : publication
# manuelle = base64 direct en base, import en masse = ImageKit
IMAGEKIT_PUBLIC_KEY=
IMAGEKIT_PRIVATE_KEY=
IMAGEKIT_URL_ENDPOINT=

# Paiements
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Cache & Files d'attente
REDIS_URL=redis://...

# Monitoring
SENTRY_DSN=https://...
```

---

## 3. Architecture Frontend

### 3.1 Structure actuelle (React + Vite)

```
src/
├── pages/                  # Une page = une route
│   ├── Home.jsx
│   ├── Catalogue.jsx
│   ├── VehicleDetails.jsx
│   ├── Booking.jsx
│   ├── Dashboard.jsx       # Espace client
│   ├── AdminPanel.jsx      # Admin (protégé)
│   ├── PartnerPMSDashboard.jsx
│   ├── PartnerOnboardingPortal.jsx
│   ├── PartnerSignByToken.jsx
│   ├── KYC.jsx
│   ├── ImportExport.jsx
│   └── ...
├── components/             # Composants réutilisables
├── utils/
│   ├── apiClient.js        # Auto-refresh JWT 401
│   ├── currency.js         # fmt() + 8 devises
│   └── i18n.js             # t() + FR/EN/AR
└── App.jsx                 # Routes + AuthContext
```

### 3.2 Cible : Migration Next.js (monorepo)

```
apps/
├── web/          → vit-auto.com         (Next.js 15 App Router, public + SSR/SEO)
├── admin/        → admin.vit-auto.com   (Next.js, RSC, protégé)
├── partner/      → partners.vit-auto.com (Next.js, SSR partiel)
└── mobile/       → iOS + Android        (React Native / Expo)

packages/
├── ui/           → Design System partagé (Tailwind + Radix UI)
├── api-client/   → Wrapper fetch + types TypeScript
├── i18n/         → FR / EN / AR
├── currency/     → 8 devises + Haversine
└── config/       → ESLint, TS, Tailwind configs
```

### 3.3 Pages par espace

#### Espace public (vit-auto.com)
| Route | Page | Description |
|---|---|---|
| `/` | Home | Hero, spotlight, catalogue preview |
| `/catalogue` | Catalogue | Filtres, tri, pagination |
| `/vehicule/:id` | VehicleDetails | Fiche véhicule, réservation |
| `/import-export` | ImportExport | Listings I/E |
| `/chauffeurs` | Drivers | Chauffeurs professionnels |
| `/partenaires` | Partners | Présentation partenaires |
| `/showroom/:id` | PartnerShowroomPublic | Vitrine partenaire |
| `/plans` | Plans | Abonnements |
| `/auth/*` | Auth | Login / Register / Reset |
| `/kyc` | KYC | Vérification identité |

#### Espace client (connecté)
| Route | Page | Description |
|---|---|---|
| `/dashboard` | Dashboard | Réservations, contrats, profil |
| `/booking/:id` | Booking | Réservation en cours |
| `/contrat/:id` | ContractPage | Contrat signé |
| `/profil` | Profile | Données personnelles |

#### Espace admin (admin.vit-auto.com)
| Module | Description |
|---|---|
| `dashboard` | Métriques temps réel |
| `users` | Gestion utilisateurs |
| `kyc` | Révision dossiers KYC |
| `catalogue` | Annonces + chauffeurs |
| `bookings` | Réservations |
| `import_export` | Transactions I/E |
| `partners` | Suivi CRM partenaires |
| `commissions` | Ledger commissions |
| `factures` | Factures PDF |
| `notifications` | Envois email/SMS/push |
| `audit` | Journal des actions |
| `roles` | RBAC |

#### Portail partenaires (partners.vit-auto.com)
| Route | Description |
|---|---|
| `/partner-onboarding` | Wizard 5 étapes (LOI → Agreement → Checklist) |
| `/partner-pms` | Dashboard PMS 20 étapes (Lead → Quote → Showroom) |
| `/partner/sign/:token` | Signature de document par lien sécurisé |
| `/partner/showroom` | Gestion vitrine |

### 3.4 State management

```
AuthContext          → User + token + rôle
CurrencyContext      → Devise active + fmt()
I18nContext          → Langue + t()
NotificationContext  → Toast + Centre notif
```

---

## 4. Architecture Backend

### 4.1 Structure modulaire cible

```
server/
├── config/
│   ├── db.js               # Connexion MongoDB
│   ├── email.js            # Resend > SMTP > Console
│   ├── redis.js            # Cache + BullMQ
│   └── countries.js        # 14 pays + devises
│
├── modules/                # Un dossier = un domaine
│   ├── auth/
│   │   ├── authController.js
│   │   ├── authService.js
│   │   ├── authRoutes.js
│   │   └── authValidators.js
│   ├── users/
│   ├── vehicles/
│   ├── bookings/
│   ├── sales/
│   ├── payments/
│   ├── contracts/
│   ├── kyc/
│   ├── partners/
│   ├── import-export/
│   ├── drivers/
│   ├── notifications/
│   ├── chat/
│   ├── reviews/
│   ├── invoices/
│   ├── analytics/
│   └── admin/
│
├── middleware/
│   ├── auth.js             # JWT verify + refresh
│   ├── rbac.js             # requireRole(), requirePermission()
│   ├── validate.js         # Zod schema validation
│   ├── auditLog.js         # Log toute action sensible
│   └── rateLimiter.js      # Rate limits par endpoint
│
├── utils/
│   ├── emailTemplates.js
│   ├── pdfGenerator.js
│   ├── logger.js           # Winston
│   ├── idValidation.js
│   └── escapeRegex.js
│
├── jobs/                   # BullMQ workers
│   ├── emailQueue.js
│   ├── pdfQueue.js
│   ├── notificationQueue.js
│   └── analyticsQueue.js
│
└── server.js
```

### 4.2 Endpoints API (inventaire complet)

```
Auth
  POST   /api/auth/register
  POST   /api/auth/login
  POST   /api/auth/logout
  POST   /api/auth/refresh
  POST   /api/auth/forgot-password
  POST   /api/auth/reset-password
  POST   /api/auth/verify-email
  POST   /api/auth/send-otp
  POST   /api/auth/verify-otp
  GET    /api/auth/me

Users
  GET    /api/users              (admin)
  GET    /api/users/:id
  PATCH  /api/users/:id
  DELETE /api/users/:id          (admin)
  POST   /api/users/:id/block    (admin)

KYC
  POST   /api/kyc/submit
  GET    /api/kyc/status
  GET    /api/kyc/admin/list     (admin)
  PATCH  /api/kyc/admin/:id/approve
  PATCH  /api/kyc/admin/:id/reject
  POST   /api/kyc/admin/:id/reset

Vehicles
  GET    /api/vehicles
  POST   /api/vehicles
  GET    /api/vehicles/:id
  PATCH  /api/vehicles/:id
  DELETE /api/vehicles/:id
  PATCH  /api/vehicles/:id/status

Bookings
  GET    /api/bookings
  POST   /api/bookings
  GET    /api/bookings/:id
  PATCH  /api/bookings/:id/status
  DELETE /api/bookings/:id

Payments
  POST   /api/payments/intent
  POST   /api/payments/confirm
  GET    /api/payments/:id
  POST   /api/payments/webhook/stripe
  POST   /api/payments/webhook/orange-money
  POST   /api/payments/webhook/wave

Contracts
  GET    /api/contracts
  POST   /api/contracts
  GET    /api/contracts/:id
  POST   /api/contracts/:id/sign
  GET    /api/contracts/:id/pdf

Import/Export
  GET    /api/import-export/listings
  POST   /api/import-export/listings
  GET    /api/import-export/transactions
  POST   /api/import-export/transactions
  PATCH  /api/import-export/transactions/:id/step

Partners
  GET    /api/partners
  POST   /api/partners
  GET    /api/partners/:id
  PATCH  /api/partners/:id

Partner Onboarding
  POST   /api/partner-onboarding/start
  PATCH  /api/partner-onboarding/:id/step
  POST   /api/partner-onboarding/:id/sign/:token
  GET    /api/partner-onboarding/:id/status

Partner PMS
  GET    /api/pms/leads
  POST   /api/pms/leads
  GET    /api/pms/quotes
  POST   /api/pms/quotes
  GET    /api/pms/showrooms

Partner Verification
  GET    /api/partner-verif/admin
  POST   /api/partner-verif
  PATCH  /api/partner-verif/:id/approve

Drivers
  GET    /api/drivers
  POST   /api/drivers
  GET    /api/drivers/:id
  PATCH  /api/drivers/:id/status
  POST   /api/drivers/:id/assign

Notifications
  GET    /api/notifications
  POST   /api/notifications/send
  PATCH  /api/notifications/:id/read
  DELETE /api/notifications/:id

Reviews
  GET    /api/reviews
  POST   /api/reviews
  DELETE /api/reviews/:id        (admin/owner)

Invoices
  GET    /api/invoices
  GET    /api/invoices/:id
  GET    /api/invoices/:id/pdf

Analytics (admin)
  GET    /api/analytics/dashboard
  GET    /api/analytics/revenue
  GET    /api/analytics/bookings
  GET    /api/analytics/users

Admin
  GET    /api/admin/commissions
  GET    /api/admin/audit-logs
  GET    /api/admin/roles
  POST   /api/admin/roles
  PATCH  /api/admin/roles/:id
```

### 4.3 Middleware chain par requête

```
Request
  └─ Cloudflare WAF
     └─ express-rate-limit
        └─ helmet (CSP / HSTS / X-Frame)
           └─ cors (origines whitelistées)
              └─ express-mongo-sanitize
                 └─ express.json (limit 1mb)
                    └─ authenticate (JWT verify)
                       └─ requireRole / requirePermission (RBAC)
                          └─ validate (Zod schema)
                             └─ Controller
                                └─ auditLog (actions sensibles)
                                   └─ Response
```

### 4.4 Queue BullMQ (tâches async)

```
emailQueue         → envoi Resend (retry 3x, backoff exponentiel)
pdfQueue           → génération PDFKit (contrats, factures)
notificationQueue  → push + SMS + WhatsApp
kycQueue           → OCR Tesseract + face matching
analyticsQueue     → agrégation stats nocturne
cleanupQueue       → suppression tokens expirés (cron daily)
```

---

## 5. Architecture Base de Données

### 5.1 Vue relationnelle globale

```
Users ──────────────────────────────────────────────────────────┐
  │                                                              │
  ├─── KycSubmissions ──── KycDocuments                         │
  │         └──── FaceMatchResults                              │
  │         └──── OcrResults                                    │
  │         └──── TrustScores                                   │
  │                                                              │
  ├─── Bookings ──── RentalContracts                            │
  │         └──── Payments ──── Invoices                        │
  │         └──── Reviews                                       │
  │                                                              │
  ├─── Partners ──── PartnerVerifications                       │
  │         └──── PartnerCertifications                         │
  │         └──── PartnerOnboardings                            │
  │         └──── PartnerShowrooms                              │
  │         └──── PartnerLeads                                  │
  │         └──── PartnerQuotes                                 │
  │         └──── CommissionLedger                              │
  │                                                              │
  ├─── IETransactions ──── InspectionReports                   │
  │         └──── EscrowAccounts                               │
  │         └──── ShippingTracking                             │
  │         └──── CustomsDocuments                             │
  │                                                              │
  ├─── Drivers ──── DriverAssignments                          │
  │         └──── DriverAvailability                           │
  │                                                              │
  ├─── Vehicles ──── VehicleInspections                        │
  │         └──── VehicleDocuments                             │
  │         └──── VehicleHistory                               │
  │                                                              │
  ├─── Notifications                                            │
  ├─── Chats ──── ChatMessages                                 │
  ├─── AuditLogs                                               │
  └─── Wallets ──── WalletTransactions ─────────────────────┘
```

### 5.2 Liste des 96 collections — MODÈLE CIBLE, pas un inventaire

> ⚠️ **Cette liste décrit la base de données visée, pas celle qui tourne.**
> Elle a été écrite comme plan de conception et n'a jamais été un état des
> lieux : une bonne partie de ces collections n'a aucun schéma Mongoose
> (`driver_assignments`, `vehicle_inspections`, `support_messages`,
> `webhook_logs`…), et trois schémas existants ne sont référencés par aucun
> contrôleur ni aucune route — `wallets`, `wallet_transactions` et
> `support_tickets`, dont les collections sont d'ailleurs absentes de la base
> de production (voir aussi la feuille de route § 10, où « Portefeuille
> partenaire » et « Support Tickets » figurent en chantiers non faits).
>
> **L'inventaire réel, lui, c'est `server/models/` — 51 schémas à ce jour.**
> Une collection listée ici sans modèle correspondant est une intention, pas
> une capacité : ne jamais s'y fier pour conclure qu'une donnée est stockée,
> exposée à l'administration, ou disponible pour un développement.


#### A — Identity & Access Management
| # | Collection | Clés principales | Relations |
|---|---|---|---|
| 1 | `users` | email, role, status, kycStatus | → bookings, reviews, wallets |
| 2 | `roles` | name, permissions[] | → users |
| 3 | `permissions` | module, action, description | → roles |
| 4 | `sessions` | userId, token, expiresAt | → users |
| 5 | `refresh_tokens` | userId, token, expiresAt | → users |
| 6 | `otp_codes` | userId, code (bcrypt), type, expiresAt | → users |
| 7 | `audit_logs` | userId, action, resource, ip, userAgent | → users |
| 8 | `login_history` | userId, ip, device, country, success | → users |

#### B — KYC & Vérification
| # | Collection | Clés principales | Relations |
|---|---|---|---|
| 9 | `kyc_submissions` | userId, status, trustScore, submittedAt | → users |
| 10 | `kyc_documents` | submissionId, type (recto/verso/selfie), url | → kyc_submissions |
| 11 | `ocr_results` | submissionId, extractedData, confidence | → kyc_submissions |
| 12 | `face_match_results` | submissionId, score, passed | → kyc_submissions |
| 13 | `trust_scores` | userId, score, level (bronze→platine), history[] | → users |
| 14 | `verification_history` | userId, action, adminId, reason, date | → users |

#### C — Partners
| # | Collection | Clés principales | Relations |
|---|---|---|---|
| 15 | `partners` | userId, companyName, type, status, trustLevel | → users |
| 16 | `partner_verifications` | partnerId, criteria{}, score, adminId | → partners |
| 17 | `partner_certifications` | partnerId, level, expiresAt, documents[] | → partners |
| 18 | `partner_onboardings` | partnerId, step, status, loiSignedAt, agreementSignedAt | → partners |
| 19 | `partner_showrooms` | partnerId, name, description, vehicles[], isActive | → partners |
| 20 | `partner_contacts` | partnerId, name, role, email, phone | → partners |
| 21 | `partner_notes` | partnerId, adminId, content, createdAt | → partners |
| 22 | `partner_documents` | partnerId, type, url, status | → partners |
| 23 | `partner_leads` | partnerId, source, status, assignedTo | → partners |
| 24 | `partner_quotes` | partnerId, leadId, amount, validUntil, status | → partners, leads |

#### D — Manufacturers & Dealers
| # | Collection | Clés principales | Relations |
|---|---|---|---|
| 25 | `manufacturers` | name, country, brand[], partnerId | → partners |
| 26 | `manufacturer_reps` | manufacturerId, userId, territory | → manufacturers |
| 27 | `dealers` | name, partnerId, city, country, licenseNumber | → partners |
| 28 | `dealer_inventory` | dealerId, vehicleId, quantity, price | → dealers, vehicles |

#### E — Véhicules
| # | Collection | Clés principales | Relations |
|---|---|---|---|
| 29 | `vehicles` | ownerId, make, model, year, type, status, price | → users/partners |
| 30 | `vehicle_categories` | name, slug, icon, parentId | hiérarchique |
| 31 | `vehicle_options` | vehicleId, category, options[] | → vehicles |
| 32 | `vehicle_inspections` | vehicleId, inspectorId, score, report, date | → vehicles |
| 33 | `vehicle_documents` | vehicleId, type, url, expiresAt | → vehicles |
| 34 | `vehicle_history` | vehicleId, event, performedBy, date | → vehicles |
| 35 | `vehicle_pricing` | vehicleId, type (daily/weekly/monthly), price, currency | → vehicles |

#### F — Annonces
| # | Collection | Clés principales | Relations |
|---|---|---|---|
| 36 | `listings` | vehicleId, ownerId, type (sale/rental), status, featured | → vehicles |
| 37 | `listing_views` | listingId, userId, ip, date | → listings |
| 38 | `listing_favorites` | listingId, userId, createdAt | → listings, users |
| 39 | `listing_reports` | listingId, reporterId, reason, status | → listings, users |
| 40 | `spotlights` | listingId, startDate, endDate, position | → listings |

#### G — Réservations & Location
| # | Collection | Clés principales | Relations |
|---|---|---|---|
| 41 | `bookings` | userId, vehicleId, startDate, endDate, status, totalAmount | → users, vehicles |
| 42 | `booking_cancellations` | bookingId, reason, refundAmount, canceledBy | → bookings |
| 43 | `booking_reviews` | bookingId, reviewerId, rating, comment | → bookings, users |
| 44 | `rental_contracts` | bookingId, terms, signedAt, pdfUrl | → bookings |

#### H — Ventes
| # | Collection | Clés principales | Relations |
|---|---|---|---|
| 45 | `orders` | buyerId, vehicleId, amount, status, currency | → users, vehicles |
| 46 | `order_items` | orderId, vehicleId, price, quantity | → orders |
| 47 | `sales_contracts` | orderId, terms, signedAt, pdfUrl | → orders |
| 48 | `lois` | partnerId, buyerId, vehicleId, status, signedAt | → partners, users |
| 49 | `agreements` | partnerId, type, content, signedAt, pdfUrl | → partners |

#### I — Import/Export
| # | Collection | Clés principales | Relations |
|---|---|---|---|
| 50 | `ie_listings` | sellerId, vehicleData, originCountry, price, status | → users |
| 51 | `ie_requests` | listingId, buyerId, message, status | → ie_listings, users |
| 52 | `ie_transactions` | listingId, buyerId, sellerId, step (1-14), status | → ie_listings |
| 53 | `inspection_reports` | transactionId, inspectorId, score, photos[], report | → ie_transactions |
| 54 | `escrow_accounts` | transactionId, amount, currency, status, releaseConditions | → ie_transactions |
| 55 | `shipping_tracking` | transactionId, carrier, trackingNumber, events[] | → ie_transactions |
| 56 | `customs_documents` | transactionId, type, url, validatedAt | → ie_transactions |

#### J — Paiements & Finance
| # | Collection | Clés principales | Relations |
|---|---|---|---|
| 57 | `payments` | orderId/bookingId, amount, currency, method, status | → orders, bookings |
| 58 | `payment_methods` | userId, type (card/mobile/bank), details (chiffré), isDefault | → users |
| 59 | `invoices` | paymentId, number, amount, pdfUrl, dueDate | → payments |
| 60 | `refunds` | paymentId, amount, reason, status, processedAt | → payments |
| 61 | `commission_ledger` | transactionId, partnerId, amount, rate, type, paidAt | → partners |
| 62 | `wallets` | userId/partnerId, balance, currency, status | → users, partners |
| 63 | `wallet_transactions` | walletId, type (credit/debit), amount, reference | → wallets |
| 64 | `subscription_plans` | name, price, currency, features[], maxListings | — |
| 65 | `subscriptions` | userId, planId, startDate, endDate, status | → users, plans |

#### K — Chauffeurs Professionnels
| # | Collection | Clés principales | Relations |
|---|---|---|---|
| 66 | `drivers` | userId, licenseNumber, experience, zones[], status | → users |
| 67 | `driver_assignments` | driverId, bookingId, startDate, endDate, amount | → drivers, bookings |
| 68 | `driver_ratings` | driverId, customerId, rating, comment | → drivers, users |
| 69 | `driver_availability` | driverId, date, slots[], isAvailable | → drivers |

#### L — Contrats & Documents
| # | Collection | Clés principales | Relations |
|---|---|---|---|
| 70 | `contracts` | type, partiesIds[], status, content, signedAt | polymorphe |
| 71 | `contract_signatures` | contractId, signerId, token, signedAt, ip | → contracts |
| 72 | `documents` | ownerId, type, url, expiresAt, status | polymorphe |
| 73 | `document_templates` | type, content, variables[], language | — |

#### M — Communication
| # | Collection | Clés principales | Relations |
|---|---|---|---|
| 74 | `notifications` | userId, type, title, body, channel, read | → users |
| 75 | `email_logs` | to, subject, template, status, messageId, sentAt | — |
| 76 | `sms_logs` | to, body, provider, status, sentAt | — |
| 77 | `whatsapp_logs` | to, template, status, sentAt | — |
| 78 | `chats` | participantIds[], type (direct/support), lastMessageAt | → users |
| 79 | `chat_messages` | chatId, senderId, content, type, readBy[] | → chats |
| 80 | `support_tickets` | userId, subject, priority, status, assignedTo | → users |
| 81 | `support_messages` | ticketId, senderId, content, attachments[] | → support_tickets |

#### N — Marketing & Publicité
| # | Collection | Clés principales | Relations |
|---|---|---|---|
| 82 | `ads` | title, type, target, startDate, endDate, clicks, views | — |
| 83 | `campaigns` | name, budget, channels[], status, metrics{} | — |
| 84 | `referrals` | referrerId, refereeId, code, reward, status | → users |

#### O — Avis & Évaluations
| # | Collection | Clés principales | Relations |
|---|---|---|---|
| 85 | `reviews` | targetId, targetType, authorId, rating, comment, status | polymorphe |
| 86 | `review_responses` | reviewId, responderId, content, createdAt | → reviews |

#### P — Analytics & Reporting
| # | Collection | Clés principales | Relations |
|---|---|---|---|
| 87 | `page_views` | page, userId, ip, country, date | — |
| 88 | `search_logs` | query, filters{}, userId, resultsCount, date | — |
| 89 | `conversion_events` | type, userId, source, value, date | → users |
| 90 | `revenue_reports` | period, totalRevenue, byCountry{}, byCategory{} | — |

#### Q — Configuration & Système
| # | Collection | Clés principales | Relations |
|---|---|---|---|
| 91 | `countries` | code, name, currency, phonePrefix, isActive | — |
| 92 | `currencies` | code, symbol, exchangeRateToXOF, updatedAt | — |
| 93 | `exchange_rates` | from, to, rate, source, updatedAt | — |
| 94 | `settings` | key, value, description, updatedBy | — |
| 95 | `feature_flags` | key, enabled, rollout (%), targetRoles[] | — |
| 96 | `webhook_logs` | provider, event, payload, status, processedAt | — |

### 5.3 Index MongoDB recommandés

```javascript
// Performance critique
users:        { email: 1 }, { role: 1, status: 1 }
vehicles:     { status: 1, type: 1, country: 1 }, { ownerId: 1 }
bookings:     { userId: 1, status: 1 }, { vehicleId: 1, startDate: 1, endDate: 1 }
payments:     { status: 1, createdAt: -1 }
notifications:{ userId: 1, read: 1, createdAt: -1 }
audit_logs:   { userId: 1, createdAt: -1 }, { resource: 1, createdAt: -1 }
ie_transactions: { step: 1, status: 1 }
chat_messages:{ chatId: 1, createdAt: -1 }
```

---

## 6. Architecture DevOps

### 6.1 Environnements

| Env | Frontend | Backend | MongoDB | Usage |
|---|---|---|---|---|
| `development` | localhost:5173 | localhost:5001 | Atlas Dev cluster | Dev local |
| `staging` | staging.vit-auto.com | Railway staging | Atlas Staging | Tests QA |
| `production` | vit-auto.com | Railway prod | Atlas M10+ | Live |

### 6.2 Pipeline CI/CD (GitHub Actions)

```yaml
# .github/workflows/ci.yml

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - checkout
      - node 20
      - npm ci (root + server)
      - eslint
      - vitest (unit)
      - jest (integration avec MongoDB Memory Server)

  security-scan:
    - npm audit --audit-level=high
    - snyk test (si token configuré)

  build-frontend:
    needs: [lint-and-test]
    - vite build
    - deploy → Vercel (preview pour PR, prod pour main)

  deploy-backend:
    needs: [lint-and-test]
    branches: [main]
    - railway up --service vit-auto-api
    - health check : GET /api/ping → 200

  notify:
    - Sentry release upload
    - Slack/email notification
```

### 6.3 Déploiement Railway

```
# server/railway.json
{
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "node server.js",
    "healthcheckPath": "/api/ping",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}

# Variables Railway
NODE_ENV=production
PORT=5001 (auto-assigné)
MONGO_URI=...
JWT_SECRET=...
RESEND_API_KEY=...
REDIS_URL=...
```

### 6.4 Stratégie de sauvegarde

> ⚠️ Non re-vérifié le 2026-07-16 : le niveau de sauvegarde ci-dessous suppose un plan Atlas payant avec Continuous Backup. **À confirmer directement dans le dashboard MongoDB Atlas** (Project → Backup) — un cluster sur le tier gratuit/partagé n'a pas ces garanties. Les photos étant stockées en base64 **dans les documents MongoDB eux-mêmes** (voir note en tête de document), leur sauvegarde dépend entièrement de la sauvegarde Atlas — il n'y a pas de sauvegarde média séparée (pas de Cloudinary).

```
MongoDB Atlas (à confirmer selon le tier réel du cluster)
  └─ Continuous Backup (point-in-time recovery) — si plan M10+
  └─ Snapshot quotidien → conservé 7 jours
  └─ Snapshot hebdomadaire → conservé 4 semaines
  └─ Snapshot mensuel → conservé 12 mois

Upstash (Redis)
  └─ Persistence gérée par Upstash — vérifier le niveau réel du plan souscrit
  └─ Données de cache/file d'attente, non critiques en cas de perte (les jobs
     BullMQ échoués ne bloquent pas les requêtes principales, voir §4.4)
```

### 6.5 Monitoring

| Outil | Usage | Seuil d'alerte |
|---|---|---|
| Sentry | Erreurs JS/Node | Error rate > 1% |
| Better Stack | Uptime + logs | Downtime > 30s |
| Railway Metrics | CPU/RAM/requêtes | CPU > 80%, RAM > 512MB |
| MongoDB Atlas | Slow queries | > 100ms |
| PostHog | Analytics produit | — |

---

## 7. Architecture Sécurité

### 7.1 Authentification

```
Flux JWT (Access + Refresh)
──────────────────────────
1. POST /auth/login → { accessToken (15min), refreshToken (7j) }
2. accessToken stocké en mémoire (JS variable, pas localStorage)
3. refreshToken stocké en httpOnly cookie
4. Requête → Bearer accessToken dans Authorization header
5. 401 → apiClient.js appelle auto POST /auth/refresh
6. refreshToken invalidé à logout (DB blacklist)

OTP email (vérification compte)
───────────────────────────────
- Code 6 chiffres, hashé bcrypt avant stockage
- Expiration 15 minutes
- Max 3 tentatives, puis blocage 1h (Redis counter)

2FA (optionnel, à implémenter)
──────────────────────────────
- TOTP (Google Authenticator) via otpauth
- Backup codes (10 codes, hashés)
```

### 7.2 RBAC — Rôles & Permissions

```
super_admin      → toutes les permissions
administrator    → admin.*, users.*, kyc.*, catalogue.*
support          → users.read, bookings.read, support.*
finance          → payments.*, invoices.*, commissions.*
partner_manager  → partners.*, kyc.read
manufacturer     → vehicles.write (les siens), catalogue.read
dealer           → vehicles.write (les siens), bookings.read
rental_company   → vehicles.write, bookings.*, drivers.*
professional_driver → drivers.write (le sien)
buyer            → catalogue.read, bookings.write, reviews.write
seller           → vehicles.write (les siens), bookings.read
customer         → catalogue.read, bookings.write
```

```javascript
// Middleware RBAC
requirePermission('kyc', 'approve')
requireRole(['administrator', 'super_admin'])
requireOwnership(resource, 'ownerId') // Vérifie que l'user est propriétaire
```

### 7.3 KYC — Pipeline de vérification

```
Soumission
    │
    ▼
Validation formats (jpg/png/pdf < 5MB)
    │
    ▼
Stockage Cloudinary (dossier privé, signed URL)
    │
    ▼
Queue kycQueue → Worker
    │
    ├─ OCR Tesseract → extraction données CNI/Passeport
    │       └─ Comparaison avec données User (nom, date naissance)
    │
    ├─ Face Matching → selfie vs photo CNI (score > 0.85 requis)
    │
    └─ Trust Score calculation
            ├─ Documents complets : +30 pts
            ├─ OCR match : +25 pts
            ├─ Face match : +25 pts
            ├─ Email vérifié : +10 pts
            └─ Téléphone vérifié : +10 pts

Niveau résultant
    ├─ 0-40   → non_verifie
    ├─ 41-60  → bronze
    ├─ 61-75  → argent
    ├─ 76-90  → or
    └─ 91-100 → platine

Révision admin
    ├─ APPROUVER → status = VERIFIE, email confirmation
    └─ REFUSER → status = REFUSE, email avec raison, reset cooldown 24h
```

### 7.4 Protection des données sensibles

> 🔴 **Écart de sécurité réel, pas seulement documentaire (vérifié 2026-07-16)** : aucun chiffrement applicatif (AES-256-GCM ou autre) n'existe dans le code pour ces champs — ils sont stockés **en clair** dans MongoDB, y compris les photos KYC (pièce d'identité recto/verso + selfie, `User.identity.frontImage/backImage/selfie` — en base64, pas d'URL signée ni de dossier privé séparé). La sécurité de ces données repose aujourd'hui uniquement sur : le contrôle d'accès applicatif (KYC jamais renvoyé en vue liste, réservé au propriétaire/admin — voir passe perf du 2026-07-13), la sécurité réseau/auth MongoDB Atlas, et le TLS en transit. **À traiter comme un chantier de sécurité prioritaire**, en particulier avant toute expansion vers des pays à régime de protection des données strict (RGPD UE notamment — voir note RGPD ci-dessous).

```javascript
// Données identifiées comme sensibles — actuellement NON chiffrées au repos,
// stockées en clair (voir avertissement ci-dessus) :
- payment_methods.details (numéros de carte, IBAN) — si ce champ existe réellement, à confirmer
- users.nationalId
- users.taxNumber (partenaires)
- users.identity.frontImage / backImage / selfie (KYC, base64)

// Données masquées dans les logs
- Mots de passe (jamais loggués)
- Tokens JWT
- Clés API

// Headers de sécurité (Helmet)
Content-Security-Policy: default-src 'self'; img-src * data:
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains

// Rate Limiting
POST /auth/login        : 5 req/15min par IP
POST /auth/register     : 3 req/heure par IP
POST /kyc/submit        : 2 req/24h par userId
GET  /api/*             : 100 req/min par IP
GET  /api/admin/*       : 200 req/min par userId
```

### 7.5 Audit Log

Chaque action sensible est enregistrée automatiquement :

```javascript
// middleware/auditLog.js — actions loggées
const AUDITED_ACTIONS = [
  'user.create', 'user.delete', 'user.block',
  'kyc.approve', 'kyc.reject', 'kyc.reset',
  'role.assign', 'permission.change',
  'payment.refund', 'commission.edit',
  'contract.sign', 'contract.delete',
  'partner.approve', 'partner.suspend',
  'vehicle.delete', 'vehicle.suspend',
  'admin.login', 'admin.exportData',
];
// Champs : userId, role, action, resource, resourceId, ip, userAgent, before, after, timestamp
```

### 7.6 RGPD & droits des personnes concernées (ajouté 2026-07-16, état vérifié)

VIT AUTO traite des données de résidents de l'UE (partenaires/clients en France, Belgique) — le RGPD s'applique dès lors, indépendamment du siège de l'entreprise.

**Ce qui existe déjà et sert de socle :**
- Consentement/authentification par compte (email + mot de passe, ou OTP téléphone via Twilio Verify).
- Contrôle d'accès sur les données KYC (jamais exposées en vue liste, réservées au titulaire + admin).
- Journal d'audit sur les actions admin sensibles (§7.5).
- Politique de confidentialité et CGU existantes côté site (`src/pages/CGU.jsx`, `MentionsLegales.jsx`) — à compléter (voir phase juridique).

**Ce qui manque et doit être traité avant toute mise en conformité affirmée :**
- ❌ **Aucun mécanisme de droit d'accès/portabilité** (export des données personnelles d'un utilisateur sur demande) n'est implémenté.
- ❌ **Aucun mécanisme de droit à l'effacement** (suppression de compte + anonymisation en cascade des données liées — réservations, KYC, avis) n'est implémenté. La suppression d'un véhicule/utilisateur existante dans le code est une suppression administrative, pas un parcours RGPD dédié.
- ❌ **Pas de chiffrement au repos** des données sensibles (voir §7.4) — un point que la CNIL et les régulateurs équivalents examinent pour les données KYC/identité en particulier.
- ❌ **Pas de registre des traitements ni de base légale documentée** par type de donnée (nécessaire pour un DPO ou une notice de confidentialité complète).
- ❌ **Pas de mécanisme de consentement granulaire aux cookies non essentiels** (analytics, marketing) — voir phase juridique, Politique Cookies à créer.

Ce chantier relève à la fois de développement (droits d'accès/effacement, chiffrement) et de conseil juridique (registre des traitements, base légale, DPO) — voir le fichier `CGU-CGV-Confidentialite-Cookies-DRAFT.md` livré dans cette même session pour un premier brouillon de politique de confidentialité qui **documente honnêtement ces manques** plutôt que de prétendre une conformité non atteinte.

---

## 8. Architecture Métier

### 8.1 Flux de vente de véhicule

```
Vendeur publie annonce (vehicle + listing)
    │
    ▼
Validation admin (status: EN_ATTENTE → PUBLIE)
    │
    ▼
Acheteur exprime intérêt → Order créée
    │
    ▼
LOI générée (Letter of Intent)
    │     └─ Email vendeur + acheteur avec lien signature
    ▼
Signature LOI (PartnerSignByToken ou interface)
    │
    ▼
Contrat de vente généré (SalesContract + PDF)
    │
    ▼
Paiement (Stripe / Orange Money / Wave)
    │     └─ Webhook → Payment.status = COMPLETED
    ▼
Facture générée (pdfQueue)
    │
    ▼
Commission déduite et versée au vendeur (CommissionLedger)
    │
    ▼
Livraison + transfert propriété
```

### 8.2 Flux de location

```
Disponibilité vérifiée (dates non chevauchantes)
    │
    ▼
Booking créée (status: EN_ATTENTE)
    │
    ▼
Confirmation propriétaire (accept/reject)
    │
    ▼
Contrat de location généré (RentalContract + PDF)
    │
    ▼
Paiement (acompte 30% à la réservation, solde à la remise clés)
    │
    ▼
Livraison GPS trackée (Haversine)
    │
    ▼
Chauffeur professionnel assigné (optionnel)
    │
    ▼
Fin de location → Évaluation mutuelle
    │
    ▼
Commission déduite → Versement propriétaire
```

### 8.3 Flux Import/Export (14 étapes)

```
Étape 1  : Publication annonce I/E (seller)
Étape 2  : Demande acheteur (IERequest)
Étape 3  : Acceptation vendeur → IETransaction créée
Étape 4  : Dépôt escrow acheteur (EscrowAccount)
Étape 5  : Inspection véhicule (InspectionReport)
Étape 6  : Validation inspection (admin/acheteur)
Étape 7  : Documents export préparés
Étape 8  : Dédouanement pays origine (CustomsDocuments)
Étape 9  : Expédition (ShippingTracking)
Étape 10 : Transit maritime / terrestre
Étape 11 : Arrivée port destination
Étape 12 : Dédouanement pays destination
Étape 13 : Livraison finale
Étape 14 : Libération escrow → Paiement vendeur → Commission
```

### 8.4 Flux d'onboarding Partenaire Fondateur

```
Étape 1 : Candidature (formulaire /partner-onboarding)
    └─ PartnerOnboarding créé (status: CANDIDATURE)

Étape 2 : Revue admin
    └─ APPROUVE → génération LOI VA-FP-001

Étape 3 : Signature LOI (lien email sécurisé par token)
    └─ loiSignedAt enregistré

Étape 4 : Accord de partenariat généré
    └─ Signature électronique

Étape 5 : Checklist activation (11 items)
    └─ onboardingStatus = ACTIF

→ Commissions : 10% ventes directes + 2% réseau
```

### 8.5 Commissions

| Type | Taux | Calculé sur |
|---|---|---|
| Partenaire Fondateur – Vente directe | 10% | Prix de vente net |
| Partenaire Fondateur – Réseau | 2% | CA réseau filleuls |
| Partenaire Standard – Location | 8% | Montant location |
| Partenaire Standard – Vente | 5% | Prix de vente net |
| Chauffeur Professionnel | 85% | Tarif course net |
| Commission plateforme | 15% | Toutes transactions |

### 8.6 Chauffeurs Professionnels

```
Driver s'inscrit → KYC requis (niveau or minimum)
    │
    ▼
Validation permis (OCR + admin)
    │
    ▼
Zones de service définies (city, radius km)
    │
    ▼
Disponibilité mise à jour (slots hebdomadaires)
    │
    ▼
Client réserve avec chauffeur → DriverAssignment
    │
    ▼
Course terminée → Rating bidirectionnel
    │
    ▼
Paiement via wallet → 85% chauffeur / 15% plateforme
```

---

## 9. Architecture IA

### 9.1 Vue d'ensemble

```
                    ┌─────────────────┐
                    │  Assistant VIT  │
                    │  AUTO (Claude)  │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
  ┌───────▼──────┐  ┌────────▼──────┐  ┌───────▼──────┐
  │Recherche     │  │Recommandations│  │  Modération  │
  │Intelligente  │  │Personnalisées │  │  Contenu     │
  └──────────────┘  └───────────────┘  └──────────────┘
```

### 9.2 Modules IA

#### Assistant VIT AUTO (Chat IA)
- **Modèle** : Claude claude-sonnet-4-6 (Anthropic) via API
- **Rôle** : Répondre aux questions sur les véhicules, prix, délais I/E, contrats
- **Contexte injecté** : catalogue public, FAQ, politique tarifaire
- **Intégration** : widget chat bulle en bas à droite (toutes pages)
- **Coût** : ~$0.003/message, budget limité par quota userId/mois

```javascript
// Appel API Claude
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 512,
  system: VITAUTO_SYSTEM_PROMPT,
  messages: conversation.slice(-10), // 10 derniers messages max
});
```

#### Recommandations personnalisées
- **Algo** : Collaborative filtering léger (mongoose aggregation)
- **Signaux** : véhicules vus, favoris, réservations passées, pays, budget
- **Résultat** : section "Vous aimerez aussi" sur fiches véhicule
- **Fallback** : véhicules populaires dans le même pays si pas assez de données

#### Modération de contenu
- **Photos** : ⚠️ non implémenté (vérifié 2026-07-16) — aucune modération automatique NSFW/violence n'existe. La validation image actuelle (`imageValidation.js`) vérifie le type MIME réel et la taille, pas le contenu visuel. Modération humaine uniquement (admin approuve/rejette chaque annonce).
- **Textes** : regex + liste de mots interdits (multilangue)
  - Descriptions d'annonces, messages chat, avis
- **Avis frauduleux** : score de similarité (TF-IDF) pour détecter les doublons

#### Recherche intelligente
- **Court terme** : MongoDB text search avec `$text` et index fulltext
- **Moyen terme** : Meilisearch (index dédié véhicules)
  - Tolérance aux fautes, synonymes, filtres facettes
- **Requête exemple** : "toyota hilux diesel abidjan" → score pertinence + distance

### 9.3 OCR & Face Matching (KYC)

```javascript
// OCR Tesseract.js (déjà intégré)
const worker = await createWorker(['fra', 'eng', 'ara']);
const { data: { text } } = await worker.recognize(imageBuffer);
const extracted = parseIdCard(text); // regex extraction

// Face matching (à implémenter)
// Option A : face-api.js (local, gratuit)
// Option B : AWS Rekognition (0.001$/image, très précis)
// Option C : Azure Face API (0.001$/transaction)
// → Recommandation : face-api.js pour MVP, AWS Rekognition pour prod
```

---

## 10. Feuille de route de migration

### Phase 0 — Fondations (actuelle → J+30)
- [x] React + Vite + Node.js + MongoDB
- [x] Auth JWT + refresh + OTP email
- [x] KYC (OCR Tesseract + face matching + admin review)
- [x] Import/Export 14 étapes
- [x] PMS Partenaires 20 étapes
- [x] Partner Onboarding (LOI + Agreement)
- [x] Email : Resend (Cas B) — fait, confirmé en usage
- [~] Images : base64 en base — vignettes compressées ajoutées le 2026-07-16 (gain majeur mesuré : catalogue 20 véhicules 3,9 Mo → 455 Ko) sans changer le stockage sous-jacent ; migration complète vers un stockage objet externe (Cloudinary ou équivalent) reste une option future, plus nécessaire en urgence après ce correctif
- [x] Redis : Upstash déjà en place (cache catalogue + BullMQ) — pas de rate limit distribué dessus pour l'instant (express-rate-limit reste en mémoire par instance)

### Phase 1 — Stabilisation (J+30 → J+60)
- [ ] Tests (Vitest unit + Jest integration)
- [ ] Next.js migration (app router)
- [ ] TypeScript progressif (types d'abord sur models + API client)
- [ ] Stripe webhooks
- [ ] Orange Money / Wave webhooks
- [ ] Portefeuille partenaire (Wallet)
- [ ] BullMQ queues (email, PDF, notif)

### Phase 2 — Croissance (J+60 → J+120)
- [ ] Support Tickets (chat admin ↔ user)
- [ ] Multi-admin RBAC complet
- [ ] Audit logs complets
- [ ] Assistant VIT AUTO (Claude API)
- [ ] Meilisearch (recherche intelligente)
- [ ] PWA + notifications push
- [ ] Application mobile (React Native / Expo)

### Phase 3 — Scale (J+120 → J+180)
- [ ] Elasticsearch (si catalogue > 10k véhicules)
- [ ] CDN Cloudflare images optimisées
- [ ] Recommandations ML
- [ ] Analytics avancés (PostHog)
- [ ] Expansion : 14 → 20+ pays
- [ ] OAuth (Google / Apple / Microsoft)
- [ ] Marketplace B2B (Manufacturers ↔ Dealers)

---

## Annexes

### A — Conventions de code

```javascript
// Nommage
controllers/vehicleController.js   // camelCase
models/Vehicle.js                  // PascalCase
routes/vehicles.js                 // kebab-case routes
utils/escapeRegex.js               // camelCase

// Réponse API standard
{ success: true, data: {...}, meta: { total, page, limit } }
{ success: false, error: "message", code: "ERROR_CODE" }

// Validation Zod (à adopter progressivement)
const createVehicleSchema = z.object({
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 1),
  price: z.number().positive(),
  currency: z.enum(['XOF', 'EUR', 'USD', 'GHS', 'NGN', 'MAD', 'DZD', 'EGP']),
});
```

### B — Devises supportées

| Code | Nom | Pays |
|---|---|---|
| XOF | Franc CFA BCEAO | Côte d'Ivoire, Sénégal, Mali... |
| EUR | Euro | France, Europe |
| USD | Dollar US | International |
| GHS | Cedi | Ghana |
| NGN | Naira | Nigeria |
| MAD | Dirham | Maroc |
| DZD | Dinar | Algérie |
| EGP | Livre égyptienne | Égypte |

### C — Checklist avant chaque nouvelle feature

- [ ] Modèle Mongoose défini et indexé
- [ ] Route dans le bon module
- [ ] Controller avec validation Zod + escapeRegex si texte libre
- [ ] Middleware auth + RBAC appliqué
- [ ] Rate limit adapté à l'endpoint
- [ ] Audit log si action sensible
- [ ] Email / notification si action côté utilisateur
- [ ] Pagination si liste (limit cap à 200)
- [ ] Tests (au moins 1 unit + 1 intégration)
- [ ] Ajout dans ce document (section métier ou API)

---

## Annexe D — Journal des évolutions majeures (depuis le 2026-07-02)

> Résumé factuel, pas exhaustif au niveau du code — voir l'historique Git pour le détail complet. Compilé le 2026-07-16.

- **Sécurité & performance (2026-07-09 → 13)** : audit complet, chunking Vite (273 → 138 Ko gzip au chargement initial), compression HTTP, index Mongo composés, `.lean()` sur les lectures, correction d'une faille IDOR critique sur le paiement, tokenVersion/2FA/OTP renforcés.
- **CORS & connexion (2026-07-10)** : bug CORS www/non-www et connexion bloquée par vérification téléphone sans provider SMS configuré.
- **Déploiement Railway (2026-07-11)** : auto-déploiement GitHub→Railway réparé (root dir, healthcheck), CI/CD GitHub Actions ajouté (lint/build/audit, ne déploie pas).
- **Auth & Twilio (2026-07-11)** : 8 bugs production corrigés, Twilio Verify intégré, certification obligatoire avant publication.
- **KYC refonte** : OCR Tesseract, statuts EN_ATTENTE/VERIFIE/REFUSE, face matching, revue admin, Socket.io temps réel.
- **Import/Export (pipeline 14 étapes)**, **Partner Management System (20 étapes)**, **Founding Partner Onboarding** (LOI + Accord signature électronique) : systèmes complets construits.
- **Filtrage international par pays (2026-07-13)** : `User`/`Vehicle`/`Driver.country`, filtrage catalogue/IE par pays, abonnements désactivés (feature flag réversible).
- **Escrow paiement IE (2026-07-13)** : le paiement était auto-déclaré côté client sans vérification réelle — Stripe réel pour carte, vérification admin obligatoire pour virement/mobile money/crypto.
- **Cohérence location + chat temps réel (2026-07-13)** : caution/GPS livraison/promotions/édition annonce corrigés ; chat client/partenaire/admin passé en Socket.io (polling en filet de secours).
- **Commissions Founding Partner (2026-07-14)** : barème à deux paliers — 10 %/2 % (location/vente) pour entreprise/professionnel/exportateur pendant 12 mois puis tarif standard 15 %/3 % ; 5 %/1 % permanent pour les Founding Partners "particulier" (plafonnés à 10 annonces actives) ; commission Import/Export ajoutée (jusque-là inexistante, le partenaire touchait 100 %).
- **Système d'avis clients** : soumission + affichage sur fiche véhicule (jusque-là le backend existait sans aucune UI de soumission).
- **Performance images catalogue (2026-07-16)** : les vues liste (catalogue, favoris, mes annonces, PMS, réservations) ne renvoyaient qu'une seule vignette compressée au lieu du tableau complet de photos pleine résolution en base64 — gain mesuré : 7,2 Mo → 455 Ko sur une page de 20 véhicules. Rattrapage appliqué aux véhicules publiés avant cette fonctionnalité (Jimp, pur JS).
- **Import/Export — devise, drapeaux, badge, pays de destination obligatoire (2026-07-16)** : les prix affichaient la devise brute du partenaire au lieu de la devise détectée du visiteur ; drapeaux pays et badge "Import/Export" ajoutés ; au moins un pays de destination désormais obligatoire à la publication.
- **Édition complète des annonces (2026-07-16)** : modale d'édition complète (photos, tous les champs, bascule location/vente, pays) côté partenaire et admin pour les véhicules ; formulaire d'édition (POST→PUT) pour les annonces Import/Export, jusque-là non modifiables après publication côté partenaire et inatteignables côté admin (bug de filtre `partner: req.user._id`).
- **Conversion véhicule → annonce export (2026-07-16)** : transformation explicite d'une annonce location/vente en annonce Import/Export (les deux restant des modèles Mongo distincts), avec les mêmes garde-fous que la création directe (Founding Partner requis).
- **Import Cost Engine (2026-07-16)** : moteur de calcul automatique du coût total d'importation (transport intérieur, fret maritime, assurance, frais portuaires, douane+TVA+transit+redevances, livraison finale) + commission de service VIT AUTO (hybride 3 % du prix véhicule, plancher 300 €/plafond 1 500 €, facturée à l'acheteur — distincte de la commission déjà prélevée sur le partenaire). Barèmes configurables par pays de destination et par liaison de fret (admin). Calculateur instantané sur la fiche annonce, devis figé à la réservation, pré-remplissage de l'offre finale du fournisseur à partir du devis (les emails `reservation_created`/`reservation_confirmed` existaient déjà en base mais n'étaient jamais déclenchés — câblés à cette occasion).
- **Audit dépendances (2026-07-25)** : `mongoose` (prototype pollution, modérée), `brace-expansion`/`tar` (racine) patchés sans rupture. `react-router-dom` (GHSA-qwww-vcr4-c8h2, "RSC Mode CSRF Bypass", plage vulnérable `>=7.12.0 <8.3.0`) **volontairement laissé tel quel** : aucun correctif non-cassant n'existe dans la branche 7.x (le seul "fix" proposé par `npm audit` est un retour en arrière vers 7.11.0, une régression de fonctionnalités) ; vérifié par grep (`unstable_RSC`, `react-router/rsc`, `createStaticRouter`) que l'app n'utilise pas du tout le mode RSC de React Router — la faille n'est donc pas exploitable dans cette configuration. À revisiter si un correctif 7.x sort, ou lors d'un futur budget de migration vers React Router 8. Les ~17 autres vulnérabilités restantes (`@capacitor/assets`, `concurrently`) sont toutes cantonnées à des devDependencies d'outillage (génération d'icônes mobile, lanceur de scripts `npm run dev`) jamais expédiées dans le bundle de production — risque accepté, aucune action.
- **CI cassée par ce même audit (2026-07-26)** : `.github/workflows/ci.yml` faisait échouer systématiquement le job "Backend — Syntax & Security Check" via `npm audit --audit-level=high` dans `server/` — 9 vulnérabilités "high" remontent à `archiver` (dépendance d'`exceljs`, utilisé pour l'export flotte partenaire en masse). Confirmé via `npm audit --json` : la plage vulnérable couvre `archiver@0.20.0 - 7.0.1`, c'est-à-dire l'intégralité des versions publiées — aucune release corrigée n'existe en amont (le seul "fix" proposé par npm est un retour à `exceljs@4.1.1`, une régression de 3 versions mineures qui ne corrige d'ailleurs rien puisqu'aucune version d'archiver n'est saine). Gate CI repassé de `--audit-level=high` à `--audit-level=critical` (0 critique actuellement) — à revisiter si l'écosystème archiver/exceljs publie un correctif.
- **CI mobile Android/iOS (2026-07-26)** : la machine de développement n'a ni Xcode complet, ni Android Studio, ni même Java (vérifié : `xcodebuild` renvoie une erreur CLT-only, `adb`/`ANDROID_HOME` absents, `java -version` échoue) — les Phases 4-5 de l'app mobile (build/test natif) étaient bloquées depuis plusieurs sessions. Nouveau `.github/workflows/mobile.yml` : job `android` (runner `ubuntu-latest` + `actions/setup-java`) produit un APK **debug** auto-signé (téléchargeable en artefact, installable via `adb install`) ; job `ios` (runner `macos-latest`, Xcode déjà préinstallé) compile pour le **simulateur uniquement** (`CODE_SIGNING_ALLOWED=NO`, aucune signature requise). Limite assumée et documentée dans le workflow : sans compte Apple Developer Program ni keystore de release Android (`signingConfigs` absent de `android/app/build.gradle`), impossible de produire un `.ipa`/APK publiable sur les stores — seulement des builds de test.
- **Notifications push natives branchées (2026-07-26)** : le pipeline push (enregistrement du token côté client `NotificationContext.jsx`, `PushChannel.js` prêt pour FCM, `notification.worker.js` routant `channel:"push"`) existait déjà mais n'était jamais déclenché par aucun code métier (`grep "push"` sur `queue/index.js` : zéro résultat) — trou identifié précédemment ("notifications push post-réservation"). Nouvelle fonction `dispatch.pushNotification(userId, title, body, data)` dans `queue/index.js` (résout les `pushTokens` de l'utilisateur, no-op silencieux si aucun appareil natif enregistré) branchée sur le point d'entrée unique des notifications de réservation (`notify()` dans `bookingController.js`) — couvre donc création/confirmation/annulation en un seul point de modification. Reste à faire côté utilisateur (pas du code) : créer un projet Firebase, renseigner `FCM_SERVER_KEY` et ajouter `google-services.json`/`GoogleService-Info.plist` — tant que ce n'est pas fait, les push restent un no-op silencieux par design.
- **Paliers d'abonnement — construction des avantages restants (2026-09-10)** : les quatre avantages annoncés « en préparation » sur la page Tarifs (export des statistiques, assistance premium, multi-utilisateurs, accès API) sont désormais construits et testés (64 tests dédiés). Une matrice unique, `server/constants/planFeatures.js`, fait autorité sur « quel palier ouvre quoi » ; `services/planAccess.js` en est le seul point d'entrée (`planEffectif`, `exigeFonctionnalite`), et `planActifDe` y remplace la copie locale qui vivait dans `subscriptionController`. Détails notables : (1) l'**export CSV** réutilise `getPartnerInsights` via `invokeController` plutôt qu'un second calcul, et passe par `utils/csv.js` — l'échappement maison écrit d'abord n'aurait pas neutralisé les injections de formule (`=HYPERLINK(...)` dans un titre d'annonce exfiltre les cellules voisines à l'ouverture du fichier) ; (2) l'**assistance** ressuscite le modèle `SupportTicket`, jusque-là déclaré et jamais utilisé — la file admin est ordonnée par **échéance de première réponse** (dérivée du palier : 72 h gratuit → 4 h exportateur) et non par priorité brute, faute de quoi un abonné affamerait indéfiniment les comptes gratuits ; (3) le **multi-utilisateurs** ajoute `User.teamOf`/`teamRole` et un middleware de délégation (`middleware/team.js`) qui substitue l'identité de propriété — monté **uniquement** sur les routeurs annonces et réservations, jamais sur `/api/auth` ni `/api/users`, où il donnerait à un agent la main sur le mot de passe de son employeur (un test verrouille cette frontière en listant les fichiers qui l'importent) ; (4) l'**API v1** (`/api/v1`, palier Exportateur) s'authentifie par clé SHA-256 jamais stockée en clair, revérifie l'abonnement à chaque appel, expose un contrat de champs explicite plutôt qu'un document Mongoose brut, et ne rend du client que son nom — ni e-mail, ni téléphone, ni pièce d'identité. Déploiement neutre pour la production : aucun compte ne porte d'abonnement actif ni de `teamOf`, chaque chemin ajouté sort donc immédiatement.
- **Paliers d'abonnement — leviers d'incitation (2026-09-10)** : cinq mécanismes ajoutés pour donner aux formules une raison d'être souscrites, tous testés (31 tests dédiés). (1) **Essai gratuit de 30 jours** accordé par le support (`POST /api/subscriptions/admin/:vendorId/trial`) — aucun encaissement n'étant branché, l'activation passait déjà par une confirmation manuelle : l'essai n'a donc demandé aucune plomberie de paiement. Un seul par compte pour toujours (`Subscription.trialUsedAt`), refusé par-dessus un abonnement payé, marqué `planDetails.isTrial` et affiché comme tel — laisser croire à un abonnement payé rendrait son expiration incompréhensible. (2) **Parrainage partenaire** branché sur le système de parrainage CLIENT qui existait déjà (`User.referralCode`/`referredBy`, jusque-là utilisé uniquement pour des points de fidélité) : un mois offert au parrain quand son filleul voit son plan confirmé — appliqué immédiatement si son abonnement court, mis en réserve (`referralCreditMonths`) sinon, et consommé à l'activation suivante ; un même filleul ne rapporte jamais deux fois (`referralRewarded`). (3) **Demandes clients avec avance de 2 h** pour les abonnés Business+ : les `ImportExportRequest` déposées par les visiteurs, jusque-là visibles des seuls administrateurs, sont ouvertes aux partenaires — avance et non exclusivité, sinon les demandes resteraient sans réponse. La vue partenaire ne rend que le besoin et le prénom : ni e-mail, ni téléphone, ni nom de famille, faute de quoi les demandes deviendraient un fichier de prospection. L'avance est vérifiée à la LECTURE **et** à l'écriture — sans quoi un non-abonné devinant un identifiant la contournerait entièrement. (4) **Places réservées du carrousel** d'accueil pour le palier Exportateur (`services/carrouselReserve.js`), en rotation quotidienne dérivée de la date (donc stable dans la journée et cachable) avec bouclage, pour que tous les abonnés y passent et pas seulement les six premiers ; composé en `$and` dans le filtre du catalogue, car `filter.$or` y sert déjà à la restriction par pays et l'écraser aurait fait disparaître celle-ci en silence. (5) **Bilan mensuel par e-mail** (`utils/monthlyPartnerReport.js`) pour les abonnés Business+, réutilisant `getPartnerInsights` via `invokeController` et le filet e-mail générique déjà branché sur toute `Notification` — aucun nouveau gabarit ; idempotent par mois civil (`lastMonthlyReportAt`), et formulé « aucun rapport depuis le début du mois » plutôt que « on est le 1ᵉʳ », pour qu'un serveur arrêté ce jour-là n'en saute pas un. Correction au passage : la notification d'activation promettait encore une « commission réduite » que le moteur n'applique plus depuis la décision du 2026-09-09.
- **Vitrine d'accueil — places réservées généralisées à tous les paliers (2026-09-10)** : la réservation de places, d'abord limitée au palier Exportateur, couvre désormais chaque formule payante (`PLACES_PAR_PLAN` : Individuel+ 1, Business 2, Exportateur 3). Trois précisions de périmètre, sources de confusion : (a) la vitrine lit UNIQUEMENT la collection `Vehicle` — location, vente, essai, leasing ; les annonces Import/Export vivent dans `ImportExportListing`, avec leur propre endpoint, et n'y transitent jamais ; (b) « Exportateur » désigne un niveau d'abonnement, pas un type d'annonce ; (c) deux composants consomment la même source `GET /api/vehicles?featured=true` — le carrousel du hero (`HeroSection.jsx`, en repli de la sélection admin explicite) et la section « Véhicules en vedette » (`VehicleList.jsx`). Points de conception : le filtre de palier est BORNÉ EN HAUT (`$gte: rang, $lt: rangSupérieur`) — sans cette borne, un abonné Exportateur occuperait aussi les places du Business et l'avantage vendu au palier inférieur n'existerait pas ; les places qu'un palier ne peut pas remplir sont redistribuées du plus élevé au plus bas, une vitrine à trous ne profitant à personne ; le pays du visiteur (déduit de son adresse IP via `catalogCountry`) et le type d'annonce demandé sont transmis au sélecteur, avec repli MONDIAL uniquement si le pays ne donne rien du tout — replier palier par palier mélangerait annonces locales et lointaines dans la même vitrine ; les annonces sans pays renseigné restent visibles partout, comme dans le catalogue. La clé du cache catalogue inclut désormais le jour de rotation, sans quoi une entrée mise en cache la veille survivrait au changement de jour.
- **Moteur de mise en avant unifié (2026-09-10)** : la vitrine d'accueil ne montrait que ce qu'un administrateur avait coché à la main (`Vehicle.featured`) — un administrateur qui ne cochait rien laissait la page vide, et un partenaire ne pouvait rien faire pour y figurer. `server/services/spotlightEngine.js` remplace la coche par une **composition à quatre sources**, dans cet ordre : (1) **épinglé** par un administrateur, devenu FACULTATIF — un veto positif, plus une condition d'entrée ; (2) **boost acheté** (`sponsoredUntil`/`boostLevel`), placé avant l'abonnement exactement comme dans le tri du catalogue, faute de quoi la plateforme vendrait deux fois la même place avec deux ordres contradictoires — les mises en avant INCLUSES dans un abonnement s'écrivant dans les mêmes champs, elles entrent par la même porte, sans quatrième règle à maintenir ; (3) **abonnement**, un quota par palier (`PLACES_PAR_PLAN` : Individuel+ 1, Business 2, Exportateur 3), avec borne HAUTE sur le rang — sans elle un abonné Exportateur occuperait aussi les places du Business et l'avantage du palier inférieur n'existerait pas ; (4) **mérite**, ouvert à tous, comptes gratuits compris, sur un score borné à 100 (qualité de la fiche 35, engagement réel 35, confiance 20, fraîcheur 10) avec paliers de saturation — sans eux une annonce à dix mille vues écraserait tout et la vitrine se figerait. Garde-fous transverses : rotation quotidienne dérivée de la DATE (stable dans la journée, donc cachable et testable) à chaque étape, plafond de `MAX_PAR_PARTENAIRE = 2` entrées par partenaire (un parc de trois cents annonces prendrait sinon la page entière), part maximale de boosts (`PART_MAX_BOOSTS = 0.5`, au-delà les boosts tournent entre eux), filtre par pays du visiteur avec repli MONDIAL seulement si ce pays ne donne rien, et `origine` renvoyée avec chaque élément — un classement qu'on ne peut pas expliquer est indéfendable auprès d'un partenaire. Le moteur est **générique** : véhicules, activités/loisirs et profils partenaires passent par les mêmes règles via un adaptateur par collection, chacun fournissant un « profil de signaux » normalisé (un compte partenaire n'a ni photos ni vues : ses signaux viennent de ses annonces, agrégées en une requête). `services/carrouselReserve.js`, écrit quelques heures plus tôt, est SUPPRIMÉ et le filtre `featured=true` du catalogue délègue désormais à `idsVitrine("vedette")` — deux compositions concurrentes auraient fini par afficher deux vitrines contradictoires sur la même page. Nouveau point d'entrée public `GET /api/spotlight/:emplacement` (hero, vedette, loisirs, partenaires), et deux bandes ajoutées sous « Véhicules en vedette » (`SpotlightRow`), invisibles tant qu'il n'y a pas au moins trois éléments — aucune activité n'étant publiée à ce jour, la section loisirs n'apparaîtra que lorsqu'il y en aura.
- **Vitrine partenaires — éligibilité, comptes de test, fenêtre d'ouverture (2026-09-10)** : la nouvelle bande « Partenaires à la une » a rendu publics des comptes qui ne l'étaient jamais. Trois règles s'ajoutent. (1) **Comptes de test exclus** (`server/constants/testAccounts.js`) : la détection porte uniquement sur les domaines RÉSERVÉS par la norme (RFC 2606/6761) — `example.com/net/org` et les extensions `.test`, `.example`, `.invalid`, `.localhost`, `.local` — qui n'appartiennent à personne par construction. Jamais de recherche du mot « test » dans un nom : « Testa », « Tester » sont des patronymes réels. Effet de bord assumé et correct : les fixtures de la suite créent leurs comptes sur `@example.test` et sont donc exclues elles aussi — les tests qui veulent un partenaire affichable le déclarent explicitement. Un inventaire de la base a trouvé 10 comptes concernés ; `scripts/supprimerComptesDeTest.mjs` (simulation par défaut, `--apply` pour écrire) en identifie 9 sans aucune activité et en préserve 1 qui porte une réservation réelle. (2) **Éligibilité en deux régimes** : pendant douze mois (`FIN_VITRINE_PARTENAIRES_GRATUITE`, 2027-09-10) tout partenaire ayant quelque chose à montrer y figure, sans condition commerciale — même geste et même durée que l'offre Partenaire Fondateur ; à l'échéance, la règle commerciale reprend D'ELLE-MÊME (showroom publié, boost en cours ou abonnement actif), la date étant comparée à l'instant de la requête comme l'est la validité d'un boost, sans redéploiement ni tâche planifiée. Dans les deux régimes, un partenaire sans showroom ET sans annonce reste exclu : ce n'est pas une barrière commerciale, c'est l'absence de contenu. (3) **Destination de la vignette** : `/showroom/:slug` quand un showroom est publié — le même slug que le plan de site, deux adresses pour une page dilueraient son référencement — sinon `/catalogue?owner=<id>`, un filtre ajouté à cette occasion côté interface, car `/showroom/:id` sans showroom affiche « Showroom introuvable ». Deux défauts de composition corrigés au passage, tous deux constatés sur la base réelle : le plafond par partenaire s'appliquait APRÈS troncature du vivier, si bien qu'un partenaire à 267 annonces le remplissait entièrement et laissait quatre places sur huit vides ; et l'épinglage administrateur n'était pas plafonné, alors que treize annonces épinglées existent — il l'est désormais à la moitié de la vitrine (comme les boosts), en rotation, et exempté du plafond par partenaire puisqu'il s'agit d'une décision humaine explicite.
- **Comptes de test masqués, audit de production, et un défaut de coût trouvé sur la vraie base (2026-09-10)** : (1) Les comptes créés par des scripts de test sont MARQUÉS (`User.isTestAccount`) et non supprimés — ils resservent, et une suppression est irréversible. Un compte marqué reste pleinement fonctionnel et visible côté administration ; il disparaît des seules surfaces publiques (catalogue, compteurs d'accueil, annuaire des showrooms, vitrines), via `utils/comptesDeTest.js` qui réunit le drapeau explicite et la détection par domaine réservé. `scripts/marquerComptesDeTest.mjs` marque, démarque, et fonctionne en simulation par défaut ; 11 comptes marqués en production. Un test a montré que l'exclusion initiale ne couvrait que la vitrine des partenaires, pas leurs VÉHICULES, qui continuaient d'apparaître : elle est désormais appliquée une seule fois, dans `candidats()`, pour toutes les sources. Effet de bord assumé : les fixtures créaient leurs comptes sur `@example.test`, un domaine réservé — donc masqués eux aussi, et 21 tests de vitrine échouaient sans rapport avec leur objet ; les fixtures sont passées sur un domaine non réservé, et les tests qui exercent le masquage déclarent une adresse réservée explicitement. (2) **Défaut de coût, mesuré sur la base réelle** : `/api/spotlight/partenaires` répondait en **23 s**. La cause n'était pas celle supposée d'abord (les documents véhicule pèsent 2 Ko, les photos étant sur ImageKit) mais `User.profilePhoto`, une image en base64 pouvant atteindre 1,9 Mo, chargée pour les ~108 candidats afin d'en afficher six. Les photos sont désormais lues APRÈS la sélection, pour les seuls éléments retenus (hook `enrichir`) — 23 s → 3,3 s mesurées depuis une connexion domestique. Un test verrouille l'absence de `profilePhoto` dans la liste des champs du vivier. À noter pour la suite : la collection `users` pèse 45 Mo dont **32 Mo de pièces d'identité KYC en base64** (`identity.frontImage/backImage/selfie`) ; la liste admin les exclut déjà explicitement, mais tout nouveau code lisant des utilisateurs en lot doit faire de même. (3) **Incohérences de données relevées** (non corrigées, script `scripts/archiverAnnoncesOrphelines.mjs` prêt en simulation) : 3 annonces dont le propriétaire n'existe plus, dont UNE approuvée et disponible donc réservable alors que personne ne peut l'honorer ; 10 abonnements sans vendeur ; 1 réservation portant sur une annonce disparue. Ces cas précèdent la cascade de suppression de compte (`usersController.deleteUser`), qui archive ou supprime correctement aujourd'hui.
