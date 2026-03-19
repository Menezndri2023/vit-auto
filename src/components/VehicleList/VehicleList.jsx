import React from "react";
import VehicleCard from "../VehicleCard/VehicleCard";
import styles from "../VehicleList/VehicleList.module.css";

const cars = [
  {
    name: "BMW X5",
    price: 45000,
    image: "https://images.unsplash.com/photo-1555215695-3004980ad54c"
  },
  {
    name: "Audi A6",
    price: 40000,
    image: "https://images.unsplash.com/photo-1549924231-f129b911e442"
  },
  {
    name: "Mercedes C300",
    price: 42000,
    image: "https://images.unsplash.com/photo-1617814076367-b759c7d7e738"
  }
];

const VehicleList = () => {
  return (
    <div className={styles.container}>
      <h2>Véhicules disponibles</h2>
      <div className={styles.grid}>
        {cars.map((car, index) => (
          <VehicleCard key={index} car={car} />
        ))}
      </div>
    </div>
  );
};

export default VehicleList;