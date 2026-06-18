import { Navigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const AdminRoute = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location, reason: "auth" }} replace />;
  }

  if (user?.role !== "admin") {
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
          maxWidth: 440,
          boxShadow: "0 8px 32px rgba(15,27,63,0.10)",
          border: "1.5px solid #e8edf8",
        }}>
          <div style={{ fontSize: "3.5rem", marginBottom: 16, lineHeight: 1 }}>🔐</div>
          <h2 style={{ color: "#0f1b3f", fontSize: "1.4rem", fontWeight: 900, margin: "0 0 12px" }}>
            Accès Administrateur
          </h2>
          <p style={{ color: "#5a6a8a", fontSize: "0.93rem", lineHeight: 1.65, margin: "0 0 24px" }}>
            Cette page est réservée aux <strong>administrateurs VIT AUTO</strong>.
            Contactez-nous si vous pensez avoir ce droit.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Link to="/" style={{
              background: "linear-gradient(135deg, #0f1b3f, #1e3460)",
              color: "#fff",
              borderRadius: 12,
              padding: "13px 20px",
              fontWeight: 700,
              textDecoration: "none",
              fontSize: "0.95rem",
              display: "block",
            }}>
              ← Retour à l'accueil
            </Link>
            <Link to="/dashboard" style={{
              color: "#5a6a8a",
              fontSize: "0.85rem",
              textDecoration: "none",
              padding: "8px 0",
              display: "block",
            }}>
              Mon tableau de bord
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return children;
};

export default AdminRoute;
