import { useState, useRef, useEffect } from "react";
import { useCurrency } from "../../context/CurrencyContext";
import styles from "./CurrencySelector.module.css";

/**
 * Sélecteur de devise compact — utilisé dans Booking (sidebar) et VendorSubmit (champs prix).
 *
 * Props :
 *  - variant : "sidebar" (gros, avec libellé) | "inline" (petit, intégré à un champ)
 *  - label   : texte affiché au-dessus (optionnel)
 */
const CurrencySelector = ({ variant = "sidebar", label }) => {
  const { currencyCode, setCurrency, currentCurrency, CURRENCIES, detecting } = useCurrency();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (variant === "inline") {
    return (
      <div className={styles.inlineWrapper} ref={ref}>
        <button
          type="button"
          className={`${styles.inlineTrigger} ${open ? styles.open : ""}`}
          onClick={() => setOpen((o) => !o)}
          title="Changer de devise"
        >
          <span className={styles.flag}>{currentCurrency.flag}</span>
          <span className={styles.symbol}>{currentCurrency.symbol}</span>
          <span className={styles.chevron}>▼</span>
        </button>

        {open && (
          <div className={`${styles.dropdown} ${styles.dropdownRight}`}>
            {CURRENCIES.map((c) => (
              <button
                key={c.code}
                type="button"
                className={`${styles.item} ${c.code === currencyCode ? styles.active : ""}`}
                onClick={() => { setCurrency(c.code); setOpen(false); }}
              >
                <span className={styles.flag}>{c.flag}</span>
                <span className={styles.itemName}>{c.name}</span>
                <span className={styles.itemSymbol}>{c.symbol}</span>
                {c.code === currencyCode && <span className={styles.check}>✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // variant === "sidebar"
  return (
    <div className={styles.sidebarWrapper} ref={ref}>
      {label && <p className={styles.sidebarLabel}>{label}</p>}

      <button
        type="button"
        className={`${styles.sidebarTrigger} ${open ? styles.open : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        <div className={styles.sidebarLeft}>
          <span className={styles.flag}>{currentCurrency.flag}</span>
          <div>
            <span className={styles.sidebarName}>{currentCurrency.name}</span>
            <span className={styles.sidebarSymbol}>{currentCurrency.symbol}</span>
          </div>
        </div>
        <span className={styles.chevron}>{open ? "▲" : "▼"}</span>
      </button>

      {detecting && (
        <p className={styles.detectingMsg}>📍 Détection de votre devise…</p>
      )}

      {open && (
        <div className={styles.dropdown}>
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              type="button"
              className={`${styles.item} ${c.code === currencyCode ? styles.active : ""}`}
              onClick={() => { setCurrency(c.code); setOpen(false); }}
            >
              <span className={styles.flag}>{c.flag}</span>
              <div className={styles.itemInfo}>
                <span className={styles.itemName}>{c.name}</span>
                <span className={styles.itemCode}>{c.code}</span>
              </div>
              <span className={styles.itemSymbol}>{c.symbol}</span>
              {c.code === currencyCode && <span className={styles.check}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CurrencySelector;
