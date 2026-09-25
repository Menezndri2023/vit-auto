import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import styles from "./Help.module.css";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { useI18n } from "../context/I18nContext";

// Contenu dans i18n/aide.js, en cinq langues. Deux réponses y ont été
// réalignées sur la FAQ, qui disait autre chose (annulation, étape Founding
// Partner) — le détail est en tête de ce fichier.
const QUESTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

const FAQ = ({ q, a }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={`${styles.faqItem} ${open ? styles.faqOpen : ""}`}>
      <button className={styles.faqQuestion} onClick={() => setOpen((o) => !o)}>
        <span>{q}</span>
        <span className={styles.faqIcon}>{open ? "−" : "+"}</span>
      </button>
      {open && <div className={styles.faqAnswer}>{a}</div>}
    </div>
  );
};

const Help = () => {
  // Métadonnées propres à cette page. Sans cet appel, elle hérite du titre
  // générique d'index.html — les 153 URLs du sitemap apparaissaient toutes
  // identiques dans les résultats de recherche (voir hooks/useDocumentMeta.js).
  const { t } = useI18n();
  useDocumentMeta({
    title:       t("aide.metaTitle"),
    description: t("aide.metaDesc"),
    traduite:    true,
  });

  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.hero}>
        <span className={styles.heroBadge}>{t("aide.metaTitle")}</span>
        <h1>{t("aide.h1")}</h1>
        <p>{t("aide.sub")}</p>
      </section>

      {/* Quick links */}
      <section className={styles.quickLinks}>
        <div className={styles.qlCard} onClick={() => navigate("/catalogue")}>
          <span className={styles.qlIcon}>🚗</span>
          <h3>{t("aide.qlVehicles")}</h3>
          <p>{t("aide.qlVehiclesSub")}</p>
        </div>
        <div className={styles.qlCard} onClick={() => navigate(isAuthenticated ? "/profile" : "/login")}>
          <span className={styles.qlIcon}>👤</span>
          <h3>{t("aide.qlAccount")}</h3>
          <p>{t(isAuthenticated ? "aide.qlAccountIn" : "aide.qlAccountOut")}</p>
        </div>
        <div className={styles.qlCard} onClick={() => navigate("/services")}>
          <span className={styles.qlIcon}>🛡️</span>
          <h3>{t("aide.qlServices")}</h3>
          <p>{t("aide.qlServicesSub")}</p>
        </div>
        <div className={styles.qlCard} onClick={() => navigate("/import-export")}>
          <span className={styles.qlIcon}>🌍</span>
          <h3>{t("nav.importExport")}</h3>
          <p>{t("aide.qlIESub")}</p>
        </div>
      </section>

      {/* FAQ */}
      <section className={styles.faqSection}>
        <div className={styles.sectionHeader}>
          <h2>{t("faq.metaTitle")}</h2>
          <p>{t("aide.contactSub")}</p>
        </div>
        <div className={styles.faqList}>
          {QUESTIONS.map((i) => (
            <FAQ key={i} q={t(`aide.q${i}`)} a={t(`aide.a${i}`)} />
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className={styles.contact}>
        <div className={styles.contactCard}>
          <div className={styles.contactIcon}>✉️</div>
          <h3>{t("aide.email")}</h3>
          <p>{t("aide.emailSub")}</p>
          <a href="mailto:contact@vit-auto.com" className={styles.contactBtn}>
            contact@vit-auto.com
          </a>
        </div>
        <div className={styles.contactCard}>
          <div className={styles.contactIcon}>📞</div>
          <h3>{t("aide.phone")}</h3>
          <p>{t("aide.phoneSub")}</p>
          <a href="tel:+212607742672" className={styles.contactBtn}>
            +212 6 07 74 26 72
          </a>
        </div>
        <div className={styles.contactCard}>
          <div className={styles.contactIcon}>💬</div>
          <h3>WhatsApp</h3>
          <p>{t("aide.whatsappSub")}</p>
          <a href="https://wa.me/212607742672" target="_blank" rel="noopener noreferrer" className={styles.contactBtn}>
            {t("aide.openWhatsapp")}
          </a>
        </div>
      </section>
    </div>
  );
};

export default Help;
