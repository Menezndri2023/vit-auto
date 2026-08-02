import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";

const METHOD_LABELS = { card: "Carte bancaire", orange_money: "Orange Money", wave: "Wave" };

/**
 * Page de paiement "sandbox" — affichée uniquement quand aucun fournisseur
 * réel (Stripe/Orange Money/Wave) n'est configuré côté serveur (voir
 * server/services/payment/gateway.js). Permet de tester tout le parcours
 * réservation → paiement → confirmation dès maintenant ; une fois un vrai
 * compte marchand branché, le client est redirigé vers la vraie page de
 * paiement du fournisseur à la place, sans aucun changement de code ici.
 */
export default function PaymentSimulate() {
  const { paymentId } = useParams();
  const navigate = useNavigate();
  const { fmt } = useCurrency();
  const { token } = useAuth();
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/payments/${paymentId}/status`);
        const data = await res.json();
        if (!cancelled) {
          if (res.ok) setPayment(data.payment);
          else setError(data.message || "Paiement introuvable.");
        }
      } catch {
        if (!cancelled) setError("Impossible de contacter le serveur.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [paymentId]);

  const handleOutcome = useCallback(async (outcome) => {
    if (acting) return;
    setActing(true);
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      await fetch(`/api/payments/${paymentId}/simulate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ outcome }),
      });
    } catch { /* la page de résultat re-vérifiera le statut */ }
    navigate(outcome === "success" ? `/payment/success?paymentId=${paymentId}` : `/payment/cancel?paymentId=${paymentId}`);
  }, [paymentId, navigate, token, acting]);

  if (loading) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#64748b" }}>Chargement…</p>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>⚠️</div>
        <p style={{ color: "#64748b" }}>{error || "Paiement introuvable."}</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem" }}>
      <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 16, padding: "32px 28px", maxWidth: 420, width: "100%", textAlign: "center", boxShadow: "0 8px 30px rgba(15,27,63,0.08)" }}>
        <div style={{ display: "inline-block", background: "#fffbeb", color: "#b45309", fontSize: "0.72rem", fontWeight: 800, padding: "4px 12px", borderRadius: 999, marginBottom: 16, textTransform: "uppercase", letterSpacing: 0.4 }}>
          Mode sandbox — aucun paiement réel
        </div>
        <h1 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 6px" }}>
          Paiement {METHOD_LABELS[payment.method] || payment.method}
        </h1>
        <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0 0 20px" }}>
          Aucun compte marchand n'est encore configuré pour cette méthode — simulez l'issue du paiement pour continuer le test.
        </p>
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0f1b3f" }}>{fmt(payment.amount)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => handleOutcome("success")}
            disabled={acting}
            style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: 10, padding: "13px 20px", fontWeight: 800, fontSize: "0.9rem", cursor: acting ? "not-allowed" : "pointer", opacity: acting ? 0.7 : 1 }}
          >
            ✅ Simuler un paiement réussi
          </button>
          <button
            onClick={() => handleOutcome("fail")}
            disabled={acting}
            style={{ background: "#fff", color: "#dc2626", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "13px 20px", fontWeight: 700, fontSize: "0.9rem", cursor: acting ? "not-allowed" : "pointer", opacity: acting ? 0.7 : 1 }}
          >
            ❌ Simuler un échec
          </button>
        </div>
      </div>
    </div>
  );
}
