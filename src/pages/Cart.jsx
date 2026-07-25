import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useCurrency } from "../context/CurrencyContext";
import { useToast } from "../context/ToastContext";
import styles from "./Cart.module.css";

// Réservation "panier" — plusieurs véhicules réservés en une fois, retrait
// uniquement, sans options ni financement (voir bookingController
// .createBookingsBatch). Un client qui a besoin de ces réglages fins repasse
// par le parcours détaillé /booking/:id véhicule par véhicule.
export default function Cart() {
  const { isAuthenticated, authFetch } = useAuth();
  const { items, removeItem, updateItemDates, clear } = useCart();
  const { fmt } = useCurrency();
  const { error: toastError } = useToast();
  const navigate = useNavigate();

  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null); // [{ vehicleId, ok, message, title }]

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: { pathname: "/cart" } }} replace />;
  }

  const days = (it) => {
    if (!it.startDate || !it.endDate) return 0;
    const d = Math.round((new Date(it.endDate) - new Date(it.startDate)) / 86400000);
    return d > 0 ? d : 0;
  };
  const estimate = (it) => days(it) * (it.pricePerDay || 0);
  const totalEstimate = items.reduce((s, it) => s + estimate(it), 0);
  const allDatesFilled = items.length > 0 && items.every((it) => days(it) > 0);

  const handleSubmit = async () => {
    if (!allDatesFilled || submitting) return;
    setSubmitting(true);
    setResults(null);
    try {
      const res = await authFetch("/api/bookings/batch", {
        method: "POST",
        body: JSON.stringify({
          items: items.map((it) => ({ vehicleId: it.vehicleId, startDate: it.startDate, endDate: it.endDate })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError(d.message || "Impossible de traiter le panier.");
        return;
      }
      setResults(d.results || []);
      // On retire du panier uniquement les véhicules effectivement réservés —
      // ceux en échec (conflit de dates, etc.) restent pour permettre au
      // client de corriger et réessayer.
      const okIds = (d.results || []).filter((r) => r.ok).map((r) => r.vehicleId);
      okIds.forEach((id) => removeItem(id));
    } catch {
      toastError("Erreur réseau.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>🛒 Mon panier</h1>
        <p>Réservez plusieurs véhicules en une seule fois — retrait à l'agence, sans options additionnelles.</p>
      </div>

      {results && (
        <div className={styles.results}>
          {results.map((r) => (
            <div key={r.vehicleId} className={`${styles.resultRow} ${r.ok ? styles.resultOk : styles.resultFail}`}>
              {r.ok ? "✅" : "❌"} <strong>{r.title || r.vehicleId}</strong> — {r.ok ? `Réservé (${r.booking?.reference || ""})` : r.message}
            </div>
          ))}
          <div className={styles.resultActions}>
            <Link to="/dashboard" className={styles.cta}>Voir mes réservations →</Link>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🛒</div>
          <p>Votre panier est vide.</p>
          <Link to="/catalogue" className={styles.cta}>Explorer le catalogue →</Link>
        </div>
      ) : (
        <>
          <div className={styles.list}>
            {items.map((it) => (
              <div key={it.vehicleId} className={styles.item}>
                {it.image
                  ? <img src={it.image} alt={it.title} className={styles.itemImg} />
                  : <div className={styles.itemImgPlaceholder}>🚗</div>}
                <div className={styles.itemBody}>
                  <div className={styles.itemTitleRow}>
                    <span className={styles.itemTitle}>{it.title}</span>
                    <button type="button" className={styles.removeBtn} onClick={() => removeItem(it.vehicleId)} aria-label="Retirer du panier">✕</button>
                  </div>
                  {it.ville && <span className={styles.itemVille}>📍 {it.ville}</span>}
                  <div className={styles.itemDates}>
                    <label>
                      Début
                      <input type="date" value={it.startDate} onChange={(e) => updateItemDates(it.vehicleId, { startDate: e.target.value })} />
                    </label>
                    <label>
                      Fin
                      <input type="date" value={it.endDate} onChange={(e) => updateItemDates(it.vehicleId, { endDate: e.target.value })} />
                    </label>
                  </div>
                  <div className={styles.itemPrice}>
                    {days(it) > 0
                      ? <span>{days(it)} jour{days(it) > 1 ? "s" : ""} — <strong>{fmt(estimate(it))}</strong> (indicatif)</span>
                      : <span className={styles.itemPriceMissing}>Choisissez les dates</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.summary}>
            <div>
              <span className={styles.summaryLabel}>Total estimatif</span>
              <span className={styles.summaryValue}>{fmt(totalEstimate)}</span>
              <span className={styles.summaryNote}>Le montant définitif est toujours recalculé et confirmé par chaque partenaire.</span>
            </div>
            <div className={styles.summaryActions}>
              <button type="button" className={styles.secondaryBtn} onClick={clear} disabled={submitting}>Vider le panier</button>
              <button type="button" className={styles.primaryBtn} onClick={handleSubmit} disabled={!allDatesFilled || submitting}>
                {submitting ? "Réservation en cours…" : `Réserver ${items.length} véhicule${items.length > 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
