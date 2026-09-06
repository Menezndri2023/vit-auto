import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy, useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { SplashScreen as NativeSplashScreen } from "@capacitor/splash-screen";
import ErrorBoundary from "./components/ErrorBoundary";
import PartnerRoute from "./components/PartnerRoute";
import AdminRoute from "./components/AdminRoute";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ChatProvider } from "./context/ChatContext";
import { I18nProvider } from "./context/I18nContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { FavoritesProvider } from "./context/FavoritesContext";
import { CartProvider } from "./context/CartContext";
import { LocationProvider } from "./context/LocationContext";
import { VehicleProvider } from "./context/VehicleContext";
import Layout from "./components/Layout/Layout";
import ToastContainer from "./components/Toast/Toast";
import Chat from "./components/Chat/Chat";
import SplashScreen from "./components/SplashScreen/SplashScreen";
import UpdateBanner from "./components/UpdateBanner/UpdateBanner";
import { SocketProvider } from "./context/SocketContext";

// ── Lazy loading des pages ─────────────────────────────────────────────────
const Home                  = lazy(() => import("./pages/Home"));
const Catalogue             = lazy(() => import("./pages/Catalogue"));
const VehicleDetails        = lazy(() => import("./pages/VehicleDetails"));
const Cart                  = lazy(() => import("./pages/Cart"));
const Booking               = lazy(() => import("./pages/Booking"));
const DriverBooking         = lazy(() => import("./pages/DriverBooking"));
const DriverEmployment      = lazy(() => import("./pages/DriverEmployment"));
const ActivityBooking       = lazy(() => import("./pages/ActivityBooking"));
const ActivitySubmit        = lazy(() => import("./pages/ActivitySubmit"));
const BookingSuccess        = lazy(() => import("./pages/BookingSuccess"));
const Dashboard             = lazy(() => import("./pages/Dashboard"));
const Profile               = lazy(() => import("./pages/Profile"));
const Login                 = lazy(() => import("./pages/Login"));
const Register              = lazy(() => import("./pages/Register"));
const VendorSubmit          = lazy(() => import("./pages/VendorSubmit"));
const VendorDashboard       = lazy(() => import("./pages/VendorDashboard"));
const VendorPublish         = lazy(() => import("./pages/VendorPublish"));
const Plans                 = lazy(() => import("./pages/Plans"));
const AdminPanel            = lazy(() => import("./pages/AdminPanel"));
const DashboardStats        = lazy(() => import("./pages/DashboardStats"));
const Services              = lazy(() => import("./pages/Services"));
const InsuranceRequest      = lazy(() => import("./pages/InsuranceRequest"));
const ServiceRequest        = lazy(() => import("./pages/ServiceRequest"));
const Favorites             = lazy(() => import("./pages/Favorites"));
const Help                  = lazy(() => import("./pages/Help"));
const ContractPage          = lazy(() => import("./pages/ContractPage"));
const Loyalty                = lazy(() => import("./pages/Loyalty"));
const Privacy               = lazy(() => import("./pages/Privacy"));
const FAQ                   = lazy(() => import("./pages/FAQ"));
const CGU                   = lazy(() => import("./pages/CGU"));
const CGV                   = lazy(() => import("./pages/CGV"));
const Cookies                = lazy(() => import("./pages/Cookies"));
const Policies                = lazy(() => import("./pages/Policies"));
const PartnerProfile        = lazy(() => import("./pages/PartnerProfile"));
const NotFound              = lazy(() => import("./pages/NotFound"));
const VerifyEmail           = lazy(() => import("./pages/VerifyEmail"));
const ForgotPassword        = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword         = lazy(() => import("./pages/ResetPassword"));
const Partenaires           = lazy(() => import("./pages/Partenaires"));
const PourquoiVitAuto       = lazy(() => import("./pages/PourquoiVitAuto"));
const MentionsLegales       = lazy(() => import("./pages/MentionsLegales"));
const ConditionsPartenaires = lazy(() => import("./pages/ConditionsPartenaires"));
const ImportExport          = lazy(() => import("./pages/ImportExport"));
const IEListings            = lazy(() => import("./pages/IEListings"));
const IEListingDetail       = lazy(() => import("./pages/IEListingDetail"));
const IETransactionTracking = lazy(() => import("./pages/IETransactionTracking"));
const IEClientDashboard     = lazy(() => import("./pages/IEClientDashboard"));
const IEAssignedTransactions = lazy(() => import("./pages/IEAssignedTransactions"));
const ImporterApply         = lazy(() => import("./pages/ImporterApply"));
const ImporterDashboard     = lazy(() => import("./pages/ImporterDashboard"));
const KYC                   = lazy(() => import("./pages/KYC"));
const PartnerCertification    = lazy(() => import("./pages/PartnerCertification"));
const PartnerPMSDashboard     = lazy(() => import("./pages/PartnerPMSDashboard"));
const PartnerFleetImport      = lazy(() => import("./pages/PartnerFleetImport"));
const PartnerShowroomPublic   = lazy(() => import("./pages/PartnerShowroomPublic"));
const PartnerOnboardingPortal = lazy(() => import("./pages/PartnerOnboardingPortal"));
const PartnerSignByToken      = lazy(() => import("./pages/PartnerSignByToken"));
const QuotePublicView         = lazy(() => import("./pages/QuotePublicView"));
const FoundingPartnerLegal    = lazy(() => import("./pages/FoundingPartnerLegal"));
const PaymentSimulate         = lazy(() => import("./pages/PaymentSimulate"));
const PaymentResult           = lazy(() => import("./pages/PaymentResult"));

// ── Routes internes — accès à authReady pour éviter le flash ──────────────
function AppRoutes() {
  const { authReady } = useAuth();

  // Attendre que la validation du token soit terminée avant d'afficher quoi que ce soit
  if (!authReady) return <SplashScreen persistent />;

  return (
    <Layout>
      {/* Filet de sécurité global : certaines pages listées ci-dessous ont leur
          propre <ErrorBoundary> (comportement de repli spécifique), mais toute
          page qui n'en a pas explicitement ne doit plus faire planter
          l'application entière (écran blanc) — trouvé en audit. */}
      <ErrorBoundary>
        <Suspense fallback={<SplashScreen persistent />}>
        <Routes>
          {/* ── Pages publiques ─────────────────────────────── */}
          <Route path="/"                       element={<Home />} />
          <Route path="/catalogue"              element={<Catalogue />} />
          <Route path="/vehicle/:id"            element={<ErrorBoundary><VehicleDetails /></ErrorBoundary>} />
          <Route path="/cart"                   element={<ErrorBoundary><Cart /></ErrorBoundary>} />
          <Route path="/login"                  element={<Login />} />
          <Route path="/register"               element={<Register />} />
          <Route path="/verify-email"           element={<VerifyEmail />} />
          <Route path="/forgot-password"        element={<ForgotPassword />} />
          <Route path="/reset-password"         element={<ResetPassword />} />

          {/* ── Pages d'information ────────────────────────── */}
          <Route path="/services"               element={<Services />} />
          <Route path="/insurance-request"      element={<InsuranceRequest />} />
          <Route path="/services/:category"     element={<ServiceRequest />} />
          <Route path="/help"                   element={<Help />} />
          <Route path="/plans"                  element={<Plans />} />
          <Route path="/partenaires"            element={<Partenaires />} />
          <Route path="/pourquoi"               element={<PourquoiVitAuto />} />
          <Route path="/partner/:id"            element={<PartnerProfile />} />
          <Route path="/import-export"                    element={<ImportExport />} />
          <Route path="/import-export/listings"          element={<IEListings />} />
          <Route path="/import-export/listings/:id"      element={<IEListingDetail />} />
          <Route path="/import-export/transaction/:id"   element={<ErrorBoundary><IETransactionTracking /></ErrorBoundary>} />
          <Route path="/import-export/dashboard"         element={<ErrorBoundary><IEClientDashboard /></ErrorBoundary>} />
          <Route path="/import-export/assigned"          element={<ErrorBoundary><IEAssignedTransactions /></ErrorBoundary>} />

          {/* ── Pages légales ──────────────────────────────── */}
          <Route path="/privacy"                element={<Privacy />} />
          <Route path="/faq"                    element={<FAQ />} />
          <Route path="/cgu"                    element={<CGU />} />
          <Route path="/cgv"                    element={<CGV />} />
          <Route path="/cookies"                element={<Cookies />} />
          <Route path="/politiques"             element={<Policies />} />
          <Route path="/mentions-legales"       element={<MentionsLegales />} />
          <Route path="/conditions-partenaires" element={<ConditionsPartenaires />} />

          {/* ── Réservation (auth optionnelle, KYC gate interne) ── */}
          <Route path="/booking/success"        element={<BookingSuccess />} />
          <Route path="/booking/:id"            element={
            <ErrorBoundary><Booking /></ErrorBoundary>
          } />
          <Route path="/driver-booking/:id"     element={
            <ErrorBoundary><DriverBooking /></ErrorBoundary>
          } />
          <Route path="/driver-employment/:id"  element={
            <ErrorBoundary><DriverEmployment /></ErrorBoundary>
          } />
          <Route path="/activity-booking/:id"   element={
            <ErrorBoundary><ActivityBooking /></ErrorBoundary>
          } />
          {/* ── Paiement (redirection fournisseur ou mode sandbox) ─── */}
          <Route path="/payment/simulate/:paymentId" element={<PaymentSimulate />} />
          <Route path="/payment/success"        element={<PaymentResult />} />
          <Route path="/payment/cancel"         element={<PaymentResult />} />

          {/* ── Espace client connecté ─────────────────────── */}
          <Route path="/dashboard"              element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="/favorites"              element={<ErrorBoundary><Favorites /></ErrorBoundary>} />
          <Route path="/profile"                element={<ErrorBoundary><Profile /></ErrorBoundary>} />
          <Route path="/loyalty"                element={<ErrorBoundary><Loyalty /></ErrorBoundary>} />
          <Route path="/kyc"                    element={<ErrorBoundary><KYC /></ErrorBoundary>} />
          <Route path="/contract/:bookingId"    element={<ErrorBoundary><ContractPage /></ErrorBoundary>} />

          {/* ── Espace partenaire (PartnerRoute = auth + rôle partenaire/admin) ── */}
          <Route path="/vendor"           element={<PartnerRoute><ErrorBoundary><VendorSubmit /></ErrorBoundary></PartnerRoute>} />
          <Route path="/vendor/submit-activity" element={<PartnerRoute><ErrorBoundary><ActivitySubmit /></ErrorBoundary></PartnerRoute>} />
          <Route path="/vendor/dashboard" element={<PartnerRoute><ErrorBoundary><VendorDashboard /></ErrorBoundary></PartnerRoute>} />
          <Route path="/vendor/publish"   element={<PartnerRoute><ErrorBoundary><VendorPublish /></ErrorBoundary></PartnerRoute>} />
          <Route path="/importer-apply"   element={<PartnerRoute><ErrorBoundary><ImporterApply /></ErrorBoundary></PartnerRoute>} />
          <Route path="/importer-dashboard" element={<PartnerRoute><ErrorBoundary><ImporterDashboard /></ErrorBoundary></PartnerRoute>} />
          <Route path="/partner-certification" element={<PartnerRoute><ErrorBoundary><PartnerCertification /></ErrorBoundary></PartnerRoute>} />
          <Route path="/partner-pms"      element={<PartnerRoute><ErrorBoundary><PartnerPMSDashboard /></ErrorBoundary></PartnerRoute>} />
          <Route path="/partner-fleet-import" element={<PartnerRoute><ErrorBoundary><PartnerFleetImport /></ErrorBoundary></PartnerRoute>} />

          {/* ── Showroom public (accessible sans compte) ─────────── */}
          <Route path="/showroom/:id"     element={<PartnerShowroomPublic />} />

          {/* ── Onboarding Founding Partner (public + auth-aware) ── */}
          <Route path="/partner-onboarding" element={<PartnerOnboardingPortal />} />
          <Route path="/founding-partner-legal" element={<FoundingPartnerLegal />} />

          {/* ── Signature par lien sécurisé (email link — sans connexion) ── */}
          <Route path="/sign/:token" element={<PartnerSignByToken />} />
          <Route path="/quote/:token" element={<QuotePublicView />} />

          {/* ── Espace admin ────────────────────────────────── */}
          <Route path="/admin"  element={<AdminRoute><ErrorBoundary><AdminPanel /></ErrorBoundary></AdminRoute>} />
          <Route path="/stats"  element={<AdminRoute><ErrorBoundary><DashboardStats /></ErrorBoundary></AdminRoute>} />

          {/* ── 404 ─────────────────────────────────────────── */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}

// ── Composant racine ────────────────────────────────────────────────────────
function App() {
  // Bug réel corrigé (audit design) : l'écran de démarrage (3,5s, non
  // interruptible) s'affichait à CHAQUE chargement de page, pas seulement à
  // la première visite — aucun sessionStorage/localStorage ne le désactivait
  // ensuite. Un visiteur qui recharge, arrive via un lien direct (WhatsApp,
  // pub, résultat de recherche) ou revient sur un onglet se retapait la
  // même animation à chaque fois. Affiché une seule fois par session de
  // navigation désormais (sessionStorage, effacé à la fermeture de l'onglet).
  const [splashDone, setSplashDone] = useState(() => {
    try { return sessionStorage.getItem("vit_splash_shown") === "1"; } catch { return false; }
  });
  const handleSplashDone = () => {
    try { sessionStorage.setItem("vit_splash_shown", "1"); } catch { /* ignore */ }
    setSplashDone(true);
  };

  // launchAutoHide=false dans capacitor.config.json : le splash natif reste
  // affiché jusqu'à ce que ce composant JS ait pris le relais visuellement,
  // pour éviter un flash blanc entre le splash natif et le splash React.
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      NativeSplashScreen.hide();
    }
  }, []);

  return (
    <>
      {!splashDone && <SplashScreen onDone={handleSplashDone} />}
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <SocketProvider>
              <NotificationProvider>
                <ChatProvider>
                  <I18nProvider>
                    <CurrencyProvider>
                      <LocationProvider>
                        <VehicleProvider>
                          <FavoritesProvider>
                            <CartProvider>
                              <AppRoutes />
                              <ToastContainer />
                              <UpdateBanner />
                              <Chat />
                            </CartProvider>
                          </FavoritesProvider>
                        </VehicleProvider>
                      </LocationProvider>
                    </CurrencyProvider>
                  </I18nProvider>
                </ChatProvider>
              </NotificationProvider>
            </SocketProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </>
  );
}

export default App;
