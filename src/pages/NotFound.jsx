import React from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../context/I18nContext";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

export default function NotFound() {
  const { t } = useI18n();

  // Sans `noindex`, CHAQUE adresse morte du site devient une page indexable :
  // l'application monopage répond 200 partout, donc un lien cassé, une URL
  // tapée de travers ou une annonce supprimée deviennent autant de pages
  // « Page introuvable » en concurrence avec les vraies dans les résultats.
  // `follow` est conservé : les liens de secours vers l'accueil et le
  // catalogue doivent rester suivis.
  //
  // Pas de `traduite` ici : une 404 n'a rien à déclarer en cinq versions.
  useDocumentMeta({
    title: t("nf.title"),
    description: t("nf.desc"),
    robots: "noindex, follow",
  });

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
      }}>{t("nf.title")}</h2>
      <p style={{
        color: "#5a6a8a",
        fontSize: ".96rem",
        lineHeight: 1.6,
        maxWidth: 400,
        margin: "0 0 32px",
      }}>
        {t("nf.desc")}
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
          {t("nf.home")}
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
          {t("nf.catalogue")}
        </Link>
      </div>
    </div>
  );
}
