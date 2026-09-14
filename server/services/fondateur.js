// ── Statut Partenaire Fondateur en cours ───────────────────────────────────
//
// Une seule définition, partagée par la commission (pricingEngine), les quotas
// d'annonces et les outils par plan : fondateur = dossier d'onboarding marqué
// `isFoundingPartner` ET signé (`commissions.lockedAt` posé) ET douze mois
// non écoulés. Un dossier sans date n'exempte de rien — c'était le défaut
// « réduction éternelle » corrigé le 2026-09-09, on ne le réintroduit nulle
// part.
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import { getConfig } from "./pricingEngine.js";

export async function fondateurActif(userId, now = new Date()) {
  if (!userId) return false;
  const fp = await PartnerOnboarding.findOne({ userId, isFoundingPartner: true })
    .select("commissions.lockedAt").lean();
  const lockedAt = fp?.commissions?.lockedAt;
  if (!lockedAt) return false;
  const config = await getConfig();
  const dureeMs = (config.foundingPartner?.durationMonths ?? 12) * 30.4375 * 24 * 60 * 60 * 1000;
  return now.getTime() - new Date(lockedAt).getTime() < dureeMs;
}
