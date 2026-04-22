import HeroSection    from "../components/HeroSection/HeroSection";
import VehicleList    from "../components/VehicleList/VehicleList";
import WhySection     from "../components/WhySection/WhySection";
import TrustSection   from "../components/TrustSection/TrustSection";
import VendorCallout  from "../components/VendorCallout/VendorCallout";
import Testimonials   from "../components/Testimonials/Testimonials";
import RouteCTA       from "../components/RouteCTA/RouteCTA";

/**
 * Ordre :
 * 1. Hero + barre de recherche
 * 2. Véhicules en vedette
 * 3. Pourquoi VIT AUTO (avantages)
 * 4. Sécurité & Confiance
 * 5. Bannière partenaire (visible pour tous sauf partenaires déjà inscrits)
 * 6. Témoignages clients
 * 7. CTA final
 */
const Home = () => (
  <>
    <HeroSection />
    <VehicleList />
    <WhySection />
    <TrustSection />
    <VendorCallout />
    <Testimonials />
    <RouteCTA />
  </>
);

export default Home;
