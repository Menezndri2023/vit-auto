import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useVehicles } from "../context/VehicleContext";

const Booking = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getVehicleById, addBooking } = useVehicles();
  const vehicle = getVehicleById(id);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    startDate: "",
    endDate: ""
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const booking = {
      id: Date.now(),
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      ...form
    };

    addBooking(booking);
    navigate("/booking/success", { state: { booking } });
  };

  if (!vehicle) {
    return <div style={{ padding: "40px" }}>Véhicule non trouvé</div>;
  }

  return (
    <div style={{ padding: "40px" }}>
      <h1>Réservation - {vehicle.name}</h1>
      <img
        src={vehicle.image}
        alt={vehicle.name}
        style={{ width: "100%", maxWidth: "480px", height: "auto", marginBottom: "20px" }}
      />

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "420px" }}
      >
        <input
          type="text"
          name="name"
          placeholder="Nom complet"
          value={form.name}
          onChange={handleChange}
          required
        />
        <input
          type="email"
          name="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
          required
        />
        <input
          type="tel"
          name="phone"
          placeholder="Téléphone"
          value={form.phone}
          onChange={handleChange}
          required
        />
        <label>
          Date de début: <input type="date" name="startDate" value={form.startDate} onChange={handleChange} required />
        </label>
        <label>
          Date de fin: <input type="date" name="endDate" value={form.endDate} onChange={handleChange} required />
        </label>
        <button type="submit">Confirmer la réservation</button>
      </form>
    </div>
  );
};

export default Booking;