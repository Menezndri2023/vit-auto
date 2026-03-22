import React from "react";
import HeroSection from "../components/HeroSection/HeroSection";
import WhySection from "../components/WhySection/WhySection";
import LocationSearch from "../components/LocationSearch/LocationSearch";
import VehicleList from "../components/VehicleList/VehicleList";
import Testimonials from "../components/Testimonials/Testimonials";
import RouteCTA from "../components/RouteCTA/RouteCTA";
import VendorCallout from "../components/VendorCallout/VendorCallout";
import TrustSection from "../components/TrustSection/TrustSection";

const Home = () => {
  return (
    <>
      <HeroSection />
      <WhySection />
      <VendorCallout />
      <TrustSection />
      <LocationSearch />
      <VehicleList />
      <Testimonials />
      <RouteCTA />
    </>
  );
};

export default Home;