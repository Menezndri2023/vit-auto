import { Navigate, useLocation } from "react-router-dom";
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
        minHeight: "60vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "3rem 2rem", textAlign: "center", background: "#f8fafc",
      }}>
        <div style={{
          background: "#fff", borderRadius: "1.5rem", padding: "3rem 2.5rem",
          maxWidth: "440px", boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
          border: "1px solid #e2e8f0",
        }}>
          <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>🔐</div>
          <h2 style={{ color: "#1e293b", fontSize: "1.4rem", fontWeight: 800, marginBottom: "0.75rem" }}>
            Accès réservé
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            Cette page est réservée aux <strong>administrateurs VIT AUTO</strong>.
          </p>
          <a href="/" style={{
            background: "#1e40af", color: "#fff", borderRadius: "0.75rem",
            padding: "0.875rem 1.5rem", fontWeight: 700, textDecoration: "none",
            fontSize: "0.95rem", display: "inline-block",
          }}>← Retour à l'accueil</a>
        </div>
      </div>
    );
  }

  return children;
};

export default AdminRoute;
