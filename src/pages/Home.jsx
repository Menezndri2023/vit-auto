import React from "react";
import HeroSection from "../components/HeroSection/HeroSection";
import SearchBar from "../components/SearchBar/SearchBar";
import Stats from "../components/Stats/Stats";
import VehicleList from "../components/VehicleList/VehicleList";
import Footer from "../components/Footer/Footer";

const Home = () => {
  return (
    <>
      <HeroSection />
      <SearchBar />
      <Stats />
      <VehicleList />
      <Footer />
    </>
  );
};

export default Home;