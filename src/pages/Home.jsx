import React from "react";
import HeroSection from "../components/HeroSection/HeroSection";
import WhySection from "../components/WhySection/WhySection";
import LocationSearch from "../components/LocationSearch/LocationSearch";
import VehicleList from "../components/VehicleList/VehicleList";
import Testimonials from "../components/Testimonials/Testimonials";
import RouteCTA from "../components/RouteCTA/RouteCTA";

const Home = () => {
  return (
    <>
      <HeroSection />
      <WhySection />
      <LocationSearch />
      <VehicleList />
      <Testimonials />
      <RouteCTA />
    </>
  );
};

export default Home;