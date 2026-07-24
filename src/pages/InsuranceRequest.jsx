import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import styles from "./InsuranceRequest.module.css";

const TYPE_OPTIONS = [
  { value: "auto",          label: "🚗 Assurance auto (véhicule personnel)" },
  { value: "location",      label: "🔑 Assurance location (véhicule loué)" },
  { value: "import_export", label: "🌍 Assurance import/export" },
];

const STATUS_LABELS = {
  pending:  { l: "🔍 En attente",  c: "#d97706", bg: "#fef3c7" },
  approved: { l: "✅ Approuvée",   c: "#10b981", bg: "#d1fae5" },
  rejected: { l: "❌ Refusée",     c: "#dc2626", bg: "#fee2e2" },
};

export default function InsuranceRequest() {
  const { isAuthenticated, token } = useAuth();
  const { fmtUSD } = useCurrency();
  const navigate = useNavigate();

  const [form, setForm] = useState({ type: "auto", vehicleInfo: "", coveragePeriodMonths: 12, notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState(null);
  const [payMethod, setPayMethod] = useState("card");
  const [payError, setPayError] = useState(null);
  const [paySubmitting, setPaySubmitting] = useState(false);

  const loadMine = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const r = await fetch("/api/insurance/mine", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setMyRequests((await r.json()).requests || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [token]);

  useEffect(() => { loadMine(); }, [loadMine]);

  // Paie une prime approuvée — même passerelle que Booking.jsx (Stripe/Orange
  // Money/Wave, voir server/controllers/paymentController.initiatePayment).
  const handlePayQuote = async (requestId) => {
    setPaySubmitting(true);
    setPayError(null);
    try {
      const r = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ insuranceRequestId: requestId, method: payMethod }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.checkoutUrl) { window.location.href = data.checkoutUrl; return; }
      setPayError(data.message || "Paiement indisponible pour le moment.");
    } catch {
      setPayError("Erreur réseau — réessayez plus tard.");
    } finally {
      setPaySubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) { navigate("/login", { state: { from: { pathname: "/insurance-request" } } }); return; }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/insurance", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.message || "Erreur lors de l'envoi."); return; }
      setForm({ type: "auto", vehicleInfo: "", coveragePeriodMonths: 12, notes: "" });
      loadMine();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>🔒 Demande d'assurance</h1>
        <p>Auto, location ou import/export — notre équipe étudie votre dossier et vous propose une prime adaptée.</p>
      </div>

      <div className={styles.grid}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <h2>Nouvelle demande</h2>
          <label>Type d'assurance</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <label>Véhicule concerné</label>
          <input
            placeholder="Ex : Toyota Corolla 2020, immatriculée..."
            value={form.vehicleInfo}
            onChange={(e) => setForm({ ...form, vehicleInfo: e.target.value })}
          />

          <label>Durée de couverture souhaitée</label>
          <select value={form.coveragePeriodMonths} onChange={(e) => setForm({ ...form, coveragePeriodMonths: Number(e.target.value) })}>
            <option value={1}>1 mois</option>
            <option value={6}>6 mois</option>
            <option value={12}>12 mois</option>
            <option value={24}>24 mois</option>
          </select>

          <label>Informations complémentaires</label>
          <textarea
            placeholder="Précisez votre besoin (usage, antécédents, etc.)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" disabled={submitting}>
            {submitting ? "Envoi…" : isAuthenticated ? "Envoyer ma demande" : "Se connecter pour continuer"}
          </button>
        </form>

        <div className={styles.history}>
          <h2>Mes demandes</h2>
          {!isAuthenticated ? (
            <p className={styles.muted}>Connectez-vous pour voir vos demandes précédentes. <Link to="/login">Se connecter</Link></p>
          ) : loading ? (
            <p className={styles.muted}>Chargement…</p>
          ) : myRequests.length === 0 ? (
            <p className={styles.muted}>Aucune demande envoyée pour l'instant.</p>
          ) : (
            <div className={styles.list}>
              {myRequests.map((r) => {
                const st = STATUS_LABELS[r.status];
                const canPay = r.status === "approved" && r.premium != null && !r.isPaid;
                return (
                  <div key={r._id} className={styles.item} style={{ flexDirection: "column", alignItems: "stretch" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                      <div>
                        <strong>{TYPE_OPTIONS.find((o) => o.value === r.type)?.label || r.type}</strong>
                        <div className={styles.itemMeta}>{r.vehicleInfo || "—"} · {r.coveragePeriodMonths} mois</div>
                        {r.status === "approved" && r.premium != null && (
                          <div className={styles.premium}>
                            Prime proposée : {fmtUSD(r.premium)}{r.isPaid ? " — ✅ Payée" : ""}
                            {r.isPaid && (
                              <button
                                type="button"
                                style={{ marginLeft: 10, background: "none", border: "none", color: "#6366f1", cursor: "pointer", textDecoration: "underline", fontSize: ".82rem" }}
                                onClick={async () => {
                                  const res = await fetch(`/api/insurance/${r._id}/receipt`, { headers: { Authorization: `Bearer ${token}` } });
                                  if (!res.ok) return;
                                  const blob = await res.blob();
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url; a.download = `recu-assurance-${r._id}.pdf`;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                }}
                              >
                                📥 Reçu
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <span className={styles.badge} style={{ color: st.c, background: st.bg }}>{st.l}</span>
                    </div>

                    {canPay && (
                      payingId === r._id ? (
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                          <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                            <option value="card">Carte bancaire</option>
                            <option value="orange_money">Orange Money</option>
                            <option value="wave">Wave</option>
                          </select>
                          <button type="button" disabled={paySubmitting} onClick={() => handlePayQuote(r._id)}>
                            {paySubmitting ? "…" : "Confirmer"}
                          </button>
                          <button type="button" onClick={() => { setPayingId(null); setPayError(null); }}>Annuler</button>
                        </div>
                      ) : (
                        <button type="button" style={{ marginTop: 8, alignSelf: "flex-start" }} onClick={() => { setPayingId(r._id); setPayError(null); }}>
                          💳 Payer cette prime
                        </button>
                      )
                    )}
                    {payingId === r._id && payError && <div className={styles.error} style={{ marginTop: 6 }}>{payError}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
