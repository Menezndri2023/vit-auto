import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useNavigate } from "react-router-dom";

const REASONS = [
  { value: "fraude",               label: "Fraude / arnaque" },
  { value: "contenu_inapproprie",  label: "Contenu inapproprié" },
  { value: "annonce_fausse",       label: "Annonce fausse ou trompeuse" },
  { value: "contenu_illicite",     label: "Contenu illicite" },
  { value: "harcelement",          label: "Harcèlement / abus" },
  { value: "autre",                label: "Autre" },
];

// Bouton + modale de signalement réutilisable — voir la Politique de
// signalement (/politiques). targetType : "vehicle" | "ie_listing" | "review" | "driver" | "user" | "activity".
export default function ReportButton({ targetType, targetId, compact = false }) {
  const { isAuthenticated, token } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);

  const openModal = () => {
    if (!isAuthenticated) { navigate("/login"); return; }
    setOpen(true);
  };

  const submit = async () => {
    if (!reason) { error("Sélectionnez un motif."); return; }
    setSending(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetType, targetId, reason, description }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { error(data.message || "Erreur lors de l'envoi."); return; }
      success(data.message || "Signalement envoyé — merci.");
      setOpen(false); setReason(""); setDescription("");
    } catch { error("Erreur réseau."); }
    finally { setSending(false); }
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        style={compact
          ? { background: "none", border: "none", color: "#94a3b8", fontSize: ".78rem", cursor: "pointer", padding: 0 }
          : { background: "#fff", border: "1.5px solid #e2e8f0", color: "#64748b", borderRadius: 8, padding: "6px 12px", fontSize: ".82rem", fontWeight: 700, cursor: "pointer" }
        }
      >
        🚩 Signaler
      </button>

      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,27,63,.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, padding: "24px 26px", width: "min(420px, 100%)" }}>
            <h3 style={{ margin: "0 0 14px", fontSize: "1rem", fontWeight: 900, color: "#0f1b3f" }}>🚩 Signaler ce contenu</h3>
            <label style={{ display: "block", fontSize: ".82rem", fontWeight: 700, color: "#334155", marginBottom: 6 }}>Motif *</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem", marginBottom: 14 }}>
              <option value="">— Choisir —</option>
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <label style={{ display: "block", fontSize: ".82rem", fontWeight: 700, color: "#334155", marginBottom: 6 }}>Détails (optionnel)</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Décrivez le problème…"
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: ".85rem", fontFamily: "inherit", resize: "vertical", marginBottom: 16, boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={submit} disabled={sending || !reason}
                style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, cursor: "pointer" }}>
                {sending ? "Envoi…" : "Envoyer le signalement"}
              </button>
              <button onClick={() => setOpen(false)}
                style={{ background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, cursor: "pointer" }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
