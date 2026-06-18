import { Navigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * PartnerRoute — Protège les routes réservées aux partenaires.
 * - Non connecté          → /login (avec state.from pour retour après connexion)
 * - Connecté, rôle client → page d'info + CTA devenir partenaire
 * - Partenaire / admin    → affiche le contenu
 */
const PartnerRoute = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location, reason: "auth" }} replace />;
  }

  if (user.role !== "partenaire" && user.role !== "admin") {
    return (
      <div style={{
        minHeight: "65vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem 1.5rem",
        textAlign: "center",
        background: "#f8faff",
      }}>
        <div style={{
          background: "#fff",
          borderRadius: 20,
          padding: "3rem 2.5rem",
          maxWidth: 480,
          boxShadow: "0 8px 32px rgba(15,27,63,0.10)",
          border: "1.5px solid #e8edf8",
        }}>
          <div style={{ fontSize: "3.5rem", marginBottom: 16, lineHeight: 1 }}>🤝</div>
          <h2 style={{ color: "#0f1b3f", fontSize: "1.4rem", fontWeight: 900, margin: "0 0 12px" }}>
            Espace Partenaire VIT AUTO
          </h2>
          <p style={{ color: "#5a6a8a", fontSize: "0.93rem", lineHeight: 1.65, margin: "0 0 24px" }}>
            Cette section est réservée aux <strong>partenaires VIT AUTO</strong>.
            Publiez vos véhicules, gérez vos commandes et encaissez en automatique.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Link
              to="/register?role=partenaire"
              style={{
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                color: "#fff",
                borderRadius: 12,
                padding: "13px 20px",
                fontWeight: 800,
                textDecoration: "none",
                fontSize: "0.95rem",
                display: "block",
              }}
            >
              🤝 Devenir Partenaire — Gratuit
            </Link>
            <Link
              to="/plans"
              style={{
                background: "transparent",
                color: "#6366f1",
                border: "1.5px solid #c7d2fe",
                borderRadius: 12,
                padding: "11px 20px",
                fontWeight: 700,
                textDecoration: "none",
                fontSize: "0.88rem",
                display: "block",
              }}
            >
              Voir les tarifs partenaires
            </Link>
            <Link
              to="/catalogue"
              style={{
                color: "#5a6a8a",
                fontSize: "0.85rem",
                textDecoration: "none",
                padding: "8px 0",
                display: "block",
              }}
            >
              ← Retour au catalogue
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return children;
};

export default PartnerRoute;
