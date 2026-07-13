import { useState, useEffect } from "react";
import { useSearchParams, useLocation, Link } from "react-router-dom";
import { useCurrency } from "../context/CurrencyContext";

// Nombre de tentatives avant d'abandonner l'attente du webhook (le webhook du
// fournisseur peut arriver quelques instants après la redirection du client).
const MAX_POLLS = 6;
const POLL_INTERVAL_MS = 1500;

/**
 * Page de retour après un paiement (Stripe/Wave/Orange Money ou mode simulé) —
 * utilisée à la fois pour /payment/success et /payment/cancel. Interroge le
 * statut réel du paiement côté serveur (jamais confiance dans le simple fait
 * d'être arrivé sur cette URL, qui pourrait être visitée sans avoir payé).
 */
export default function PaymentResult() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { fmt } = useCurrency();
  const paymentId = searchParams.get("paymentId");
  const isCancelRoute = location.pathname.includes("cancel");

  const [payment, setPayment] = useState(null);
  const [polling, setPolling] = useState(!!paymentId);

  useEffect(() => {
    if (!paymentId) return;
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      try {
        const res = await fetch(`/api/payments/${paymentId}/status`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setPayment(data.payment);

        attempts += 1;
        if (data.payment?.status === "pending" && attempts < MAX_POLLS) {
          setTimeout(poll, POLL_INTERVAL_MS);
        } else {
          setPolling(false);
        }
      } catch {
        if (!cancelled) setPolling(false);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [paymentId]);

  const status = payment?.status;
  const isSuccess = status === "completed";
  const isFailed  = status === "failed" || isCancelRoute && status !== "completed";

  return (
    <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem" }}>
      <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 16, padding: "36px 28px", maxWidth: 440, width: "100%", textAlign: "center", boxShadow: "0 8px 30px rgba(15,27,63,0.08)" }}>
        {polling ? (
          <>
            <div style={{ width: 36, height: 36, border: "3px solid #e2e8f0", borderTopColor: "#2563eb", borderRadius: "50%", margin: "0 auto 18px", animation: "spin 0.8s linear infinite" }} />
            <p style={{ color: "#64748b", fontWeight: 600 }}>Vérification du paiement…</p>
          </>
        ) : isSuccess ? (
          <>
            <div style={{ fontSize: "2.8rem", marginBottom: 10 }}>✅</div>
            <h1 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 6px" }}>Paiement confirmé</h1>
            <p style={{ color: "#64748b", fontSize: "0.88rem", margin: "0 0 4px" }}>
              {payment?.amount != null && <>Montant réglé : <strong>{fmt(payment.amount)}</strong></>}
            </p>
            {payment?.simulated && (
              <p style={{ color: "#b45309", fontSize: "0.76rem", fontWeight: 700, marginTop: 8 }}>
                Mode sandbox — aucun montant réel n'a été débité.
              </p>
            )}
            <div style={{ marginTop: 24, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <Link to="/dashboard" style={{ background: "#ff4d2d", color: "#fff", padding: "11px 22px", borderRadius: 10, textDecoration: "none", fontWeight: 700, fontSize: "0.85rem" }}>
                Mon tableau de bord
              </Link>
              <Link to="/catalogue" style={{ background: "transparent", border: "1.5px solid #d1d9e8", color: "#0f1b3f", padding: "10px 20px", borderRadius: 10, textDecoration: "none", fontWeight: 600, fontSize: "0.85rem" }}>
                Explorer le catalogue
              </Link>
            </div>
          </>
        ) : isFailed ? (
          <>
            <div style={{ fontSize: "2.8rem", marginBottom: 10 }}>❌</div>
            <h1 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 6px" }}>Paiement non abouti</h1>
            <p style={{ color: "#64748b", fontSize: "0.88rem" }}>
              Le paiement a été annulé ou a échoué. Votre réservation reste enregistrée — vous pouvez réessayer depuis votre tableau de bord.
            </p>
            <div style={{ marginTop: 24 }}>
              <Link to="/dashboard" style={{ background: "#ff4d2d", color: "#fff", padding: "11px 22px", borderRadius: 10, textDecoration: "none", fontWeight: 700, fontSize: "0.85rem" }}>
                Mon tableau de bord
              </Link>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: "2.8rem", marginBottom: 10 }}>⏳</div>
            <h1 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0f1b3f", margin: "0 0 6px" }}>Paiement en cours de traitement</h1>
            <p style={{ color: "#64748b", fontSize: "0.88rem" }}>
              La confirmation prend un peu plus de temps que prévu — vous recevrez une notification dès qu'elle sera traitée.
            </p>
            <div style={{ marginTop: 24 }}>
              <Link to="/dashboard" style={{ background: "#ff4d2d", color: "#fff", padding: "11px 22px", borderRadius: 10, textDecoration: "none", fontWeight: 700, fontSize: "0.85rem" }}>
                Mon tableau de bord
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
