import { BrowserRouter, Routes, Route } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { Suspense, lazy } from "react";
import { VehicleProvider } from "./context/VehicleContext";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { LocationProvider } from "./context/LocationContext";
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
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const DashboardStats = lazy(() => import("./pages/DashboardStats"));
const Checkout = lazy(() => import("./pages/Checkout"));
const NotFound = lazy(() => import("./pages/NotFound"));

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
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
                    <Route path="/vendor" element={<VendorSubmit />} />
                    <Route path="/vendor/dashboard" element={<VendorDashboard />} />
                    <Route path="/admin" element={<AdminPanel />} />
                    <Route path="/stats" element={<DashboardStats />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </Layout>
              <ToastContainer />
            </VehicleProvider>
          </LocationProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
