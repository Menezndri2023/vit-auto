import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import styles from "./Booking.module.css";

const Checkout = () => {
  const { state } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!state?.booking) {
      navigate("/catalogue", { replace: true });
    }
  }, [state, navigate]);

  if (!state?.booking) return null;

  return (
    <div className={styles.page}>
      <h1>Paiement sécurisé</h1>
      <p>Nous avons reçu votre demande de paiement pour <strong>{state.booking.vehicleName}</strong>.</p>
      <p>Montant : <strong>{state.payment?.amount || state.booking.total || 0} €</strong>.</p>
      <p>Mode de paiement : <strong>{state.payment?.paymentMethod || "N/A"}</strong>.</p>
      <p>La confirmation est envoyée à : <strong>{state.booking.email}</strong>.</p>
      <button className={styles.primaryBtn} onClick={() => navigate("/booking/success", { state })}>Terminer</button>
    </div>
  );
};

export default Checkout;
