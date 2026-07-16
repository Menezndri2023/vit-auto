// ── Taux de conversion statiques, mis à jour manuellement ────────────────────
// Miroir server-side de src/context/CurrencyContext.js (EXCHANGE_RATES,
// XOF pivot) — nécessaire ici pour le moteur de calcul d'import (les barèmes
// admin sont saisis en USD, mais une annonce/transaction peut être dans
// n'importe quelle devise supportée). Table = "XOF équivalent à 1 unité de la
// devise". Garder synchronisée avec CurrencyContext.jsx à chaque mise à jour.
export const XOF_RATES = {
  XOF: 1,
  MAD: 60.5,
  EUR: 655.957,
  USD: 600,
  GBP: 765,
  CAD: 450,
  CHF: 680,
  TND: 195,
  DZD: 4.4,
  GNF: 0.065,
  CNY: 84.5,
  AED: 163,
  GHS: 40,
  NGN: 0.4,
};

// Convertit un montant exprimé dans `fromCode` vers `toCode`, en repassant par
// XOF comme pivot (même principe que CurrencyContext.convert côté client).
export function convertAmount(amount, fromCode, toCode) {
  if (amount == null || isNaN(amount)) return null;
  const fromRate = XOF_RATES[fromCode] ?? 1;
  const toRate = XOF_RATES[toCode] ?? 1;
  const amountXOF = amount * fromRate;
  return amountXOF / toRate;
}

export const convertUSD = (amountUSD, toCode) => convertAmount(amountUSD, "USD", toCode);
