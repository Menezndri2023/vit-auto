import HeroSection    from "../components/HeroSection/HeroSection";
import VehicleList    from "../components/VehicleList/VehicleList";
import SpotlightRow   from "../components/SpotlightRow/SpotlightRow";
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
 * 2 bis. Activités et loisirs mis en avant, puis partenaires — composés par le
 *    moteur de mise en avant (server/services/spotlightEngine.js) : épinglage
 *    admin facultatif, boosts achetés, places d'abonnement, puis mérite. Ces
 *    deux bandes RESTENT INVISIBLES tant qu'il n'y a pas assez de contenu — à
 *    ce jour aucune activité n'est publiée, la section n'apparaîtra donc que
 *    lorsqu'il y en aura.
 * 3. Pourquoi VIT AUTO (avantages)
 * 4. Bannière publicitaire admin (invisible si aucune campagne active)
 * 5. Sécurité & Confiance
 * 6. Bannière partenaire (visible pour tous sauf partenaires déjà inscrits)
 * 7. Avis clients — RÉELS et modérés ; la section ne s'affiche pas tant qu'il
 *    n'y en a pas assez (voir Testimonials.jsx, qui remplaçait quatre
 *    témoignages fabriqués)
 * 8. CTA final
 *
 * Les données structurées schema.org de cette page vivent dans index.html, en
 * statique : c'est la seule version que les robots lisent sans exécuter le
 * JavaScript, et deux blocs concurrents se contrediraient.
 */
const Home = () => (
  <>
    <HeroSection />
    <VehicleList />
    {/* `minimum={2}` et non le défaut de 3 : le moteur plafonne chaque
        partenaire à deux entrées, or les loisirs ne comptent aujourd'hui qu'un
        seul partenaire. Au seuil de 3, la rubrique serait restée invisible
        quel que soit le nombre d'activités publiées. */}
    <SpotlightRow
      emplacement="loisirs"
      minimum={2}
      titre="Activités et loisirs"
      sousTitre="Plongée, quad, jetski — à faire près de chez vous."
      lienTout="/catalogue?mode=Autres"
      libelleTout="Toutes les activités"
    />
    <SpotlightRow
      emplacement="partenaires"
      titre="Partenaires à la une"
      sousTitre="Les professionnels les plus actifs sur VIT AUTO."
    />
    <WhySection />
    <AdBanner position="featured_section" />
    <TrustSection />
    <VendorCallout />
    <Testimonials />
    <RouteCTA />
  </>
);

export default Home;
