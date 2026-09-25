import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { useI18n } from "../context/I18nContext";

// Le contenu est dans i18n/faq.js, en cinq langues : ce tableau ne porte plus
// que la structure. Cinq réponses y ont été corrigées au passage — réservation
// invité supprimée, confirmation qui n'est pas immédiate, grille de
// commissions réellement facturée, frais de livraison par pays, 28 pays et non
// « 20+ ». Le détail est en tête de i18n/faq.js.
const FAQS = [
  { cat: "faq.cat.booking",  prefixe: "faq.booking",  n: 4 },
  { cat: "faq.cat.payment",  prefixe: "faq.payment",  n: 4 },
  { cat: "faq.cat.delivery", prefixe: "faq.delivery", n: 4 },
  { cat: "faq.cat.partners", prefixe: "faq.partners", n: 4 },
  { cat: "faq.cat.ie",       prefixe: "faq.ie",       n: 5 },
  { cat: "faq.cat.security", prefixe: "faq.security", n: 4 },
];

const FAQItem = ({ q, a }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid #f0f4ff" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", textAlign: "left", background: "transparent",
          border: "none", padding: "15px 0", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 12, fontFamily: "inherit",
        }}
      >
        <span style={{ fontWeight: 700, color: "#0f1b3f", fontSize: "0.92rem", lineHeight: 1.4 }}>{q}</span>
        <span style={{
          fontSize: "1.2rem", color: "#ff4d2d", flexShrink: 0,
          transform: open ? "rotate(45deg)" : "none",
          transition: "transform .2s",
          lineHeight: 1,
        }}>+</span>
      </button>
      {open && (
        <div style={{ padding: "0 0 16px", color: "#5a6a88", fontSize: "0.88rem", lineHeight: 1.7 }}>
          {a}
        </div>
      )}
    </div>
  );
};

export default function FAQ() {
  // Métadonnées propres à cette page. Sans cet appel, elle hérite du titre
  // générique d'index.html — les 153 URLs du sitemap apparaissaient toutes
  // identiques dans les résultats de recherche (voir hooks/useDocumentMeta.js).
  const { t } = useI18n();
  useDocumentMeta({
    title:       t("faq.metaTitle"),
    description: t("faq.metaDesc"),
    traduite:    true,
  });

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px 96px" }}>

      {/* En-tête */}
      <div style={{ textAlign: "center", marginBottom: 52 }}>
        <span style={{
          display: "inline-block", background: "rgba(255,77,45,.08)", color: "#ff4d2d",
          fontSize: "0.72rem", fontWeight: 800, padding: "4px 14px",
          borderRadius: 999, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16,
        }}>
          {t("faq.badge")}
        </span>
        <h1 style={{ fontSize: "clamp(1.75rem,2.5vw,2.4rem)", fontWeight: 900, color: "#0f1b3f", margin: "0 0 14px" }}>
          {t("faq.metaTitle")}
        </h1>
        <p style={{ color: "#5a6a88", fontSize: "1rem", maxWidth: 520, margin: "0 auto", lineHeight: 1.6 }}>
          {t("faq.notFound")}{" "}
          <a href="tel:+212607742672" style={{ color: "#ff4d2d", fontWeight: 700, textDecoration: "none" }}>
            {t("faq.callUs")}
          </a>{" "}
          {t("faq.or")}{" "}
          <Link to="/help" style={{ color: "#ff4d2d", fontWeight: 700, textDecoration: "none" }}>
            {t("faq.chatUs")}
          </Link>.
        </p>
      </div>

      {/* Catégories */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {FAQS.map((cat) => (
          <div key={cat.prefixe} style={{
            background: "#fff",
            border: "1.5px solid #e8edf8",
            borderRadius: 18,
            padding: "22px 28px",
            boxShadow: "0 2px 16px rgba(15,27,63,.05)",
          }}>
            <h2 style={{
              fontSize: "0.95rem", fontWeight: 800, color: "#0f1b3f",
              margin: "0 0 14px", display: "flex", alignItems: "center", gap: 8,
            }}>
              {t(cat.cat)}
            </h2>
            {/* Les questions sont numérotées de 1 à n dans i18n/faq.js : on les
                parcourt par indice plutôt que de dupliquer la liste ici. */}
            {Array.from({ length: cat.n }, (_, i) => i + 1).map((i) => (
              <FAQItem
                key={`${cat.prefixe}.${i}`}
                q={t(`${cat.prefixe}.${i}.q`)}
                a={t(`${cat.prefixe}.${i}.a`)}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Lien vers autres pages légales */}
      <div style={{
        marginTop: 48, background: "#f8fafc", border: "1px solid #e2e8f0",
        borderRadius: 14, padding: "20px 24px",
        display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center",
      }}>
        <Link to="/cgu" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          📄 {t("footer.shortCgu")}
        </Link>
        <Link to="/privacy" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          🔒 {t("footer.shortPrivacy")}
        </Link>
        <a href="mailto:contact@vit-auto.com" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          ✉️ contact@vit-auto.com
        </a>
        <a href="tel:+212607742672" style={{ color: "#ff4d2d", fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}>
          📞 +212 6 07 74 26 72
        </a>
      </div>
    </div>
  );
}
