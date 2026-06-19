import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./Booking.module.css";

const fmt = (n) => Number(n || 0).toLocaleString("fr-FR") + " DH";

const METHOD_LABELS = {
  orange_money: "Orange Money",
  wave:         "Wave",
  mtn:          "MTN Mobile Money",
  moov:         "Moov Money",
  card:         "Carte bancaire",
  paypal:       "PayPal",
  cash:         "Espèces à la livraison",
};

const Checkout = () => {
  const { state }   = useLocation();
  const navigate    = useNavigate();
  const { token }   = useAuth();
  const { success, error } = useToast();

  const [loading,       setLoading]       = useState(false);
  const [selectedMethod, setSelectedMethod] = useState("orange_money");
  const [mobileNumber,  setMobileNumber]  = useState("");
  const [cardNumber,    setCardNumber]    = useState("");
  const [cardHolder,    setCardHolder]    = useState("");

  useEffect(() => {
    if (!state?.booking) navigate("/catalogue", { replace: true });
  }, [state, navigate]);

  if (!state?.booking) return null;

  const { booking, payment: paymentInfo } = state;
  const amount = paymentInfo?.amount || booking?.total || booking?.montantTotal || 0;
  const method = paymentInfo?.paymentMethod || selectedMethod;

  const handlePay = async () => {
    setLoading(true);
    try {
      const isMobile = ["orange_money", "wave", "mtn", "moov"].includes(selectedMethod);
      const isCard   = selectedMethod === "card";

      if (isMobile && !mobileNumber.trim()) {
        error("Veuillez saisir votre numéro de téléphone mobile.");
        setLoading(false);
        return;
      }
      if (isCard && (!cardNumber.trim() || !cardHolder.trim())) {
        error("Veuillez remplir les informations de carte.");
        setLoading(false);
        return;
      }

      const payload = {
        booking:        booking._id || booking.id,
        amount,
        method:         selectedMethod,
        mobileNumber:   isMobile ? mobileNumber : undefined,
        cardNumber:     isCard   ? cardNumber    : undefined,
        cardHolder:     isCard   ? cardHolder    : undefined,
      };

      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res  = await fetch("/api/payments", {
        method:  "POST",
        headers,
        body:    JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Erreur paiement.");

      success("Paiement enregistré avec succès !");
      navigate("/booking/success", {
        state: { ...state, payment: { ...paymentInfo, method: selectedMethod, paymentId: data.payment?._id } },
      });
    } catch (err) {
      error(err.message || "Erreur lors du paiement.");
    } finally {
      setLoading(false);
    }
  };

  const isMobile = ["orange_money", "wave", "mtn", "moov"].includes(selectedMethod);
  const isCard   = selectedMethod === "card";

  return (
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 560, margin: "40px auto" }}>
        <h1 style={{ textAlign: "center", color: "#0f1b3f", marginBottom: 8 }}>💳 Paiement sécurisé</h1>
        <p style={{ textAlign: "center", color: "#64748b", marginBottom: 32 }}>
          Commande pour <strong>{booking.vehicleName || booking.title || "votre véhicule"}</strong>
        </p>

        {/* Récapitulatif */}
        <div style={{ background: "#f8fafc", borderRadius: 14, padding: "20px 24px", marginBottom: 24, border: "1.5px solid #e5e9f4" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: "#64748b" }}>Montant total</span>
            <strong style={{ color: "#0f1b3f", fontSize: "1.1rem" }}>{fmt(amount)}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#64748b" }}>Client</span>
            <span style={{ color: "#374151" }}>{booking.firstName || booking.clientInfo?.firstName} {booking.lastName || booking.clientInfo?.lastName}</span>
          </div>
        </div>

        {/* Choix du mode de paiement */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontWeight: 700, color: "#374151", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 10 }}>
            Mode de paiement
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {Object.entries(METHOD_LABELS).map(([val, label]) => (
              <label key={val} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "12px 16px", borderRadius: 12, cursor: "pointer",
                border: `1.5px solid ${selectedMethod === val ? "#ff4d2d" : "#e5e9f4"}`,
                background: selectedMethod === val ? "#fff5f3" : "#fff",
                fontWeight: selectedMethod === val ? 700 : 400,
                color: selectedMethod === val ? "#ff4d2d" : "#374151",
                transition: "all 0.2s",
              }}>
                <input type="radio" name="method" value={val} checked={selectedMethod === val}
                  onChange={() => setSelectedMethod(val)} style={{ accentColor: "#ff4d2d" }} />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Champs dynamiques */}
        {isMobile && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontWeight: 700, color: "#374151", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
              Numéro Mobile Money
            </label>
            <input type="tel" placeholder="Ex: +225 07 00 00 00 00" value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1.5px solid #e5e9f4", fontSize: "0.95rem", boxSizing: "border-box" }} />
          </div>
        )}

        {isCard && (
          <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontWeight: 700, color: "#374151", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
                Numéro de carte
              </label>
              <input type="text" placeholder="1234 5678 9012 3456" maxLength={19} value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1.5px solid #e5e9f4", fontSize: "0.95rem", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontWeight: 700, color: "#374151", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
                Titulaire de la carte
              </label>
              <input type="text" placeholder="NOM PRÉNOM" value={cardHolder}
                onChange={(e) => setCardHolder(e.target.value)}
                style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1.5px solid #e5e9f4", fontSize: "0.95rem", boxSizing: "border-box" }} />
            </div>
          </div>
        )}

        {selectedMethod === "cash" && (
          <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 12, padding: "14px 16px", marginBottom: 20, color: "#166534", fontSize: "0.9rem" }}>
            💵 Le paiement en espèces se fait directement à la livraison du véhicule.
          </div>
        )}

        <button onClick={handlePay} disabled={loading}
          style={{
            width: "100%", padding: "15px", borderRadius: 14, border: "none", cursor: loading ? "not-allowed" : "pointer",
            background: loading ? "#94a3b8" : "linear-gradient(135deg, #ff4d2d, #e03519)",
            color: "#fff", fontWeight: 800, fontSize: "1rem",
            boxShadow: loading ? "none" : "0 6px 20px rgba(255,77,45,0.38)",
            transition: "all 0.25s",
          }}>
          {loading ? "Traitement en cours…" : `Payer ${fmt(amount)}`}
        </button>
      </div>
    </div>
  );
};

export default Checkout;
