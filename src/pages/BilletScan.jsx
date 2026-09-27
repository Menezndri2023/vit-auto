import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

// ════════════════════════════════════════════════════════════════════════════
// Validation d'un billet de séance — URL : /billet/:jeton
//
// ⚠️ Aucune bibliothèque de lecture de QR code, et c'est volontaire : le QR
// encode CETTE adresse, donc l'appareil photo du téléphone la lit et l'ouvre
// tout seul. Embarquer un scanner dans l'application aurait ajouté une
// dépendance, une permission caméra et un cas de figure de plus (navigateur
// sans getUserMedia), pour refaire ce que le téléphone fait déjà mieux.
//
// Le partenaire arrive donc ici connecté, sur son téléphone, et la page fait
// une seule chose : présenter le jeton au serveur et afficher le verdict.
// ════════════════════════════════════════════════════════════════════════════
export default function BilletScan() {
  const { jeton } = useParams();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  // « encours » dès le départ : la page valide toujours à l'arrivée. Partir
  // d'un état d'attente aurait obligé l'effet à le faire basculer lui-même,
  // c'est-à-dire un setState synchrone dans un effet — un rendu en cascade
  // que React signale, et une image qui clignote sur un téléphone.
  const [etat, setEtat] = useState("encours"); // encours | valide | refus
  const lance = useRef(false);
  const [billet, setBillet] = useState(null);
  const [message, setMessage] = useState("");

  // Jamais indexé : l'adresse porte un jeton à usage unique.
  useDocumentMeta({
    title: "Validation d'un billet",
    description: "Présentez le billet d'une séance de loisirs à l'arrivée du client.",
    robots: "noindex, nofollow",
  });

  const valider = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch("/api/bookings/billet/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jeton }),
      });
      const d = await r.json();
      if (r.ok) { setBillet(d); setEtat("valide"); }
      else { setMessage(d.message || "Billet refusé."); setEtat("refus"); }
    } catch {
      setMessage("Réseau indisponible — réessayez une fois la connexion revenue.");
      setEtat("refus");
    }
  }, [jeton, token]);

  // Validation automatique dès l'arrivée : le partenaire a le client devant
  // lui, un clic de plus ne sert à rien. Un billet ne se scanne qu'une fois,
  // donc rejouer la page après coup affiche « déjà présenté » — ce qui est
  // exactement l'information utile, pas une erreur.
  //
  // Le garde-fou `lance` évite un DOUBLE scan : en développement React monte
  // deux fois, et sans lui le billet serait consommé puis aussitôt déclaré
  // « déjà présenté » au partenaire qui a le client devant lui.
  useEffect(() => {
    if (!token || lance.current) return;
    lance.current = true;
    valider();
  }, [token, valider]);

  const carte = { maxWidth: 480, margin: "40px auto", padding: "0 16px" };
  const bloc = (bg, bord) => ({ background: bg, border: `1.5px solid ${bord}`, borderRadius: 14, padding: 20, textAlign: "center" });
  const ligne = { display: "flex", justifyContent: "space-between", gap: 12, fontSize: ".88rem", padding: "6px 0", borderTop: "1px solid #e2e8f0" };

  if (!user) {
    return (
      <div style={carte}>
        <div style={bloc("#f8fafc", "#e2e8f0")}>
          <div style={{ fontSize: "2rem" }}>🎟️</div>
          <h1 style={{ fontSize: "1.05rem", margin: "8px 0" }}>Billet de séance</h1>
          <p style={{ fontSize: ".88rem", color: "#475569" }}>
            Connectez-vous avec votre compte partenaire pour valider ce billet.
          </p>
          <button onClick={() => navigate(`/login?next=${encodeURIComponent(`/billet/${jeton}`)}`)}
            style={{ marginTop: 10, padding: "10px 18px", borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={carte}>
      {etat === "encours" && (
        <div style={bloc("#f8fafc", "#e2e8f0")}>
          <div style={{ fontSize: "2rem" }}>⏳</div>
          <p style={{ fontSize: ".9rem", color: "#475569" }}>Vérification du billet…</p>
        </div>
      )}

      {etat === "valide" && billet && (
        <div style={bloc("#f0fdf4", "#86efac")}>
          <div style={{ fontSize: "2.4rem" }}>✅</div>
          <h1 style={{ fontSize: "1.15rem", margin: "6px 0 2px", color: "#166534" }}>Billet valide</h1>
          <p style={{ fontSize: ".82rem", color: "#15803d", margin: "0 0 14px" }}>Entrée enregistrée à l'instant.</p>
          <div style={{ textAlign: "left" }}>
            <div style={ligne}><span style={{ color: "#6d7a95" }}>Client</span><strong>{billet.client || "—"}</strong></div>
            <div style={ligne}><span style={{ color: "#6d7a95" }}>Séance</span><strong>{billet.activite || "—"}</strong></div>
            <div style={ligne}><span style={{ color: "#6d7a95" }}>Participants</span><strong>{billet.participants}</strong></div>
            <div style={ligne}><span style={{ color: "#6d7a95" }}>Date prévue</span><strong>{billet.date ? new Date(billet.date).toLocaleString("fr-FR") : "—"}</strong></div>
            <div style={ligne}><span style={{ color: "#6d7a95" }}>Référence</span><strong>{billet.reference}</strong></div>
          </div>
          {billet.horsCreneau && (
            // Information, jamais refus : un groupe qui embarque la veille au
            // soir ou une sortie de deux jours sont des cas réels. C'est le
            // partenaire, sur place, qui tranche.
            <p style={{ marginTop: 12, padding: "8px 10px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", fontSize: ".82rem", color: "#92400e" }}>
              ⚠️ Ce billet n'est pas pour aujourd'hui. À vous de voir si vous l'acceptez.
            </p>
          )}
        </div>
      )}

      {etat === "refus" && (
        <div style={bloc("#fef2f2", "#fca5a5")}>
          <div style={{ fontSize: "2.4rem" }}>⛔</div>
          <h1 style={{ fontSize: "1.15rem", margin: "6px 0 8px", color: "#991b1b" }}>Billet refusé</h1>
          <p style={{ fontSize: ".9rem", color: "#7f1d1d", margin: 0 }}>{message}</p>
          <button onClick={() => { lance.current = false; setEtat("encours"); valider(); }}
            style={{ marginTop: 14, padding: "8px 16px", borderRadius: 10, border: "1.5px solid #fca5a5", background: "#fff", color: "#991b1b", fontWeight: 600, cursor: "pointer" }}>
            Réessayer
          </button>
        </div>
      )}

      <p style={{ textAlign: "center", marginTop: 16, fontSize: ".84rem" }}>
        <Link to="/vendor/dashboard" style={{ color: "#2563eb", fontWeight: 600 }}>← Retour au tableau de bord</Link>
      </p>
    </div>
  );
}
