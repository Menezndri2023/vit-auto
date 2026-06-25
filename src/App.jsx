import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy, useState } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import PartnerRoute from "./components/PartnerRoute";
import AdminRoute from "./components/AdminRoute";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ChatProvider } from "./context/ChatContext";
import { I18nProvider } from "./context/I18nContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { LocationProvider } from "./context/LocationContext";
import { VehicleProvider } from "./context/VehicleContext";
import Layout from "./components/Layout/Layout";
import ToastContainer from "./components/Toast/Toast";
import Chat from "./components/Chat/Chat";
import SplashScreen from "./components/SplashScreen/SplashScreen";
import { SocketProvider } from "./context/SocketContext";

// ── Lazy loading des pages ─────────────────────────────────────────────────
const Home                  = lazy(() => import("./pages/Home"));
const Catalogue             = lazy(() => import("./pages/Catalogue"));
const VehicleDetails        = lazy(() => import("./pages/VehicleDetails"));
const Booking               = lazy(() => import("./pages/Booking"));
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
const Checkout              = lazy(() => import("./pages/Checkout"));
const Services              = lazy(() => import("./pages/Services"));
const Help                  = lazy(() => import("./pages/Help"));
const ContractPage          = lazy(() => import("./pages/ContractPage"));
const Privacy               = lazy(() => import("./pages/Privacy"));
const FAQ                   = lazy(() => import("./pages/FAQ"));
const CGU                   = lazy(() => import("./pages/CGU"));
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
const ImporterApply         = lazy(() => import("./pages/ImporterApply"));
const ImporterDashboard     = lazy(() => import("./pages/ImporterDashboard"));
const KYC                   = lazy(() => import("./pages/KYC"));

// ── Routes internes — accès à authReady pour éviter le flash ──────────────
function AppRoutes() {
  const { authReady } = useAuth();

  // Attendre que la validation du token soit terminée avant d'afficher quoi que ce soit
  if (!authReady) return <SplashScreen persistent />;

  return (
    <Layout>
      <Suspense fallback={<SplashScreen persistent />}>
        <Routes>
          {/* ── Pages publiques ─────────────────────────────── */}
          <Route path="/"                       element={<Home />} />
          <Route path="/catalogue"              element={<Catalogue />} />
          <Route path="/vehicle/:id"            element={<VehicleDetails />} />
          <Route path="/login"                  element={<Login />} />
          <Route path="/register"               element={<Register />} />
          <Route path="/verify-email"           element={<VerifyEmail />} />
          <Route path="/forgot-password"        element={<ForgotPassword />} />
          <Route path="/reset-password"         element={<ResetPassword />} />

          {/* ── Pages d'information ────────────────────────── */}
          <Route path="/services"               element={<Services />} />
          <Route path="/help"                   element={<Help />} />
          <Route path="/plans"                  element={<Plans />} />
          <Route path="/partenaires"            element={<Partenaires />} />
          <Route path="/pourquoi"               element={<PourquoiVitAuto />} />
          <Route path="/partner/:id"            element={<PartnerProfile />} />
          <Route path="/import-export"          element={<ImportExport />} />
          <Route path="/import-export/listings" element={<IEListings />} />

          {/* ── Pages légales ──────────────────────────────── */}
          <Route path="/privacy"                element={<Privacy />} />
          <Route path="/faq"                    element={<FAQ />} />
          <Route path="/cgu"                    element={<CGU />} />
          <Route path="/mentions-legales"       element={<MentionsLegales />} />
          <Route path="/conditions-partenaires" element={<ConditionsPartenaires />} />

          {/* ── Réservation (auth optionnelle, KYC gate interne) ── */}
          <Route path="/booking/success"        element={<BookingSuccess />} />
          <Route path="/booking/:id"            element={
            <ErrorBoundary><Booking /></ErrorBoundary>
          } />
          <Route path="/checkout"               element={<Checkout />} />

          {/* ── Espace client connecté ─────────────────────── */}
          <Route path="/dashboard"              element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="/profile"                element={<ErrorBoundary><Profile /></ErrorBoundary>} />
          <Route path="/kyc"                    element={<KYC />} />
          <Route path="/contract/:bookingId"    element={<ContractPage />} />

          {/* ── Espace partenaire (PartnerRoute = auth + rôle partenaire/admin) ── */}
          <Route path="/vendor"           element={<PartnerRoute><VendorSubmit /></PartnerRoute>} />
          <Route path="/vendor/dashboard" element={<PartnerRoute><ErrorBoundary><VendorDashboard /></ErrorBoundary></PartnerRoute>} />
          <Route path="/vendor/publish"   element={<PartnerRoute><VendorPublish /></PartnerRoute>} />
          <Route path="/importer-apply"   element={<PartnerRoute><ImporterApply /></PartnerRoute>} />
          <Route path="/importer-dashboard" element={<PartnerRoute><ImporterDashboard /></PartnerRoute>} />

          {/* ── Espace admin ────────────────────────────────── */}
          <Route path="/admin"  element={<AdminRoute><ErrorBoundary><AdminPanel /></ErrorBoundary></AdminRoute>} />
          <Route path="/stats"  element={<AdminRoute><DashboardStats /></AdminRoute>} />

          {/* ── 404 ─────────────────────────────────────────── */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

// ── Composant racine ────────────────────────────────────────────────────────
function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
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
                          <AppRoutes />
                          <ToastContainer />
                          <Chat />
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
