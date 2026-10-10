import { Link } from "react-router-dom";

// Bandeau « compte vérifié » des anciennes pages de vérification : affiché à un
// partenaire validé, il dit en premier que rien n'est attendu de lui, puis à
// quoi sert encore la page (facultative). Voir hooks/useValidationPartenaire.js.
export default function CompteVerifie({ suite }) {
  return (
    <div
      role="status"
      style={{
        display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap",
        background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 14,
        padding: "14px 18px", margin: "0 0 20px", color: "#065f46",
      }}
    >
      <span aria-hidden="true" style={{ fontSize: "1.3rem", lineHeight: 1 }}>✅</span>
      <div style={{ flex: 1, minWidth: 220 }}>
        <strong style={{ display: "block", marginBottom: 2 }}>Votre compte partenaire est vérifié</strong>
        <span style={{ fontSize: ".88rem", lineHeight: 1.5 }}>
          Vos documents sont complets : aucune démarche n'est requise et vous ne recevrez plus de demande de vérification.
          {suite ? ` ${suite}` : ""}
        </span>
      </div>
      <Link to="/vendor/dashboard" style={{ fontSize: ".85rem", fontWeight: 700, color: "#047857", alignSelf: "center" }}>
        Mon espace →
      </Link>
    </div>
  );
}
