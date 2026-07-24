import { useCurrency } from "../../context/CurrencyContext";
import styles from "./PriceTag.module.css";

// Affiche un prix converti dans la devise active du visiteur (détectée par
// géolocalisation IP/GPS, voir CurrencyContext) avec, en discret à côté, le
// prix réel d'origine quand il diffère — soit le montant USD stocké
// (Vehicle/Booking), soit la devise choisie par le partenaire (annonces
// Import/Export via `sourceCurrency`).
export default function PriceTag({ amountUSD, amount, sourceCurrency, suffix = "", compact = false, className = "" }) {
  const { fmtDual, fmtFromCurrencyDual } = useCurrency();
  const { primary, secondary } = sourceCurrency
    ? fmtFromCurrencyDual(amount, sourceCurrency)
    : fmtDual(amountUSD);

  return (
    <span className={`${styles.wrap} ${compact ? styles.compact : ""} ${className}`}>
      <span className={styles.primary}>{primary}{suffix}</span>
      {secondary && <span className={styles.secondary}>réel : {secondary}{suffix}</span>}
    </span>
  );
}
