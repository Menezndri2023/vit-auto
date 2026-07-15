import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
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
  const navigate = useNavigate();

  const [form, setForm] = useState({ type: "auto", vehicleInfo: "", coveragePeriodMonths: 12, notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadMine = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const r = await fetch("/api/insurance/mine", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setMyRequests((await r.json()).requests || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [token]);

  useEffect(() => { loadMine(); }, [loadMine]);

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
                return (
                  <div key={r._id} className={styles.item}>
                    <div>
                      <strong>{TYPE_OPTIONS.find((o) => o.value === r.type)?.label || r.type}</strong>
                      <div className={styles.itemMeta}>{r.vehicleInfo || "—"} · {r.coveragePeriodMonths} mois</div>
                      {r.status === "approved" && r.premium && (
                        <div className={styles.premium}>Prime proposée : {Number(r.premium).toLocaleString("fr-FR")} {r.devise}</div>
                      )}
                    </div>
                    <span className={styles.badge} style={{ color: st.c, background: st.bg }}>{st.l}</span>
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
