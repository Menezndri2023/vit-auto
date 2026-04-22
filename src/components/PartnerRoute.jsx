import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * PartnerRoute — Protège les routes réservées aux partenaires.
 *
 * Comportement :
 *  - Non connecté          → redirige vers /login
 *  - Connecté, rôle client → affiche une page d'information
 *  - Partenaire / admin    → affiche le contenu normalement
 */
const PartnerRoute = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  // Pas connecté → login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location, reason: "auth" }} replace />;
  }

  // Connecté mais pas partenaire → page d'info
  if (user.role !== "partenaire" && user.role !== "admin") {
    return (
      <div style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem 2rem",
        textAlign: "center",
        background: "#f8fafc",
      }}>
        <div style={{
          background: "#fff",
          borderRadius: "1.5rem",
          padding: "3rem 2.5rem",
          maxWidth: "480px",
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          border: "1px solid #e2e8f0",
        }}>
          <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>🤝</div>
          <h2 style={{ color: "#1e293b", fontSize: "1.4rem", fontWeight: 800, marginBottom: "0.75rem" }}>
            Espace Partenaire
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            Cette section est réservée aux <strong>partenaires VIT AUTO</strong>.
            Créez un compte partenaire pour publier des annonces, gérer vos véhicules et accéder à votre tableau de bord.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <a
              href="/register"
              style={{
                background: "linear-gradient(135deg,#f59e0b,#d97706)",
                color: "#fff",
                borderRadius: "0.75rem",
                padding: "0.875rem 1.5rem",
                fontWeight: 700,
                textDecoration: "none",
                fontSize: "0.95rem",
              }}
            >
              Devenir Partenaire →
            </a>
            <a
              href="/catalogue"
              style={{
                background: "transparent",
                color: "#475569",
                border: "1px solid #cbd5e1",
                borderRadius: "0.75rem",
                padding: "0.75rem 1.5rem",
                fontWeight: 600,
                textDecoration: "none",
                fontSize: "0.9rem",
              }}
            >
              Voir le catalogue
            </a>
          </div>
        </div>
      </div>
    );
  }

  return children;
};

export default PartnerRoute;
