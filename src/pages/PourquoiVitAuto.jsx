import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { useI18n } from "../context/I18nContext";

// Libellés = clés (i18n/pourquoi.js). Seuls l'icône, la couleur et le lien
// restent ici : ils ne se traduisent pas.
const SERVICE_CARDS = [
  { cle: "ie",         icon: "🌍",   color: "#ff4d2d", bg: "rgba(255,77,45,.08)",  link: "/import-export",         cta: "svc.ie.cta", highlight: true },
  { cle: "rent",       icon: "🚗",   color: "#6366f1", bg: "rgba(99,102,241,.08)", link: "/catalogue?mode=Louer" },
  { cle: "sale",       icon: "💰",   color: "#10b981", bg: "rgba(16,185,129,.08)", link: "/catalogue?mode=Acheter" },
  { cle: "driver",     icon: "👨‍✈️", color: "#f59e0b", bg: "rgba(245,158,11,.08)", link: "/catalogue?mode=Chauffeur", cta: "svc.driver.cta" },
  { cle: "insurance",  icon: "🛡️",  color: "#ff4d2d", bg: "rgba(255,77,45,.08)",  link: "/services" },
  { cle: "leasing",    icon: "🏦",   color: "#8b5cf6", bg: "rgba(139,92,246,.08)", link: "/catalogue?mode=Acheter" },
  { cle: "inspection", icon: "🔍",   color: "#0ea5e9", bg: "rgba(14,165,233,.08)", link: "/services" },
  { cle: "delivery",   icon: "🚚",   color: "#f59e0b", bg: "rgba(245,158,11,.08)", link: "/catalogue",             cta: "svc.delivery.cta", highlight: true },
];

// Chiffres vérifiés sur la configuration réelle de la plateforme
// (2026-09-08) : 28 pays actifs et 15 devises paramétrées — la page annonçait
// « 20+ » et « 9 », donc sous-estimait la couverture réelle. Le nombre de
// véhicules, lui, était SUR-estimé d'un facteur 25 (« 3 500+ » pour 138
// publiés) : il vient désormais du décompte réel, et grandit tout seul.
const STATS_FIXES = [
  { value: "28",  cle: "pourquoi.statCountries",  icon: "🌍" },
  { value: "15",  cle: "pourquoi.statCurrencies", icon: "💱" },
  { value: "24h", cle: "pourquoi.statSupport",    icon: "💬" },
];

const WHY_ITEMS = [
  { icon: "📄", cle: "w1" },
  { icon: "✅", cle: "w2" },
  { icon: "💳", cle: "w3" },
  { icon: "🌐", cle: "w4" },
  { icon: "📊", cle: "w5" },
  { icon: "🏅", cle: "w6" },
];

export default function PourquoiVitAuto() {
  // Métadonnées propres à cette page. Sans cet appel, elle hérite du titre
  // générique d'index.html — les 153 URLs du sitemap apparaissaient toutes
  // identiques dans les résultats de recherche (voir hooks/useDocumentMeta.js).
  const { t } = useI18n();
  useDocumentMeta({
    title:       t("pourquoi.metaTitle"),
    description: t("pourquoi.metaDesc"),
    traduite:    true,
  });

  // Décompte réel des annonces publiées — voir GET /api/vehicles/public-stats.
  const [publicStats, setPublicStats] = useState(null);
  useEffect(() => {
    let annule = false;
    fetch("/api/vehicles/public-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!annule && d) setPublicStats(d); })
      .catch(() => { /* la rangée se limite alors aux valeurs de configuration */ });
    return () => { annule = true; };
  }, []);

  const STATS = publicStats?.vehicles
    ? [
        { value: publicStats.vehicles.toLocaleString(), cle: "pourquoi.statVehicles", icon: "🚗" },
        ...STATS_FIXES,
      ]
    : STATS_FIXES;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "48px 24px 96px" }}>

      {/* ── Hero ── */}
      <div style={{
        background: "linear-gradient(135deg, #0f1b3f 0%, #1e3a6e 100%)",
        borderRadius: 24, padding: "52px 44px 48px", marginBottom: 60, color: "#fff",
        textAlign: "center",
      }}>
        <span style={{
          display: "inline-block", background: "rgba(255,77,45,.2)", color: "#ff8060",
          fontSize: "0.72rem", fontWeight: 800, padding: "5px 16px",
          borderRadius: 999, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 20,
        }}>{t("pourquoi.badge")}</span>
        <h1 style={{ margin: "0 0 16px", fontSize: "clamp(1.8rem,3.5vw,2.6rem)", fontWeight: 900, lineHeight: 1.25 }}>
          {t("pourquoi.h1")}
        </h1>
        <p style={{ margin: "0 auto 32px", color: "rgba(255,255,255,.92)", fontSize: "1.05rem", maxWidth: 580, lineHeight: 1.7 }}>
          {t("pourquoi.heroDesc1")}
          <strong style={{ color: "#fff" }}>{t("pourquoi.heroDescStrong")}</strong>{t("pourquoi.heroDesc2")}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/catalogue" style={{
            background: "#ff4d2d", color: "#fff", fontWeight: 800, fontSize: "0.95rem",
            padding: "13px 28px", borderRadius: 12, textDecoration: "none",
            boxShadow: "0 4px 18px rgba(255,77,45,.4)", display: "inline-block",
          }}>
            {t("pourquoi.ctaExplore")}
          </Link>
          <Link to="/register" style={{
            background: "rgba(255,255,255,.12)", color: "#fff", fontWeight: 700, fontSize: "0.9rem",
            padding: "13px 24px", borderRadius: 12, textDecoration: "none",
            border: "1px solid rgba(255,255,255,.25)", display: "inline-block",
          }}>
            {t("pourquoi.ctaAccount")}
          </Link>
        </div>
      </div>

      {/* ── Stats ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))",
        gap: 16, marginBottom: 60,
      }}>
        {STATS.map((s) => (
          <div key={s.cle} style={{
            background: "#fff", border: "1px solid #e8edf5", borderRadius: 16,
            padding: "24px 20px", textAlign: "center",
            boxShadow: "0 2px 12px rgba(15,27,63,.06)",
          }}>
            <div style={{ fontSize: "1.8rem", marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#ff4d2d", lineHeight: 1 }}>{s.value}</div>
            <div style={{ color: "#64748b", fontSize: "0.82rem", marginTop: 6 }}>{t(s.cle)}</div>
          </div>
        ))}
      </div>

      {/* ── Services ── */}
      <h2 style={{
        textAlign: "center", fontSize: "clamp(1.3rem,2.5vw,1.8rem)", fontWeight: 900,
        color: "#0f1b3f", marginBottom: 8,
      }}>
        {t("pourquoi.servicesTitle")}
      </h2>
      <p style={{ textAlign: "center", color: "#64748b", marginBottom: 36, fontSize: "0.95rem" }}>
        {t("pourquoi.servicesSub")}
      </p>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))",
        gap: 20, marginBottom: 60,
      }}>
        {SERVICE_CARDS.map((s) => (
          <div key={s.cle} style={{
            background: "#fff", border: s.highlight ? `2px solid ${s.color}` : "1px solid #e8edf5",
            borderRadius: 18, padding: "28px 24px", position: "relative", overflow: "hidden",
            boxShadow: s.highlight ? `0 4px 20px ${s.color}22` : "0 2px 10px rgba(15,27,63,.05)",
          }}>
            {s.highlight && (
              <div style={{
                position: "absolute", top: 12, right: 14,
                background: s.color, color: "#fff", fontSize: "0.7rem",
                fontWeight: 800, padding: "3px 10px", borderRadius: 99,
              }}>{t("pourquoi.new")}</div>
            )}
            <div style={{
              width: 52, height: 52, background: s.bg, borderRadius: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.6rem", marginBottom: 16,
            }}>{s.icon}</div>
            <h3 style={{ margin: "0 0 10px", fontWeight: 800, color: "#0f1b3f", fontSize: "1.05rem" }}>{t(`pourquoi.card.${s.cle}.title`)}</h3>
            <p style={{ margin: "0 0 18px", color: "#64748b", fontSize: "0.88rem", lineHeight: 1.65 }}>{t(`pourquoi.card.${s.cle}.desc`)}</p>
            <Link to={s.link} style={{
              color: s.color, fontWeight: 700, fontSize: "0.85rem", minHeight: 44,
              textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5,
            }}>
              {t(s.cta || `pourquoi.card.${s.cle}.cta`)} <span>→</span>
            </Link>
          </div>
        ))}
      </div>

      {/* ── Avantages différenciants ── */}
      <div style={{
        background: "#f8fafc", borderRadius: 24, padding: "44px 36px", marginBottom: 56,
      }}>
        <h2 style={{ margin: "0 0 8px", fontWeight: 900, color: "#0f1b3f", fontSize: "clamp(1.2rem,2.5vw,1.6rem)" }}>
          {t("pourquoi.diffTitle")}
        </h2>
        <p style={{ margin: "0 0 32px", color: "#64748b", fontSize: "0.9rem" }}>
          {t("pourquoi.diffSub")}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))", gap: 20 }}>
          {WHY_ITEMS.map((w) => (
            <div key={w.cle} style={{
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
              padding: "22px 20px", display: "flex", gap: 16, alignItems: "flex-start",
            }}>
              <div style={{
                width: 44, height: 44, background: "rgba(255,77,45,.08)", borderRadius: 12,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.4rem", flexShrink: 0,
              }}>{w.icon}</div>
              <div>
                <div style={{ fontWeight: 800, color: "#0f1b3f", fontSize: "0.92rem", marginBottom: 6 }}>{t(`pourquoi.${w.cle}.title`)}</div>
                <div style={{ color: "#64748b", fontSize: "0.84rem", lineHeight: 1.6 }}>{t(`pourquoi.${w.cle}.desc`)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Comparaison ── */}
      <div style={{ marginBottom: 56 }}>
        <h2 style={{ fontWeight: 900, color: "#0f1b3f", marginBottom: 24, fontSize: "clamp(1.2rem,2.5vw,1.5rem)" }}>
          {t("pourquoi.vsTitle")}
        </h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ background: "#0f1b3f", color: "#fff" }}>
                <th style={{ padding: "14px 18px", textAlign: "left", borderRadius: "12px 0 0 0" }}>{t("pourquoi.vsFeature")}</th>
                <th style={{ padding: "14px 18px", textAlign: "center", color: "#ff8060" }}>VIT AUTO</th>
                <th style={{ padding: "14px 18px", textAlign: "center", borderRadius: "0 12px 0 0", color: "rgba(255,255,255,.5)" }}>{t("pourquoi.vsRivals")}</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["pourquoi.vs1", true, false],
                ["pourquoi.vs2", true, false],
                ["pourquoi.vs3", true, false],
                // Annonçait « 14 pays, 8 devises » alors que la même page
                // affiche 28 pays et 15 devises deux écrans plus haut.
                ["pourquoi.vs4", true, false],
                ["pourquoi.vs5", true, true],
                ["pourquoi.vs6", true, false],
                // « Interface FR / EN / AR » : il y en a cinq.
                ["pourquoi.vs7", true, false],
              ].map(([feat, vitAuto, concurr], i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                  <td style={{ padding: "13px 18px", color: "#0f1b3f", fontWeight: 600 }}>{t(feat)}</td>
                  <td style={{ padding: "13px 18px", textAlign: "center", color: vitAuto ? "#10b981" : "#ef4444", fontWeight: 800, fontSize: "1.1rem" }}>
                    {vitAuto ? "✓" : "✗"}
                  </td>
                  <td style={{ padding: "13px 18px", textAlign: "center", color: concurr ? "#10b981" : "#ef4444", fontWeight: 800, fontSize: "1.1rem" }}>
                    {concurr ? "✓" : "✗"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── CTA ── */}
      <div style={{
        textAlign: "center", background: "linear-gradient(135deg, #0f1b3f, #1e3a6e)",
        borderRadius: 20, padding: "48px 32px", color: "#fff",
      }}>
        <h2 style={{ margin: "0 0 12px", fontWeight: 900, fontSize: "clamp(1.3rem,2.5vw,1.8rem)" }}>
          {t("pourquoi.ctaTitle")}
        </h2>
        <p style={{ margin: "0 0 28px", color: "rgba(255,255,255,.92)", fontSize: "0.95rem" }}>
          {t("pourquoi.ctaDesc")}
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/catalogue" style={{
            background: "#ff4d2d", color: "#fff", fontWeight: 800, fontSize: "0.95rem",
            padding: "14px 30px", borderRadius: 12, textDecoration: "none",
            boxShadow: "0 4px 18px rgba(255,77,45,.4)", display: "inline-block",
          }}>
            {t("pourquoi.ctaCatalogue")}
          </Link>
          <Link to="/partenaires" style={{
            background: "rgba(255,255,255,.1)", color: "#fff", fontWeight: 700, fontSize: "0.9rem",
            padding: "14px 26px", borderRadius: 12, textDecoration: "none",
            border: "1px solid rgba(255,255,255,.25)", display: "inline-block",
          }}>
            {t("footer.navBecomePartner")}
          </Link>
        </div>
      </div>

    </div>
  );
}
