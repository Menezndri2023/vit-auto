import { BrowserRouter, Routes, Route } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import PartnerRoute from "./components/PartnerRoute";
import AdminRoute from "./components/AdminRoute";
import { Suspense, lazy } from "react";
import { VehicleProvider } from "./context/VehicleContext";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { LocationProvider } from "./context/LocationContext";
import { NotificationProvider } from "./context/NotificationContext";
import Layout from "./components/Layout/Layout";
import ToastContainer from "./components/Toast/Toast";
import Loading from "./components/Loading/Loading";

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
const Plans = lazy(() => import("./pages/Plans"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const DashboardStats = lazy(() => import("./pages/DashboardStats"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Services    = lazy(() => import("./pages/Services"));
const Help        = lazy(() => import("./pages/Help"));
const ContractPage = lazy(() => import("./pages/ContractPage"));
const NotFound    = lazy(() => import("./pages/NotFound"));

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <NotificationProvider>
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
                    <Route path="/plans" element={<PartnerRoute><Plans /></PartnerRoute>} />
                    <Route path="/admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
                    <Route path="/stats"    element={<DashboardStats />} />
                    <Route path="/services" element={<Services />} />
                    <Route path="/help"     element={<Help />} />
                    <Route path="/contract/:bookingId" element={<ContractPage />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </Layout>
              <ToastContainer />
            </VehicleProvider>
          </LocationProvider>
          </NotificationProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
