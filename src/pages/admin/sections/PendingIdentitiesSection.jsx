// Extrait d'AdminPanel.jsx (découpe par onglet, 2026-09-12) — logique inchangée.
import { useCallback, useEffect, useState } from "react";

// ── Pièces d'identité soumises depuis le profil client ────────────────────
// Manque réel : les endpoints existaient des deux côtés (getPendingIdentities,
// adminVerifyIdentity) et les admins recevaient bien la notification
// « 📋 Nouvelle pièce d'identité soumise » pointant sur /admin — mais AUCUN
// écran ne listait ces dossiers ni n'offrait de les approuver ou refuser. Les
// soumissions tombaient donc dans le vide : la seule sortie du statut
// "pending" était le parcours /kyc séparé, qu'on n'avait jamais demandé à
// l'utilisateur de refaire.
export function PendingIdentitiesSection({ token, showToast }) {
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [acting, setActing]   = useState(null);
  const [rejectFor, setRejectFor] = useState(null);
  const [reason, setReason]   = useState("");
  // Les pièces d'identité (base64, jusqu'à 12 Mo par dossier) ne sont plus
  // renvoyées par la liste : elles écrasaient la réponse et l'appel échouait
  // après 90 s. Elles sont chargées dossier par dossier, à la demande.
  const [pieces, setPieces]   = useState({});   // { [userId]: {frontImage, backImage, selfie} | "chargement" | "erreur" }

  const voirPieces = useCallback(async (userId) => {
    setPieces((p) => ({ ...p, [userId]: "chargement" }));
    try {
      const r = await fetch(`/api/kyc/admin/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => null);
      if (!r.ok) { setPieces((p) => ({ ...p, [userId]: "erreur" })); return; }
      const i = d?.user?.identity || d?.identity || {};
      setPieces((p) => ({ ...p, [userId]: { frontImage: i.frontImage, backImage: i.backImage, selfie: i.selfie } }));
    } catch { setPieces((p) => ({ ...p, [userId]: "erreur" })); }
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/users/pending-identity", { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => null);
      if (!r.ok) { setError(d?.message || `Chargement impossible (erreur ${r.status}).`); return; }
      setList(d?.users || []);
    } catch { setError("Connexion au serveur impossible."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const decide = async (userId, status, rejectionReason) => {
    setActing(userId);
    try {
      const r = await fetch(`/api/users/${userId}/verify-identity`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, rejectionReason }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) { showToast(d?.message || "Décision refusée par le serveur.", "error"); return; }
      showToast(status === "verified" ? "✅ Pièce d'identité validée." : "🚫 Pièce d'identité refusée — client notifié.");
      setRejectFor(null); setReason("");
      load();
    } catch { showToast("Erreur réseau — décision non enregistrée.", "error"); }
    finally { setActing(null); }
  };

  if (loading) return <div style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>Chargement…</div>;
  if (error) return <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 10, padding: "10px 12px", fontSize: ".84rem" }}>⚠️ {error}</div>;
  if (!list.length) {
    return <p style={{ color: "#94a3b8", fontSize: ".85rem", margin: 0 }}>Aucune pièce d'identité en attente d'examen.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {list.map((u) => (
        <div key={u._id} style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 12, padding: "14px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
            <div>
              <strong style={{ fontSize: ".9rem", color: "#0f1b3f" }}>{u.firstName} {u.lastName}</strong>
              <div style={{ fontSize: ".78rem", color: "#94a3b8" }}>
                {u.email}{u.phone ? ` · ${u.phone}` : ""}
              </div>
              <div style={{ fontSize: ".78rem", color: "#64748b", marginTop: 3 }}>
                {(u.identity?.type || "pièce").toUpperCase()}
                {u.identity?.number ? ` · nº ${u.identity.number}` : ""}
                {u.identity?.submittedAt ? ` · soumise le ${new Date(u.identity.submittedAt).toLocaleDateString("fr-FR")}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <button disabled={acting === u._id} onClick={() => decide(u._id, "verified")}
                style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                ✅ Valider
              </button>
              <button disabled={acting === u._id} onClick={() => { setRejectFor(u._id); setReason(""); }}
                style={{ background: "#fef2f2", color: "#dc2626", border: "1.5px solid #fecaca", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                ❌ Refuser
              </button>
            </div>
          </div>

          {pieces[u._id] && pieces[u._id] !== "chargement" && pieces[u._id] !== "erreur" ? (
            <ClientDocuments
              docs={pieces[u._id]}
              reference={`identite-${u._id.slice(-6)}`}
            />
          ) : (
            <button type="button" onClick={() => voirPieces(u._id)}
              disabled={pieces[u._id] === "chargement"}
              style={{ background: "#f1f5f9", color: "#334155", border: "1.5px solid #e2e8f0", borderRadius: 8,
                       padding: "9px 14px", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
              {pieces[u._id] === "chargement" ? "Chargement des pièces…"
                : pieces[u._id] === "erreur" ? "↻ Réessayer — chargement des pièces impossible"
                : "📄 Afficher les pièces justificatives"}
            </button>
          )}

          {rejectFor === u._id && (
            <div style={{ marginTop: 12, borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                placeholder="Motif du refus (communiqué au client) — ex : document illisible, pièce expirée…"
                style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: 8, fontSize: ".84rem", fontFamily: "inherit" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button disabled={!reason.trim() || acting === u._id} onClick={() => decide(u._id, "rejected", reason.trim())}
                  style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontWeight: 700, fontSize: ".8rem", cursor: reason.trim() ? "pointer" : "not-allowed", opacity: reason.trim() ? 1 : 0.5 }}>
                  Confirmer le refus
                </button>
                <button onClick={() => { setRejectFor(null); setReason(""); }}
                  style={{ background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, padding: "7px 14px", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
