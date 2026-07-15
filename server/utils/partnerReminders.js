/**
 * VIT AUTO — Relance automatique des dossiers partenaire incomplets
 *
 * Couvre les 3 systèmes de vérification partenaire (Founding Partner
 * onboarding, Vérification Partenaire, Certification 7 niveaux) : un dossier
 * resté incomplet (documents manquants, brouillon jamais soumis) ne recevait
 * jusqu'ici aucune relance sauf action manuelle admin ponctuelle.
 *
 * Volontairement PAS un job BullMQ : le quota Redis (Upstash) est déjà sous
 * tension (voir queue/connection.js) — un setInterval en mémoire suffit pour
 * un scan quotidien et n'ajoute aucune charge Redis. dispatch.* garde de
 * toute façon son repli synchrone si Redis est indisponible.
 */
import logger from "./logger.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import PartnerVerification from "../models/PartnerVerification.js";
import PartnerCertification from "../models/PartnerCertification.js";
import { dispatch } from "../queue/index.js";

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours entre deux relances du même dossier
const STALE_MS    = 3 * 24 * 60 * 60 * 1000; // ignore les dossiers créés il y a moins de 3 jours

function isDue(lastReminderSentAt) {
  return !lastReminderSentAt || (Date.now() - new Date(lastReminderSentAt).getTime()) > COOLDOWN_MS;
}

export async function sendReminder({ userId, companyName, missingDocs, portalPath }) {
  const user = await User.findById(userId).select("firstName email").lean();
  if (!user) return false;
  await Notification.create({
    user:    userId,
    titre:   "📋 Dossier partenaire incomplet",
    message: `Il manque des documents dans votre dossier : ${missingDocs.join(", ")}. Complétez-le pour accélérer sa vérification.`,
    type:    "system",
  }).catch(() => {});
  if (global._io) global._io.to(`user_${userId}`).emit("notification", { titre: "📋 Dossier partenaire incomplet" });
  if (user.email) {
    await dispatch.partnerDocumentsMissing(user.email, String(userId), {
      firstName: user.firstName, companyName, missingDocs, portalPath,
    }).catch((e) => logger.error("dispatch.partnerDocumentsMissing:", e.message));
  }
  return true;
}

// ── Vérification Partenaire ────────────────────────────────────────────────
export function missingVerificationDocs(doc) {
  const labels = {
    businessLicenseDoc: "Licence commerciale",
    rccmDoc:             "Registre du Commerce (RCCM)",
    taxIdDoc:            "NIF / Identifiant fiscal",
    repIdDoc:            "Pièce d'identité du représentant",
  };
  return Object.entries(labels).filter(([key]) => !doc.documents?.[key]).map(([, label]) => label);
}

async function checkPartnerVerification() {
  const docs = await PartnerVerification.find({ status: { $ne: "verifie" } })
    .select("userId companyName documents lastReminderSentAt updatedAt")
    .lean();
  let sent = 0;
  for (const doc of docs) {
    if (Date.now() - new Date(doc.updatedAt).getTime() < STALE_MS) continue;
    if (!isDue(doc.lastReminderSentAt)) continue;
    const missing = missingVerificationDocs(doc);
    if (!missing.length) continue;
    const ok = await sendReminder({ userId: doc.userId, companyName: doc.companyName, missingDocs: missing, portalPath: "/profile" });
    if (ok) {
      await PartnerVerification.updateOne({ _id: doc._id }, { $set: { lastReminderSentAt: new Date() } });
      sent++;
    }
  }
  return sent;
}

// ── Certification 7 niveaux ────────────────────────────────────────────────
export function missingCertificationDocs(cert) {
  const labels = {
    "level1.registrationDoc": "Registre de commerce",
    "level1.taxDoc":          "Attestation fiscale",
    "level2.idFrontDoc":      "Pièce d'identité — recto",
    "level2.idBackDoc":       "Pièce d'identité — verso",
    "level2.selfieDoc":       "Selfie de vérification",
  };
  const missing = [];
  for (const [path, label] of Object.entries(labels)) {
    const [lvl, field] = path.split(".");
    if (!cert[lvl]?.[field]?.data) missing.push(label);
  }
  return missing;
}

async function checkPartnerCertification() {
  const certs = await PartnerCertification.find({ overallStatus: { $in: ["not_started", "in_progress"] } })
    .select("userId level1 level2 lastReminderSentAt updatedAt")
    .populate("userId", "role")
    .lean();
  let sent = 0;
  for (const cert of certs) {
    // Réservé aux comptes partenaire — un client sans rôle partenaire n'a
    // jamais à compléter cette certification.
    if (!cert.userId || cert.userId.role !== "partenaire") continue;
    if (Date.now() - new Date(cert.updatedAt).getTime() < STALE_MS) continue;
    if (!isDue(cert.lastReminderSentAt)) continue;
    const missing = missingCertificationDocs(cert);
    if (!missing.length) continue;
    const ok = await sendReminder({ userId: cert.userId._id, companyName: cert.level1?.companyName, missingDocs: missing, portalPath: "/partner-certification" });
    if (ok) {
      await PartnerCertification.updateOne({ _id: cert._id }, { $set: { lastReminderSentAt: new Date() } });
      sent++;
    }
  }
  return sent;
}

// ── Founding Partner — brouillon jamais soumis ou infos demandées ─────────
async function checkFoundingPartnerDrafts() {
  const docs = await PartnerOnboarding.find({ status: { $in: ["brouillon", "info_demandee"] } })
    .select("userId companyInfo lastReminderSentAt updatedAt status adminReview")
    .lean();
  let sent = 0;
  for (const doc of docs) {
    if (Date.now() - new Date(doc.updatedAt).getTime() < STALE_MS) continue;
    if (!isDue(doc.lastReminderSentAt)) continue;
    const missing = doc.status === "info_demandee" && doc.adminReview?.infoRequested
      ? [doc.adminReview.infoRequested]
      : ["Documents légaux de l'entreprise (registre de commerce, licence commerciale...)"];
    const ok = await sendReminder({ userId: doc.userId, companyName: doc.companyInfo?.legalName, missingDocs: missing, portalPath: "/partner-onboarding" });
    if (ok) {
      await PartnerOnboarding.updateOne({ _id: doc._id }, { $set: { lastReminderSentAt: new Date() } });
      sent++;
    }
  }
  return sent;
}

export async function checkAndSendPartnerReminders() {
  try {
    const [pv, cert, fp] = await Promise.all([
      checkPartnerVerification(),
      checkPartnerCertification(),
      checkFoundingPartnerDrafts(),
    ]);
    const total = pv + cert + fp;
    if (total > 0) {
      logger.info("[PartnerReminders] Relances envoyées", { verification: pv, certification: cert, foundingPartner: fp });
    }
    return total;
  } catch (err) {
    logger.error("checkAndSendPartnerReminders:", err);
    return 0;
  }
}

// ── Démarrage : premier passage différé, puis toutes les 24h ──────────────
let _interval = null;
export function startPartnerReminderScheduler() {
  if (_interval) return;
  setTimeout(() => checkAndSendPartnerReminders(), 5 * 60 * 1000); // 5 min après le démarrage
  _interval = setInterval(() => checkAndSendPartnerReminders(), 24 * 60 * 60 * 1000);
}
