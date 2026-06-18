import { BrowserRouter, Routes, Route } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import PartnerRoute from "./components/PartnerRoute";
import AdminRoute from "./components/AdminRoute";
import { Suspense, lazy } from "react";
import { VehicleProvider } from "./context/VehicleContext";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { LocationProvider } from "./context/LocationContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { I18nProvider } from "./context/I18nContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ChatProvider } from "./context/ChatContext";
import Layout from "./components/Layout/Layout";
import ToastContainer from "./components/Toast/Toast";
import Loading from "./components/Loading/Loading";
import Chat from "./components/Chat/Chat";

// Lazy load pages
const Home = lazy(() => import("./pages/Home"));
const Catalogue = lazy(() => import("./pages/Catalogue"));
const VehicleDetails = lazy(() => import("./pages/VehicleDetails"));
const Booking = lazy(() => import("./pages/Booking"));
const BookingSuccess = lazy(() => import("./pages/BookingSuccess"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Profile = lazy(() => import("./pages/Profile"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const VendorSubmit = lazy(() => import("./pages/VendorSubmit"));
const VendorDashboard = lazy(() => import("./pages/VendorDashboard"));
const VendorPublish   = lazy(() => import("./pages/VendorPublish"));
const Plans = lazy(() => import("./pages/Plans"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const DashboardStats = lazy(() => import("./pages/DashboardStats"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Services    = lazy(() => import("./pages/Services"));
const Help        = lazy(() => import("./pages/Help"));
const ContractPage = lazy(() => import("./pages/ContractPage"));
const Privacy       = lazy(() => import("./pages/Privacy"));
const FAQ           = lazy(() => import("./pages/FAQ"));
const CGU           = lazy(() => import("./pages/CGU"));
const PartnerProfile = lazy(() => import("./pages/PartnerProfile"));
const NotFound      = lazy(() => import("./pages/NotFound"));
const VerifyEmail     = lazy(() => import("./pages/VerifyEmail"));
const ForgotPassword  = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword   = lazy(() => import("./pages/ResetPassword"));

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <NotificationProvider>
            <ChatProvider>
              <I18nProvider>
              <CurrencyProvider>
              <LocationProvider>
                <VehicleProvider>
                  <Layout>
                    <Suspense fallback={<Loading />}>
                      <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/catalogue" element={<Catalogue />} />
                        <Route path="/vehicle/:id" element={<VehicleDetails />} />
                        <Route path="/booking/success" element={<BookingSuccess />} />
                        <Route path="/booking/:id" element={
                          <ErrorBoundary>
                            <Booking />
                          </ErrorBoundary>
                        } />
                        <Route path="/checkout" element={<Checkout />} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route path="/vendor" element={<PartnerRoute><VendorSubmit /></PartnerRoute>} />
                        <Route path="/vendor/dashboard" element={<PartnerRoute><VendorDashboard /></PartnerRoute>} />
                        <Route path="/vendor/publish"   element={<PartnerRoute><VendorPublish /></PartnerRoute>} />
                        <Route path="/plans" element={<PartnerRoute><Plans /></PartnerRoute>} />
                        <Route path="/admin" element={<AdminRoute><ErrorBoundary><AdminPanel /></ErrorBoundary></AdminRoute>} />
                        <Route path="/stats"    element={<DashboardStats />} />
                        <Route path="/services" element={<Services />} />
                        <Route path="/help"     element={<Help />} />
                        <Route path="/contract/:bookingId" element={<ContractPage />} />
                        <Route path="/privacy"       element={<Privacy />} />
                        <Route path="/faq"           element={<FAQ />} />
                        <Route path="/cgu"           element={<CGU />} />
                        <Route path="/partner/:id"   element={<PartnerProfile />} />
                        <Route path="/verify-email"    element={<VerifyEmail />} />
                        <Route path="/forgot-password" element={<ForgotPassword />} />
                        <Route path="/reset-password"  element={<ResetPassword />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
                  </Layout>
                  <ToastContainer />
                  <Chat />
                </VehicleProvider>
              </LocationProvider>
              </CurrencyProvider>
              </I18nProvider>
            </ChatProvider>
          </NotificationProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
