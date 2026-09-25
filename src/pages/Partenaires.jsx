import { Link } from "react-router-dom";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { useI18n } from "../context/I18nContext";

const Li = ({ children }) => (
  <li style={{ marginBottom: 8, display: "flex", gap: 10, alignItems: "flex-start" }}>
    <span style={{ color: "#ff4d2d", flexShrink: 0, fontSize: "1rem" }}>✓</span>
    <span style={{ color: "#4a5876", fontSize: "0.92rem", lineHeight: 1.6 }}>{children}</span>
  </li>
);

const BenefitCard = ({ icon, title, desc }) => (
  <div style={{
    background: "#fff", border: "1px solid #e8edf5", borderRadius: 16,
    padding: "28px 24px", textAlign: "center", boxShadow: "0 2px 12px rgba(15,27,63,.06)",
    transition: "transform .2s, box-shadow .2s",
  }}>
    <div style={{ fontSize: "2.2rem", marginBottom: 14 }}>{icon}</div>
    <h3 style={{ margin: "0 0 10px", fontSize: "1rem", fontWeight: 800, color: "#0f1b3f" }}>{title}</h3>
    <p style={{ margin: 0, color: "#64748b", fontSize: "0.88rem", lineHeight: 1.65 }}>{desc}</p>
  </div>
);

const STEPS = [
  { n: "1", cle: "s1", icon: "📝" },
  { n: "2", cle: "s2", icon: "🚗" },
  { n: "3", cle: "s3", icon: "📥" },
  { n: "4", cle: "s4", icon: "💳" },
];

const AVANTAGES = [
  { icon: "🌍", cle: "b1" }, { icon: "📄", cle: "b2" }, { icon: "🚚", cle: "b3" },
  { icon: "💳", cle: "b4" }, { icon: "📊", cle: "b5" }, { icon: "🔒", cle: "b6" },
];

const FONDATEUR = [
  { icon: "🎁", cle: "f1" }, { icon: "💸", cle: "f2" }, { icon: "🏅", cle: "f3" },
  { icon: "📢", cle: "f4" }, { icon: "🔓", cle: "f5" },
];

const PROFILS = [
  { icon: "🏢", cle: "w1" }, { icon: "🏪", cle: "w2" },
  { icon: "👤", cle: "w3" }, { icon: "👨‍✈️", cle: "w4" },
];

// Grille de commissions. Les taux sont ceux réellement facturés
// (server/scripts/setCommissionRates.mjs) ; la ligne « pièces détachées »
// manquait, et les frais de service annonçaient « 15 DH fixe » là où le moteur
// applique max(1 $US ; 0,5 %) plafonné à 25 $US.
const COMMISSIONS = [
  { cle: "rental",     standard: "15 %", founder: "10 %", icon: "🚗" },
  { cle: "sale",       standard: "5 %",  founder: "3 %",  icon: "🏷️" },
  { cle: "export",     standard: "5 %",  founder: "3 %",  icon: "🌍" },
  { cle: "driver",     standard: "15 %", founder: "10 %", icon: "👨‍✈️" },
  { cle: "leisure",    standard: "15 %", founder: "10 %", icon: "🎈" },
  { cle: "parts",      standard: "10 %", founder: "7 %",  icon: "🔩" },
  { cle: "insurance",  standardCle: "part.negotiated", founderCle: "part.negotiated", icon: "🛡️" },
  { cle: "serviceFee", standardCle: "part.c.serviceFeeValue", founderCle: "part.c.serviceFeeValue", icon: "⚙️" },
];

const FOURNIR = ["p1", "p2", "p3", "p4", "p5", "p6"];

export default function Partenaires() {
  // Métadonnées propres à cette page. Sans cet appel, elle hérite du titre
  // générique d'index.html — les 153 URLs du sitemap apparaissaient toutes
  // identiques dans les résultats de recherche (voir hooks/useDocumentMeta.js).
  const { t } = useI18n();
  useDocumentMeta({
    title:       t("part.metaTitle"),
    description: t("part.metaDesc"),
    traduite:    true,
  });

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "48px 24px 96px" }}>

      {/* ── Hero ── */}
      <div style={{
        background: "linear-gradient(135deg, #0f1b3f 0%, #1e3a6e 60%, #ff4d2d22 100%)",
        borderRadius: 24, padding: "46px 40px 42px", marginBottom: 50, color: "#fff",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: -40, right: -40, width: 200, height: 200,
          background: "rgba(255,77,45,.12)", borderRadius: "50%",
        }} />
        <span style={{
          display: "inline-block", background: "rgba(255,77,45,.22)", color: "#ff8060",
          fontSize: "0.72rem", fontWeight: 800, padding: "4px 14px",
          borderRadius: 999, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16,
        }}>{t("part.badge")}</span>
        <h1 style={{ margin: "0 0 12px", fontSize: "clamp(1.6rem,3vw,2.3rem)", fontWeight: 900, lineHeight: 1.2 }}>
          {t("part.h1a")}<br />
          <span style={{ color: "#ff6b4a" }}>{t("part.h1b")}</span>
        </h1>
        <p style={{ margin: "0 0 26px", color: "rgba(255,255,255,.92)", fontSize: "0.97rem", maxWidth: 540, lineHeight: 1.65 }}>
          {t("part.heroDesc")}
        </p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Link to="/register?role=partenaire" style={{
            background: "#ff4d2d", color: "#fff", fontWeight: 800, fontSize: "0.95rem",
            padding: "14px 28px", borderRadius: 12, textDecoration: "none",
            boxShadow: "0 4px 18px rgba(255,77,45,.45)", display: "inline-block",
          }}>
            {t("part.becomeCta")}
          </Link>
          <Link to="/partner-pms" style={{
            background: "rgba(255,255,255,.15)", color: "#fff", fontWeight: 700, fontSize: "0.92rem",
            padding: "14px 28px", borderRadius: 12, textDecoration: "none",
            border: "1px solid rgba(255,255,255,.3)", display: "inline-block",
          }}>
            {t("part.hubCta")}
          </Link>
          <a href="#offre-fondateur" style={{
            background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.85)", fontWeight: 700, fontSize: "0.88rem",
            padding: "14px 24px", borderRadius: 12, textDecoration: "none",
            border: "1px solid rgba(255,255,255,.15)", display: "inline-block",
          }}>
            {t("part.seeFounder")}
          </a>
        </div>
      </div>

      {/* ── Offre Fondateur ── */}
      <div id="offre-fondateur" style={{
        background: "linear-gradient(135deg, #fffbf0 0%, #fff7ed 100%)",
        border: "2px solid #fbbf24", borderRadius: 22, padding: "36px 34px",
        marginBottom: 48, position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: 0, right: 0,
          background: "#fbbf24", color: "#7c2d12", fontWeight: 900,
          fontSize: "0.72rem", padding: "7px 18px", borderRadius: "0 22px 0 14px",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          {t("part.mandatory")}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: "2rem" }}>👑</span>
          <div>
            <h2 style={{ margin: 0, fontSize: "clamp(1.2rem,2.2vw,1.65rem)", fontWeight: 900, color: "#0f1b3f" }}>
              {t("part.founderTitle")}
            </h2>
            <p style={{ margin: "3px 0 0", color: "#92400e", fontWeight: 700, fontSize: "0.85rem" }}>
              {t("part.founderSub")}
            </p>
          </div>
        </div>

        <p style={{ color: "#78350f", fontSize: "0.9rem", lineHeight: 1.65, marginBottom: 26, maxWidth: 580 }}>
          {t("part.founderDesc")}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 16, marginBottom: 28 }}>
          {FONDATEUR.map((item) => (
            <div key={item.cle} style={{
              background: "#fff", border: "1px solid #fde68a", borderRadius: 14,
              padding: "18px 16px", boxShadow: "0 2px 8px rgba(251,191,36,.12)",
            }}>
              <div style={{ fontSize: "1.6rem", marginBottom: 8 }}>{item.icon}</div>
              <div style={{ fontWeight: 800, color: "#0f1b3f", fontSize: "0.9rem", marginBottom: 5 }}>{t(`part.${item.cle}.label`)}</div>
              <div style={{ color: "#78350f", fontSize: "0.82rem", lineHeight: 1.55 }}>{t(`part.${item.cle}.desc`)}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <Link to="/register?role=partenaire" style={{
            background: "#f59e0b", color: "#fff", fontWeight: 900, fontSize: "0.95rem",
            padding: "13px 30px", borderRadius: 11, textDecoration: "none",
            boxShadow: "0 4px 18px rgba(245,158,11,.4)", display: "inline-block",
          }}>
            {t("part.becomeCta")}
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              display: "flex", gap: -8, alignItems: "center",
            }}>
              {["👤","👤","👤"].map((u, i) => (
                <span key={i} style={{
                  display: "inline-flex", width: 32, height: 32, background: "#fde68a",
                  borderRadius: "50%", alignItems: "center", justifyContent: "center",
                  fontSize: "0.9rem", border: "2px solid #fff",
                  marginLeft: i === 0 ? 0 : -8,
                }}>{u}</span>
              ))}
            </div>
            <span style={{ color: "#92400e", fontSize: "0.85rem", fontWeight: 700 }}>
              {t("part.founderWindow")}
            </span>
          </div>
        </div>
      </div>

      {/* ── Avantages ── */}
      <h2 style={{
        textAlign: "center", fontSize: "clamp(1.3rem,2.5vw,1.7rem)", fontWeight: 900,
        color: "#0f1b3f", marginBottom: 8,
      }}>
        {t("part.whyTitle")}
      </h2>
      <p style={{ textAlign: "center", color: "#64748b", marginBottom: 36, fontSize: "0.95rem" }}>
        {t("part.whySub")}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 20, marginBottom: 56 }}>
        {AVANTAGES.map((a) => (
          <BenefitCard key={a.cle} icon={a.icon} title={t(`part.${a.cle}.title`)} desc={t(`part.${a.cle}.desc`)} />
        ))}
      </div>

      {/* ── Types de partenaires ── */}
      <div style={{
        background: "#f8fafc", borderRadius: 20, padding: "40px 36px", marginBottom: 56,
      }}>
        <h2 style={{ margin: "0 0 28px", fontSize: "1.3rem", fontWeight: 900, color: "#0f1b3f" }}>
          {t("part.whoTitle")}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))", gap: 16 }}>
          {PROFILS.map((profil) => (
            <div key={profil.cle} style={{
              background: "#fff", borderRadius: 14, padding: "22px 20px",
              border: "1px solid #e2e8f0",
            }}>
              <div style={{ fontSize: "1.8rem", marginBottom: 10 }}>{profil.icon}</div>
              <div style={{ fontWeight: 800, color: "#0f1b3f", fontSize: "0.95rem", marginBottom: 6 }}>{t(`part.${profil.cle}.title`)}</div>
              <div style={{ color: "#64748b", fontSize: "0.86rem", lineHeight: 1.6 }}>{t(`part.${profil.cle}.desc`)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Comment ça marche ── */}
      <h2 style={{
        textAlign: "center", fontSize: "clamp(1.3rem,2.5vw,1.7rem)", fontWeight: 900,
        color: "#0f1b3f", marginBottom: 36,
      }}>
        {t("part.howTitle")}
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 20, marginBottom: 56 }}>
        {STEPS.map((s) => (
          <div key={s.n} style={{ textAlign: "center" }}>
            <div style={{
              width: 52, height: 52, background: "#0f1b3f", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 14px", fontSize: "1.1rem", fontWeight: 900, color: "#fff",
            }}>{s.n}</div>
            <div style={{ fontSize: "1.5rem", marginBottom: 10 }}>{s.icon}</div>
            <h3 style={{ margin: "0 0 8px", fontWeight: 800, color: "#0f1b3f", fontSize: "0.95rem" }}>{t(`part.${s.cle}.title`)}</h3>
            <p style={{ margin: 0, color: "#64748b", fontSize: "0.86rem", lineHeight: 1.6 }}>{t(`part.${s.cle}.desc`)}</p>
          </div>
        ))}
      </div>

      {/* ── Commissions ── */}
      <div style={{
        background: "linear-gradient(135deg, #0f1b3f 0%, #1e3a6e 100%)",
        borderRadius: 20, padding: "40px 36px", marginBottom: 56, color: "#fff",
      }}>
        <h2 style={{ margin: "0 0 8px", fontWeight: 900, fontSize: "1.3rem", color: "#ffffff", textShadow: "0 2px 16px rgba(0,0,0,.4)" }}>{t("part.commTitle")}</h2>
        <p style={{ margin: "0 0 28px", color: "rgba(255,255,255,.92)", fontSize: "0.9rem" }}>
          {t("part.commDesc")}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px,1fr))", gap: 16 }}>
          {COMMISSIONS.map((c) => (
            <div key={c.cle} style={{
              background: "rgba(255,255,255,.08)", borderRadius: 14, padding: "22px 20px",
              border: "1px solid rgba(255,255,255,.12)",
            }}>
              <div style={{ fontSize: "1.5rem", marginBottom: 10 }}>{c.icon}</div>
              <div style={{ fontWeight: 800, fontSize: "1rem", marginBottom: 12 }}>{t(`part.c.${c.cle}`)}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "rgba(255,255,255,.85)", fontSize: "0.82rem" }}>{t("part.standard")}</span>
                <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{c.standard || t(c.standardCle)}</span>
              </div>
              <div style={{
                display: "flex", justifyContent: "space-between",
                background: "rgba(255,215,0,.15)", borderRadius: 8, padding: "6px 10px",
              }}>
                <span style={{ color: "#ffd700", fontSize: "0.82rem", fontWeight: 700 }}>{t("part.founder")}</span>
                <span style={{ color: "#ffd700", fontWeight: 900, fontSize: "0.9rem" }}>{c.founder || t(c.founderCle)}</span>
              </div>
              <div style={{ color: "rgba(255,255,255,.70)", fontSize: "0.76rem", marginTop: 8 }}>{t(`part.c.${c.cle}Note`)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Conditions partenaires ── */}
      <div style={{
        background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16,
        padding: "28px 28px", marginBottom: 40,
      }}>
        <h3 style={{ margin: "0 0 16px", fontWeight: 800, color: "#0f1b3f", fontSize: "1rem" }}>
          {t("part.provideTitle")}
        </h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {FOURNIR.map((cle) => <Li key={cle}>{t(`part.${cle}`)}</Li>)}
        </ul>
      </div>

      {/* ── Partner Hub PMS ── */}
      <div style={{
        background: "linear-gradient(135deg, #1e293b 0%, #0f1b3f 100%)",
        borderRadius: 20, padding: "36px 36px", marginBottom: 40,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 28, flexWrap: "wrap", position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: -40, left: -40, width: 180, height: 180,
          background: "rgba(59,130,246,.07)", borderRadius: "50%",
        }} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <span style={{
            display: "inline-block", background: "rgba(59,130,246,.18)", color: "#60a5fa",
            fontSize: "0.70rem", fontWeight: 800, padding: "4px 12px",
            borderRadius: 999, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12,
          }}>{t("part.hubBadge")}</span>
          <h3 style={{ margin: "0 0 10px", fontWeight: 900, color: "#fff", fontSize: "clamp(1.1rem,2vw,1.4rem)" }}>
            {t("part.hubTitle")}
          </h3>
          <p style={{ margin: 0, color: "rgba(255,255,255,.85)", fontSize: "0.88rem", lineHeight: 1.65, maxWidth: 500 }}>
            {t("part.hubDesc")}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            {["🎯 Lead Management","📄 Quotation Builder","🏪 Showroom","📊 Analytics","⭐ Trust Score"].map((f) => (
              <span key={f} style={{
                background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.8)",
                fontSize: "0.75rem", fontWeight: 600, padding: "4px 10px",
                borderRadius: 8, border: "1px solid rgba(255,255,255,.12)",
              }}>{f}</span>
            ))}
          </div>
        </div>
        <Link to="/partner-pms" style={{
          background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", color: "#fff",
          fontWeight: 800, fontSize: "0.90rem", padding: "13px 26px",
          borderRadius: 11, textDecoration: "none", whiteSpace: "nowrap",
          boxShadow: "0 4px 18px rgba(59,130,246,.35)", flexShrink: 0,
        }}>
          {t("part.hubCta2")}
        </Link>
      </div>

      {/* ── Import / Export ── */}
      <div style={{
        background: "linear-gradient(135deg, #0a1429 0%, #0f1b3f 100%)",
        borderRadius: 20, padding: "36px 36px", marginBottom: 40,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 28, flexWrap: "wrap", position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: -50, right: -50, width: 180, height: 180,
          background: "rgba(255,77,45,.07)", borderRadius: "50%",
        }} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <span style={{
            display: "inline-block", background: "rgba(255,77,45,.18)", color: "#ff7a5c",
            fontSize: "0.70rem", fontWeight: 800, padding: "4px 12px",
            borderRadius: 999, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12,
          }}>{t("part.ieBadge")}</span>
          <h3 style={{ margin: "0 0 10px", fontWeight: 900, color: "#fff", fontSize: "clamp(1.1rem,2vw,1.4rem)" }}>
            {t("svc.ie.title")}
          </h3>
          <p style={{ margin: 0, color: "rgba(255,255,255,.92)", fontSize: "0.88rem", lineHeight: 1.65, maxWidth: 460 }}>
            {t("part.ieDesc")}
          </p>
        </div>
        <Link to="/import-export" style={{
          background: "linear-gradient(135deg, #ff4d2d, #e03519)", color: "#fff",
          fontWeight: 800, fontSize: "0.90rem", padding: "13px 26px",
          borderRadius: 11, textDecoration: "none", whiteSpace: "nowrap",
          boxShadow: "0 4px 18px rgba(255,77,45,.35)", flexShrink: 0,
        }}>
          {t("part.ieCta")}
        </Link>
      </div>

      {/* ── CTA final ── */}
      <div style={{
        textAlign: "center", background: "linear-gradient(135deg, #ff4d2d, #ff6b4a)",
        borderRadius: 20, padding: "48px 32px", color: "#fff",
      }}>
        <h2 style={{ margin: "0 0 12px", fontWeight: 900, fontSize: "clamp(1.3rem,2.5vw,1.8rem)" }}>
          {t("part.ctaTitle")}
        </h2>
        <p style={{ margin: "0 0 28px", color: "rgba(255,255,255,.8)", fontSize: "0.95rem" }}>
          {t("part.ctaDesc")}
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/register?role=partenaire" style={{
            background: "#fff", color: "#ff4d2d", fontWeight: 900, fontSize: "0.95rem",
            padding: "14px 32px", borderRadius: 12, textDecoration: "none",
            boxShadow: "0 4px 16px rgba(0,0,0,.2)", display: "inline-block",
          }}>
            {t("part.ctaStart")}
          </Link>
          <Link to="/conditions-partenaires" style={{
            background: "rgba(255,255,255,.15)", color: "#fff", fontWeight: 700, fontSize: "0.9rem",
            padding: "14px 28px", borderRadius: 12, textDecoration: "none",
            border: "1px solid rgba(255,255,255,.3)", display: "inline-block",
          }}>
            {t("part.ctaTerms")}
          </Link>
        </div>
      </div>

    </div>
  );
}
