import { useCurrency } from "../../context/CurrencyContext";
import styles from "./PriceTag.module.css";

// Affiche un prix converti dans la devise active du visiteur (détectée par
// géolocalisation IP/GPS, voir CurrencyContext) avec, en discret à côté, le
// prix réel d'origine quand il diffère — soit le montant USD stocké
// (Vehicle/Booking), soit la devise choisie par le partenaire (annonces
// Import/Export via `sourceCurrency`).
//
// `pinnedCurrency` (Vehicle.currency) prend le pas sur tout le reste : le
// partenaire/admin a explicitement choisi d'afficher CETTE annonce dans une
// devise fixe pour tous les visiteurs, quel que soit leur pays détecté — pas
// de double affichage dans ce cas, la devise est un choix assumé, pas une
// conversion informative.
//
// `enteredAmount`/`enteredCurrency` (Vehicle.pricePerDayEntered|priceForSaleEntered
// + priceEntryCurrency) : bug réel corrigé (audit) — sans ça, un prix ressaisi
// pile rond (ex. 350 MAD) était toujours reconverti depuis l'USD arrondi en
// stockage (350 → 35.29 USD → 349,99 MAD ré-affiché), une perte de précision
// à l'aller-retour. Quand la devise affichée correspond exactement à celle de
// la saisie, on affiche ce montant tel quel plutôt que de le recalculer.
export default function PriceTag({ amountUSD, amount, sourceCurrency, pinnedCurrency, enteredAmount, enteredCurrency, suffix = "", compact = false, className = "" }) {
  const { fmtDual, fmtPinned, fmtFromCurrencyDual, formatLiteral, currentCurrency } = useCurrency();

  const displayCode = pinnedCurrency || currentCurrency.code;
  const hasExactEntry = enteredAmount != null && enteredCurrency && enteredCurrency === displayCode;

  let primary, secondary;
  if (hasExactEntry) {
    primary = formatLiteral(enteredAmount, enteredCurrency);
    secondary = null;
  } else if (pinnedCurrency) {
    primary = fmtPinned(amountUSD, pinnedCurrency);
    secondary = null;
  } else if (sourceCurrency) {
    ({ primary, secondary } = fmtFromCurrencyDual(amount, sourceCurrency));
  } else {
    ({ primary, secondary } = fmtDual(amountUSD));
  }

  return (
    <span className={`${styles.wrap} ${compact ? styles.compact : ""} ${className}`}>
      <span className={styles.primary}>{primary}{suffix}</span>
      {secondary && <span className={styles.secondary}>réel : {secondary}{suffix}</span>}
    </span>
  );
}
