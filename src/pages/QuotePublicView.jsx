import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

const API = "/api/pms/quotes/public";

const CATEGORY_LABELS = {
  vehicule: "Véhicule(s)", transport: "Transport", assurance: "Assurance",
  inspection: "Inspection", douane: "Douane", port: "Frais portuaires",
  livraison: "Livraison", autre: "Autre",
};

const fmt = (n, cur) => `${Number(n || 0).toLocaleString("fr-FR")} ${cur || "USD"}`;

// ════════════════════════════════════════════════════════════════════════════════
// Consultation + réponse publique à un devis PMS (acheteur, sans compte VIT AUTO)
// URL : /quote/:token — voir pmsController.getPublicQuote/respondPublicQuote.
// Jusqu'ici le lien envoyé par email/SMS ne menait nulle part : cette page
// n'existait pas, l'acheteur ne pouvait ni consulter ni répondre en ligne.
// ════════════════════════════════════════════════════════════════════════════════
export default function QuotePublicView() {
  const { token } = useParams();
  const [state, setState] = useState("loading"); // loading | valid | invalid | responding | done | error
  const [quote, setQuote] = useState(null);
  const [errMsg, setErrMsg] = useState("");
  const [respondedAction, setRespondedAction] = useState(null);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    fetch(`${API}/${token}`)
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (ok) { setQuote(data); setState("valid"); }
        else { setErrMsg(data.message || "Devis introuvable."); setState("invalid"); }
      })
      .catch(() => { setErrMsg("Impossible de charger le devis."); setState("invalid"); });
  }, [token]);

  const respond = async (action) => {
    setState("responding");
    try {
      const r = await fetch(`${API}/${token}/respond`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await r.json();
      if (r.ok) { setQuote(data); setRespondedAction(action); setState("done"); }
      else { setErrMsg(data.message || "Erreur lors de l'envoi de votre réponse."); setState("error"); }
    } catch { setErrMsg("Erreur réseau."); setState("error"); }
  };

  const wrap = (children) => (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0f1b3f", marginBottom: 4 }}>VIT AUTO — Devis</h1>
      {children}
    </div>
  );

  if (state === "loading") return wrap(<p style={{ color: "#64748b" }}>Chargement du devis…</p>);
  if (state === "invalid") return wrap(<p style={{ color: "#dc2626" }}>{errMsg}</p>);
  if (!quote) return null;

  const alreadyAnswered = ["accepte", "refuse"].includes(quote.status);

  return wrap(
    <>
      <p style={{ color: "#64748b", marginBottom: 20 }}>
        Devis <strong>{quote.quoteNumber}</strong> — valable jusqu'au {quote.validUntil ? new Date(quote.validUntil).toLocaleDateString("fr-FR") : "—"}
      </p>

      {(state === "done" || alreadyAnswered) && (
        <div style={{
          padding: "14px 18px", borderRadius: 10, marginBottom: 20, fontWeight: 700,
          background: (respondedAction === "accept" || quote.status === "accepte") ? "#d1fae5" : "#fee2e2",
          color: (respondedAction === "accept" || quote.status === "accepte") ? "#059669" : "#dc2626",
        }}>
          {(respondedAction === "accept" || quote.status === "accepte") ? "✅ Vous avez accepté ce devis." : "❌ Vous avez refusé ce devis."}
          {" "}Le partenaire a été notifié.
        </div>
      )}

      <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: "1rem" }}>Détail</h3>
        {(quote.lines || []).map((l, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: ".88rem", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
            <span>{l.description} {!l.included && "(optionnel)"} <span style={{ color: "#94a3b8" }}>[{CATEGORY_LABELS[l.category] || l.category}]</span></span>
            <strong>{fmt((l.qty || 1) * (l.unitPrice || 0), l.currency || quote.currency)}</strong>
          </div>
        ))}
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: "2px solid #0f1b3f", display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: "1.05rem" }}>
          <span>TOTAL</span>
          <span>{fmt(quote.total, quote.currency)}</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: ".85rem", color: "#334155", marginBottom: 20 }}>
        {quote.incoterm && <span>📦 Incoterm : <strong>{quote.incoterm}</strong></span>}
        {quote.paymentTerms && <span>💳 Conditions de paiement : {quote.paymentTerms}</span>}
        {quote.deliveryTime && <span>🚢 Délai estimé : {quote.deliveryTime}</span>}
        {quote.portOfLoading && <span>⚓ Port de chargement : {quote.portOfLoading}</span>}
        {quote.portOfDischarge && <span>⚓ Port de déchargement : {quote.portOfDischarge}</span>}
        {quote.notes && <span>📝 {quote.notes}</span>}
      </div>

      {!alreadyAnswered && state !== "done" && (
        <div style={{ display: "flex", gap: 10 }}>
          <button
            disabled={state === "responding"}
            onClick={() => respond("accept")}
            style={{ flex: 1, padding: "12px 0", background: "#059669", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: ".92rem", cursor: "pointer" }}
          >
            ✅ Accepter ce devis
          </button>
          <button
            disabled={state === "responding"}
            onClick={() => respond("refuse")}
            style={{ flex: 1, padding: "12px 0", background: "#fff", color: "#dc2626", border: "1.5px solid #dc2626", borderRadius: 10, fontWeight: 700, fontSize: ".92rem", cursor: "pointer" }}
          >
            ❌ Refuser
          </button>
        </div>
      )}
      {state === "error" && <p style={{ color: "#dc2626", marginTop: 10 }}>{errMsg}</p>}
    </>
  );
}
