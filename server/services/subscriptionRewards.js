// ═══════════════════════════════════════════════════════════════════════════
// RÉCOMPENSES D'ABONNEMENT — essai gratuit et parrainage partenaire
// ═══════════════════════════════════════════════════════════════════════════
// Deux mécanismes qui allongent une période d'abonnement sans encaissement.
// Regroupés ici parce qu'ils partagent le même point délicat : prolonger une
// date sans jamais la RACCOURCIR, et sans jamais faire repartir d'aujourd'hui
// un abonnement qui courait encore.
import logger from "../utils/logger.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { planActifDe } from "./planAccess.js";

export const DUREE_ESSAI_JOURS = 30;
export const MOIS_PAR_PARRAINAGE = 1;

// Ajoute des mois à une échéance en partant de la PLUS TARDIVE entre « la fin
// actuelle » et « maintenant ». Partir systématiquement d'aujourd'hui
// raccourcirait l'abonnement d'un partenaire à qui il restait trois semaines ;
// partir systématiquement de l'échéance donnerait des mois rétroactifs, déjà
// écoulés, à un abonnement expiré depuis un an.
export function prolonger(finActuelle, mois) {
  const base = finActuelle && new Date(finActuelle) > new Date() ? new Date(finActuelle) : new Date();
  const fin = new Date(base);
  fin.setMonth(fin.getMonth() + mois);
  return fin;
}

// ── Essai gratuit accordé par le support ───────────────────────────────────
//
// Renvoie { ok, code, message, subscription }. Ne lève pas : l'appelant est un
// contrôleur admin qui doit pouvoir répondre un refus explicite.
export async function accorderEssai(vendorId, planTier, { jours = DUREE_ESSAI_JOURS } = {}) {
  const sub = await Subscription.findOne({ vendor: vendorId })
    || await Subscription.create({ vendor: vendorId, plan: "free" });

  if (sub.trialUsedAt) {
    return { ok: false, code: "ESSAI_DEJA_UTILISE", message: "Ce compte a déjà bénéficié d'un essai gratuit." };
  }
  // Un essai par-dessus un abonnement payé le remplacerait par une période
  // gratuite — et ferait perdre au partenaire ce qu'il a déjà réglé.
  if (planActifDe(sub)) {
    return { ok: false, code: "PLAN_DEJA_ACTIF", message: "Ce compte a déjà un abonnement actif. L'essai est réservé aux comptes sans formule en cours." };
  }

  const startDate = new Date();
  const endDate   = new Date(Date.now() + jours * 24 * 60 * 60 * 1000);
  sub.plan = planTier;
  sub.planDetails = { startDate, endDate, isActive: true, priceUSD: 0, isTrial: true };
  sub.trialUsedAt = startDate;
  await sub.save();

  await Notification.create({
    user: vendorId,
    type: "system",
    titre: "🎁 Votre essai VIT AUTO est ouvert",
    message: `Le plan « ${planTier} » est actif gratuitement jusqu'au ${endDate.toLocaleDateString("fr-FR")}. Classement prioritaire, mises en avant incluses, statistiques et assistance prioritaire — sans engagement.`,
    lien: "/vendor/pro",
  }).catch((e) => logger.error("notification essai (non bloquant) :", e.message));

  return { ok: true, subscription: sub, endDate };
}

// ── Parrainage : le filleul vient d'être activé ────────────────────────────
//
// Appelé au moment où l'abonnement d'un FILLEUL est confirmé par un
// administrateur. Volontairement non bloquant : une récompense manquée ne doit
// jamais faire échouer l'activation elle-même, qui est ce que le partenaire a
// payé.
export async function recompenserParrain(filleulId) {
  try {
    const filleul = await User.findById(filleulId).select("referredBy firstName lastName").lean();
    if (!filleul?.referredBy) return null;
    // Un compte qui se parraine lui-même (même identifiant après une fusion,
    // ou saisie de son propre code) ne doit rien rapporter.
    if (String(filleul.referredBy) === String(filleulId)) return null;

    const parrain = await Subscription.findOne({ vendor: filleul.referredBy })
      || await Subscription.create({ vendor: filleul.referredBy, plan: "free" });

    // Un même filleul ne rapporte qu'une fois, même si son abonnement est
    // confirmé à nouveau (renouvellement, second paiement, double clic).
    if ((parrain.referralRewarded || []).some((id) => String(id) === String(filleulId))) return null;
    parrain.referralRewarded.push(filleulId);

    let message;
    if (planActifDe(parrain)) {
      // Abonnement en cours : la récompense est appliquée tout de suite, c'est
      // ce qui se voit le mieux.
      parrain.planDetails.endDate = prolonger(parrain.planDetails.endDate, MOIS_PAR_PARRAINAGE);
      message = `${filleul.firstName || "Un partenaire"} que vous avez parrainé vient de souscrire. Votre abonnement est prolongé jusqu'au ${parrain.planDetails.endDate.toLocaleDateString("fr-FR")}.`;
    } else {
      // Pas d'abonnement actif : la récompense est mise en réserve plutôt que
      // perdue, et sera consommée à la prochaine activation.
      parrain.referralCreditMonths = (parrain.referralCreditMonths || 0) + MOIS_PAR_PARRAINAGE;
      message = `${filleul.firstName || "Un partenaire"} que vous avez parrainé vient de souscrire. ${parrain.referralCreditMonths} mois offert${parrain.referralCreditMonths > 1 ? "s" : ""} vous attend${parrain.referralCreditMonths > 1 ? "ent" : ""} : ils s'appliqueront dès votre prochaine activation.`;
    }
    await parrain.save();

    await Notification.create({
      user: filleul.referredBy, type: "system",
      titre: "🎉 Parrainage récompensé", message, lien: "/plans",
    }).catch((e) => logger.error("notification parrainage (non bloquant) :", e.message));

    return parrain;
  } catch (err) {
    logger.error("recompenserParrain (non bloquant) :", err.message);
    return null;
  }
}

// ── Consommation des mois offerts à l'activation ───────────────────────────
//
// Modifie `sub` EN MÉMOIRE et renvoie le nombre de mois consommés ; c'est
// l'appelant qui sauvegarde, dans la même transaction logique que l'activation.
export function consommerCreditParrainage(sub) {
  const mois = sub.referralCreditMonths || 0;
  if (mois <= 0) return 0;
  sub.planDetails.endDate = prolonger(sub.planDetails.endDate, mois);
  sub.referralCreditMonths = 0;
  return mois;
}
