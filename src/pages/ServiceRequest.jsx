import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import styles from "./InsuranceRequest.module.css";

// Une seule page générique pour les 7 catégories "entièrement neuves" de la
// plateforme de services (transport/transit/douanes/immatriculation/
// garantie/financement/change de devises) — même gabarit que
// /insurance-request (InsuranceRequest.jsx), paramétré par catégorie plutôt
// que dupliqué 7 fois. Les champs propres à chaque catégorie sont stockés
// dans ServiceRequest.details (voir server/models/ServiceRequest.js).
const CATEGORY_META = {
  transport: {
    icon: "🚢", title: "Transport international",
    desc: "Organisez le transport de votre véhicule entre deux pays — maritime, terrestre ou aérien.",
    fields: [
      { key: "origin",      label: "Pays / ville d'origine",      type: "text", placeholder: "Dubaï, Émirats Arabes Unis" },
      { key: "destination", label: "Pays / ville de destination", type: "text", placeholder: "Abidjan, Côte d'Ivoire" },
      { key: "mode",        label: "Mode de transport souhaité",  type: "select", options: [["maritime", "Maritime"], ["terrestre", "Terrestre"], ["aerien", "Aérien"]] },
    ],
  },
  transit: {
    icon: "🛃", title: "Transit",
    desc: "Faites transiter votre véhicule via un pays tiers avant sa destination finale.",
    fields: [
      { key: "transitCountry",   label: "Pays de transit",    type: "text", placeholder: "Togo" },
      { key: "finalDestination", label: "Destination finale", type: "text", placeholder: "Burkina Faso" },
    ],
  },
  douanes: {
    icon: "🏛️", title: "Douanes",
    desc: "Faites dédouaner votre véhicule à l'import ou à l'export.",
    fields: [
      { key: "country",         label: "Pays de dédouanement",             type: "text", placeholder: "Côte d'Ivoire" },
      { key: "vehicleValueUSD", label: "Valeur déclarée du véhicule (USD)", type: "number", placeholder: "15000" },
    ],
  },
  immatriculation: {
    icon: "🪪", title: "Immatriculation",
    desc: "Faites immatriculer votre véhicule dans son pays de destination.",
    fields: [
      { key: "country", label: "Pays d'immatriculation", type: "text", placeholder: "Sénégal" },
    ],
  },
  garantie: {
    icon: "🛡️", title: "Garantie",
    desc: "Souscrivez une garantie mécanique/panne pour votre véhicule.",
    fields: [
      { key: "durationMonths", label: "Durée souhaitée (mois)", type: "number", placeholder: "12" },
    ],
  },
  financement: {
    icon: "🏦", title: "Financement",
    desc: "Demandez une solution de financement personnalisée pour votre achat.",
    fields: [
      { key: "amountUSD",      label: "Montant à financer (USD)", type: "number", placeholder: "10000" },
      { key: "durationMonths", label: "Durée souhaitée (mois)",    type: "number", placeholder: "36" },
    ],
  },
  change_devises: {
    icon: "💱", title: "Change de devises",
    desc: "Faites convertir un montant entre deux devises pour votre transaction.",
    fields: [
      { key: "amount",       label: "Montant",       type: "number", placeholder: "1000" },
      { key: "fromCurrency", label: "Devise source", type: "text",   placeholder: "USD" },
      { key: "toCurrency",   label: "Devise cible",  type: "text",   placeholder: "XOF" },
    ],
  },
};

const STATUS_LABELS = {
  pending:  { l: "🔍 En attente",  c: "#d97706", bg: "#fef3c7" },
  approved: { l: "✅ Approuvée",   c: "#10b981", bg: "#d1fae5" },
  rejected: { l: "❌ Refusée",     c: "#dc2626", bg: "#fee2e2" },
};

export default function ServiceRequest() {
  const { category } = useParams();
  const meta = CATEGORY_META[category];
  const { isAuthenticated, token } = useAuth();
  const navigate = useNavigate();

  const emptyDetails = useMemo(() => Object.fromEntries((meta?.fields || []).map((f) => [f.key, f.type === "select" ? f.options[0][0] : ""])), [meta]);

  const [vehicleInfo, setVehicleInfo] = useState("");
  const [details, setDetails] = useState(emptyDetails);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setDetails(emptyDetails); }, [emptyDetails]);

  const loadMine = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const r = await fetch("/api/service-requests/mine", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setMyRequests(((await r.json()).requests || []).filter((req) => req.category === category));
    } catch { /* ignore */ }
    setLoading(false);
  }, [token, category]);

  useEffect(() => { loadMine(); }, [loadMine]);

  if (!meta) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1>Service introuvable</h1>
          <p>Retournez à la <Link to="/services">liste des services</Link>.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) { navigate("/login", { state: { from: { pathname: `/services/${category}` } } }); return; }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ category, vehicleInfo, details, notes }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.message || "Erreur lors de l'envoi."); return; }
      setVehicleInfo(""); setDetails(emptyDetails); setNotes("");
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
        <h1>{meta.icon} {meta.title}</h1>
        <p>{meta.desc} Notre équipe étudie votre dossier et vous propose un devis adapté.</p>
      </div>

      <div className={styles.grid}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <h2>Nouvelle demande</h2>

          <label>Véhicule concerné</label>
          <input
            placeholder="Ex : Toyota Corolla 2020, immatriculée..."
            value={vehicleInfo}
            onChange={(e) => setVehicleInfo(e.target.value)}
          />

          {meta.fields.map((f) => (
            <div key={f.key}>
              <label>{f.label}</label>
              {f.type === "select" ? (
                <select value={details[f.key] ?? ""} onChange={(e) => setDetails((p) => ({ ...p, [f.key]: e.target.value }))}>
                  {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ) : (
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={details[f.key] ?? ""}
                  onChange={(e) => setDetails((p) => ({ ...p, [f.key]: e.target.value }))}
                />
              )}
            </div>
          ))}

          <label>Informations complémentaires</label>
          <textarea
            placeholder="Précisez votre besoin..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
                      <strong>{r.vehicleInfo || meta.title}</strong>
                      {r.status === "approved" && r.quotedAmountUSD != null && (
                        <div className={styles.premium}>Devis proposé : {Number(r.quotedAmountUSD).toLocaleString("fr-FR")} USD</div>
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
