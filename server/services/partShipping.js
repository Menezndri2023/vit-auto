// ── Frais de livraison d'une pièce détachée ────────────────────────────────
//
// Une pièce est TOUJOURS livrée (règle du secteur, 2026-09-14). Le partenaire
// choisit sur l'annonce comment il facture cette livraison (voir
// constants/spareParts.js PART_SHIPPING_MODES) ; ce module calcule le montant
// en USD pour une commande donnée. Point de passage unique : le devis affiché
// au client (partController.quoteShipping) et le montant facturé
// (bookingController, branche "piece") passent par la même fonction — jamais
// deux calculs qui divergent.
import { resolveDeliveryFee, detectCountryFromCoords } from "./deliveryFee.js";
import { convertAmount } from "./currencyEngine.js";

/**
 * La zone tarifaire qui couvre le pays de destination, s'il y en a une.
 *
 * Première zone gagnante : l'ordre de saisie du partenaire fait foi. Deux
 * zones qui se chevauchent sont une erreur de saisie, pas un cas à arbitrer
 * — et un arbitrage silencieux (la moins chère ? la plus chère ?) serait
 * impossible à expliquer au client comme au partenaire.
 */
export function zoneDeLivraison(part, destCountry) {
  const pays = String(destCountry || "").trim().toUpperCase();
  if (!pays) return null;
  return (part.shipping?.zones || []).find((z) =>
    (z.countries || []).some((c) => String(c).trim().toUpperCase() === pays)) || null;
}

export async function calculerLivraisonPiece(part, { quantity = 1, clientLat = null, clientLng = null, destCountry = null } = {}) {
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const sousTotal = (part.price || 0) * qty;
  const mode = part.shipping?.mode || "forfait";

  if (mode === "gratuit") return { feeUSD: 0, mode, detail: "Livraison offerte" };

  if (mode === "forfait") {
    // Une zone tarifaire l'emporte sur le forfait unique. Sans zone qui
    // corresponde, on retombe exactement sur le comportement d'avant : le
    // palier gratuit ne perd rien.
    const zone = zoneDeLivraison(part, destCountry);
    const forfait = Number(zone ? zone.forfaitUSD : part.shipping?.forfaitUSD) || 0;
    const seuil = zone ? zone.freeAboveUSD : part.shipping?.freeAboveUSD;
    const suffixe = zone ? ` (zone ${(zone.countries || []).join(", ")})` : "";
    if (seuil != null && seuil >= 0 && sousTotal >= seuil) {
      return { feeUSD: 0, mode, zone: zone || null, detail: `Livraison offerte (montant de commande atteint)${suffixe}` };
    }
    return {
      feeUSD: forfait, mode, zone: zone || null,
      detail: (forfait > 0 ? "Forfait de livraison" : "Livraison offerte") + suffixe,
      ...(zone && zone.deliveryDaysMin != null ? { deliveryDaysMin: zone.deliveryDaysMin, deliveryDaysMax: zone.deliveryDaysMax } : {}),
    };
  }

  // Selon la distance : il faut les deux positions ; sans celle du client,
  // le devis n'est pas encore calculable (le client la fournit au paiement).
  const pLat = part.coordonnees?.lat, pLng = part.coordonnees?.lng;
  if (clientLat == null || clientLng == null || pLat == null || pLng == null) {
    return { feeUSD: null, mode, detail: "Calculée à la commande selon l'adresse de livraison" };
  }
  const countryCode = detectCountryFromCoords(clientLat, clientLng) || part.country || "CI";
  const fee = await resolveDeliveryFee({ clientLat, clientLng, vehicleLat: pLat, vehicleLng: pLng, countryCode });
  if (!fee || fee.fee == null) return { feeUSD: null, mode, detail: "Distance non calculable" };
  const feeUSD = (await convertAmount(fee.fee, fee.currency, "USD")) ?? 0;
  return { feeUSD: Math.round(feeUSD * 100) / 100, mode, distanceKm: fee.distanceKm, detail: `${fee.distanceKm} km — ${fee.feeDisplay || ""}`.trim() };
}

// Frais d'importation (transport international + douane), annoncés sur
// l'annonce et facturés une fois par commande, quel que soit le nombre
// d'unités — le partenaire les fixe à la publication.
export function fraisImportationPiece(part) {
  if (part.saleMode !== "import") return 0;
  return Math.max(0, Number(part.importInfo?.feesUSD) || 0);
}
