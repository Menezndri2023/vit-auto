/**
 * VIT AUTO — Analyse périodique des comptes incomplets
 *
 * Détecte les profils/paramètres manquants (photo, téléphone, adresse de
 * livraison, KYC jamais entamé) et relance l'utilisateur — tous rôles
 * confondus. Distinct de utils/partnerReminders.js, qui couvre les DOCUMENTS
 * de vérification partenaire (Certification / Vérification Partenaire),
 * pas le profil général d'un compte.
 *
 * Volontairement PAS un job BullMQ : le quota Redis (Upstash) est déjà sous
 * tension (voir queue/connection.js) — un setInterval en mémoire suffit pour
 * un scan quotidien. Décalé de 30 min par rapport à partnerReminders pour ne
 * pas cogner Mongo au même instant exact.
 */
import logger from "./logger.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { dispatch } from "../queue/index.js";

const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 jours entre deux relances du même compte
const STALE_MS    = 3 * 24 * 60 * 60 * 1000;  // ignore les comptes créés il y a moins de 3 jours
const BATCH_LIMIT  = 500;                      // garde-fou si la base grandit

function isDue(lastNudgeAt) {
  return !lastNudgeAt || (Date.now() - new Date(lastNudgeAt).getTime()) > COOLDOWN_MS;
}

// ── Ce qui manque, selon le rôle du compte ─────────────────────────────────
function missingItems(user) {
  const missing = [];
  if (!user.profilePhoto) missing.push("Photo de profil");
  if (!user.phone && !user.phoneVerified) missing.push("Numéro de téléphone");

  if (user.role === "client") {
    if (!user.defaultLocation?.address) missing.push("Adresse de livraison par défaut (pour la livraison GPS)");
    // KYC jamais entamé : n'incite que si le compte existe depuis un moment —
    // un client qui vient de s'inscrire pour naviguer n'a pas encore besoin
    // de vérifier son identité, inutile de le relancer immédiatement.
    if (!user.kycSubmittedAt && (!user.kycStatus || user.kycStatus === "EN_ATTENTE")) {
      missing.push("Vérification d'identité (KYC) — requise avant toute réservation");
    }
  }

  if (user.role === "partenaire" && !user.business?.address) {
    missing.push("Adresse de votre entreprise");
  }

  return missing;
}

async function processBatch() {
  const users = await User.find({ isActive: true, role: { $in: ["client", "partenaire", "chauffeur"] } })
    .select("firstName email profilePhoto phone phoneVerified role defaultLocation business kycStatus kycSubmittedAt createdAt lastAccountHealthNudgeAt")
    .limit(BATCH_LIMIT)
    .lean();

  let sent = 0;
  for (const user of users) {
    if (Date.now() - new Date(user.createdAt).getTime() < STALE_MS) continue;
    if (!isDue(user.lastAccountHealthNudgeAt)) continue;

    const missing = missingItems(user);
    if (!missing.length) continue;

    await Notification.create({
      user:    user._id,
      titre:   "📋 Complétez votre profil VIT AUTO",
      message: `Quelques informations restent à renseigner : ${missing.join(", ")}.`,
      type:    "system",
    }).catch(() => {});
    if (global._io) global._io.to(`user_${user._id}`).emit("notification", { titre: "📋 Complétez votre profil VIT AUTO" });

    if (user.email) {
      await dispatch.accountIncomplete(user.email, String(user._id), {
        firstName: user.firstName, missingItems: missing, portalPath: "/profile",
      }).catch((e) => logger.error("dispatch.accountIncomplete:", e.message));
    }

    await User.updateOne({ _id: user._id }, { $set: { lastAccountHealthNudgeAt: new Date() } });
    sent++;
  }
  return sent;
}

export async function checkAndNotifyIncompleteAccounts() {
  try {
    const sent = await processBatch();
    if (sent > 0) logger.info("[AccountHealthCheck] Relances envoyées", { count: sent });
    return sent;
  } catch (err) {
    logger.error("checkAndNotifyIncompleteAccounts:", err);
    return 0;
  }
}

let _interval = null;
export function startAccountHealthScheduler() {
  if (_interval) return;
  setTimeout(() => checkAndNotifyIncompleteAccounts(), 35 * 60 * 1000); // 35 min après le démarrage
  _interval = setInterval(() => checkAndNotifyIncompleteAccounts(), 24 * 60 * 60 * 1000);
}
