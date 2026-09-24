import { useState, useRef } from "react";
import { useI18n } from "../../context/I18nContext";
import styles from "./LanguageSelector.module.css";
import { useFermetureExterieure } from "../../hooks/useFermetureExterieure";

const LanguageSelector = () => {
  const { lang, setLang, SUPPORTED_LANGS } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Voir hooks/useFermetureExterieure : `click` et non `mousedown`.
  useFermetureExterieure(ref, open, () => setOpen(false));

  const current = SUPPORTED_LANGS.find((l) => l.code === lang) || SUPPORTED_LANGS[0];

  return (
    <div className={styles.selector} ref={ref}>
      <button
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Changer de langue"
        title="Langue / Language"
      >
        <span className={styles.flag}>{current.flag}</span>
        <span className={styles.code}>{current.code.toUpperCase()}</span>
        <span className={styles.chevron}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className={styles.dropdown}>
          {SUPPORTED_LANGS.map((l) => (
            <button
              key={l.code}
              className={`${styles.item} ${l.code === lang ? styles.itemActive : ""}`}
              onClick={() => { setLang(l.code); setOpen(false); }}
            >
              <span className={styles.flag}>{l.flag}</span>
              <span className={styles.itemLabel}>{l.label}</span>
              {l.code === lang && <span className={styles.check}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
