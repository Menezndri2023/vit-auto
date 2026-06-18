import React from "react";
import styles from "./TrustSection.module.css";

const TRUST_ITEMS = [
  {
    icon:  "🪪",
    color: "#6366f1",
    title: "Identités vérifiées",
    desc:  "Chaque compte est vérifié par pièce d'identité (CNI ou passeport). Clients et partenaires sont authentifiés avant toute transaction.",
  },
  {
    icon:  "🔐",
    color: "#10b981",
    title: "Caution sécurisée",
    desc:  "La caution est gérée automatiquement via notre système de paiement sécurisé. Elle est restituée immédiatement après retour du véhicule.",
  },
  {
    icon:  "📄",
    color: "#f59e0b",
    title: "Contrat digital",
    desc:  "Un contrat électronique signé numériquement est généré à chaque réservation. Valeur juridique reconnue en Afrique et en Europe.",
  },
  {
    icon:  "🎧",
    color: "#ff4d2d",
    title: "Support 7j/7",
    desc:  "Notre équipe est disponible 7j/7 par chat, téléphone et WhatsApp. Incident, question ou réclamation — nous répondons en moins d'1h.",
  },
];

const CERTIFS = [
  { label: "TLS 1.3", desc: "Chiffrement" },
  { label: "RGPD",    desc: "Conformité" },
  { label: "BCrypt",  desc: "Mots de passe" },
  { label: "JWT",     desc: "Authentification" },
  { label: "ISO 27001", desc: "Hébergeurs" },
];

const TrustSection = () => (
  <section className={styles.section}>
    <div className={styles.inner}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <span className={styles.tag}>🛡️ SÉCURITÉ & CONFIANCE</span>
        <h2 className={styles.title}>
          Vous êtes entre de<br />
          <span className={styles.accent}>bonnes mains</span>
        </h2>
        <p className={styles.sub}>
          Chaque réservation sur VIT AUTO est protégée de bout en bout —
          identités vérifiées, paiements chiffrés, contrats signés.
        </p>
      </div>

      {/* ── Grid ── */}
      <div className={styles.grid}>
        {TRUST_ITEMS.map((item) => (
          <article key={item.title} className={styles.card}>
            <div className={styles.iconBox} style={{ background: `${item.color}18`, color: item.color }}>
              {item.icon}
            </div>
            <div className={styles.cardBody}>
              <h3 className={styles.cardTitle}>{item.title}</h3>
              <p className={styles.cardDesc}>{item.desc}</p>
            </div>
            <div className={styles.cardBar} style={{ background: item.color }} />
          </article>
        ))}
      </div>

      {/* ── Certifications ── */}
      <div className={styles.certifRow}>
        <p className={styles.certifLabel}>Certifications & standards :</p>
        <div className={styles.certifs}>
          {CERTIFS.map((c) => (
            <div key={c.label} className={styles.certif}>
              <span className={styles.certifBadge}>{c.label}</span>
              <span className={styles.certifDesc}>{c.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export default TrustSection;
