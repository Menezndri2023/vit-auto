import HeroSection    from "../components/HeroSection/HeroSection";
import VehicleList    from "../components/VehicleList/VehicleList";
import WhySection     from "../components/WhySection/WhySection";
import TrustSection   from "../components/TrustSection/TrustSection";
import VendorCallout  from "../components/VendorCallout/VendorCallout";
import Testimonials   from "../components/Testimonials/Testimonials";
import RouteCTA       from "../components/RouteCTA/RouteCTA";
import AdBanner       from "../components/AdBanner/AdBanner";

/**
 * Ordre :
 * 1. Hero + barre de recherche
 * 2. Véhicules en vedette
 * 3. Pourquoi VIT AUTO (avantages)
 * 4. Bannière publicitaire admin (invisible si aucune campagne active)
 * 5. Sécurité & Confiance
 * 6. Bannière partenaire (visible pour tous sauf partenaires déjà inscrits)
 * 7. Témoignages clients
 * 8. CTA final
 */
const Home = () => (
  <>
    <HeroSection />
    <VehicleList />
    <WhySection />
    <AdBanner position="featured_section" />
    <TrustSection />
    <VendorCallout />
    <Testimonials />
    <RouteCTA />
  </>
);

export default Home;
