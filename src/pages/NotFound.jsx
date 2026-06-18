import React from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div style={{
      minHeight: "70vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
      textAlign: "center",
      background: "#f8faff",
    }}>
      <div style={{ fontSize: "5rem", marginBottom: 16, lineHeight: 1 }}>🚗</div>
      <h1 style={{
        fontSize: "clamp(4rem,10vw,7rem)",
        fontWeight: 900,
        color: "#0f1b3f",
        lineHeight: 1,
        margin: "0 0 8px",
        letterSpacing: "-.04em",
      }}>404</h1>
      <h2 style={{
        fontSize: "clamp(1.2rem,2.5vw,1.6rem)",
        fontWeight: 800,
        color: "#0f1b3f",
        margin: "0 0 14px",
      }}>Page introuvable</h2>
      <p style={{
        color: "#5a6a8a",
        fontSize: ".96rem",
        lineHeight: 1.6,
        maxWidth: 400,
        margin: "0 0 32px",
      }}>
        Cette page n'existe pas ou a été déplacée.
        Revenez à l'accueil pour explorer nos véhicules.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <Link to="/" style={{
          background: "#ff4d2d",
          color: "#fff",
          fontWeight: 700,
          padding: "12px 26px",
          borderRadius: 10,
          textDecoration: "none",
          fontSize: ".92rem",
          boxShadow: "0 4px 16px rgba(255,77,45,.35)",
          transition: "all .2s",
        }}>
          ← Retour à l'accueil
        </Link>
        <Link to="/catalogue" style={{
          background: "transparent",
          color: "#0f1b3f",
          fontWeight: 700,
          padding: "11px 24px",
          borderRadius: 10,
          textDecoration: "none",
          fontSize: ".92rem",
          border: "2px solid #d1d9e8",
        }}>
          Voir le catalogue
        </Link>
      </div>
    </div>
  );
}
