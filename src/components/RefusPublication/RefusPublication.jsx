import { Link } from "react-router-dom";

// Encadré affiché sur le formulaire quand le serveur refuse la publication
// (voir utils/refusPublication.js) : le partenaire garde sa saisie et sait
// quoi faire, au lieu d'être renvoyé ailleurs sans explication.
export default function RefusPublication({ refus }) {
  if (!refus) return null;
  return (
    <div role="alert" style={{
      display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap",
      background: "#fff7ed", border: "1.5px solid #fdba74", borderRadius: 14,
      padding: "14px 18px", margin: "0 0 18px", color: "#7c2d12", fontSize: ".92rem", lineHeight: 1.5,
    }}>
      <span aria-hidden="true" style={{ fontSize: "1.3rem" }}>⚠️</span>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>{refus.message}</div>
      {refus.lien && (
        <Link to={refus.lien} style={{
          flex: "0 0 auto", alignSelf: "center", background: "#ff4d2d", color: "#fff", fontWeight: 700,
          borderRadius: 10, padding: "10px 16px", minHeight: 44, display: "inline-flex", alignItems: "center", textDecoration: "none",
        }}>{refus.libelle}</Link>
      )}
    </div>
  );
}
