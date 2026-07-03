# VIT AUTO — Architecture Technique Complète

> Document de référence unique. Toute nouvelle fonctionnalité doit s'inscrire dans ce cadre avant d'être développée.
> Version : 2026-07-02 | Révision : CTO Review v1.0

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
                    │ MongoDB    │  │    Redis     │  │Cloudinary│
                    │  Atlas     │  │  (Cache+BQ)  │  │(Médias) │
                    └───────────┘  └─────────────┘  └─────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
      ┌───▼───┐          ┌────▼────┐         ┌───▼───┐
      │Resend │          │  Stripe  │         │ Sentry│
      │(Email)│          │(Paiement)│         │(Erreurs)│
      └───────┘          └─────────┘         └───────┘
```

### Domaines

| Domaine | Cible | Environnement |
|---|---|---|
| `vit-auto.com` | Frontend public | Vercel (Production) |
| `admin.vit-auto.com` | Admin Panel | Vercel (Production) |
| `partners.vit-auto.com` | Portail partenaires | Vercel (Production) |
| `api.vit-auto.com` | API REST | Railway / Fly.io |
| `staging.vit-auto.com` | Staging complet | Vercel + Railway |

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

# Médias
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

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

### 5.2 Liste des 96 collections

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

```
MongoDB Atlas
  └─ Continuous Backup (point-in-time recovery)
  └─ Snapshot quotidien → conservé 7 jours
  └─ Snapshot hebdomadaire → conservé 4 semaines
  └─ Snapshot mensuel → conservé 12 mois

Cloudinary
  └─ Backups automatiques inclus dans le plan

Redis
  └─ RDB snapshot toutes les heures (Railway Redis)
  └─ AOF désactivé (données cache, pas critiques)
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

```javascript
// Données chiffrées en base (AES-256-GCM)
- payment_methods.details (numéros de carte, IBAN)
- users.nationalId
- users.taxNumber (partenaires)

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
- **Photos** : Cloudinary AI moderation (intégré)
  - Bloque les images NSFW / violentes automatiquement
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
- [ ] **Email : Resend (Cas B)** ← en cours
- [ ] Images : migrer base64 → Cloudinary
- [ ] Redis : cache sessions + rate limit distribué

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
