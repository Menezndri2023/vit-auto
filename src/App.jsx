import { BrowserRouter, Routes, Route } from "react-router-dom";
import { VehicleProvider } from "./context/VehicleContext";
import Layout from "./components/Layout/Layout";
import Home from "./pages/Home";
import Catalogue from "./pages/Catalogue";
import VehicleDetails from "./pages/VehicleDetails";
import Booking from "./pages/Booking";
import BookingSuccess from "./pages/BookingSuccess";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

function App() {
  return (
    <BrowserRouter>
      <VehicleProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/catalogue" element={<Catalogue />} />
            <Route path="/vehicle/:id" element={<VehicleDetails />} />
            <Route path="/booking/:id" element={<Booking />} />
            <Route path="/booking/success" element={<BookingSuccess />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </VehicleProvider>
    </BrowserRouter>
  );
}

export default App;