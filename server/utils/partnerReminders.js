/**
 * VIT AUTO — Relance automatique des dossiers partenaire incomplets
 *
 * Couvre les systèmes de vérification partenaire (Founding Partner
 * onboarding — brouillon incomplet ET LOI/Accord envoyés mais jamais signés,
 * Vérification Partenaire, Certification 7 niveaux) : un dossier resté
 * incomplet ou bloqué (documents manquants, brouillon jamais soumis, lien de
 * signature jamais utilisé) ne recevait jusqu'ici aucune relance sauf action
 * manuelle admin ponctuelle.
 *
 * Volontairement PAS un job BullMQ : le quota Redis (Upstash) est déjà sous
 * tension (voir queue/connection.js) — un setInterval en mémoire suffit pour
 * un scan quotidien et n'ajoute aucune charge Redis. dispatch.* garde de
 * toute façon son repli synchrone si Redis est indisponible.
 */
import crypto from "crypto";
import logger from "./logger.js";
import { avecVerrou } from "./schedulerLock.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import { evaluerPartenaire, DOCUMENTS_PARTENAIRE } from "../services/validationPartenaire.js";
import Vehicle from "../models/Vehicle.js";
import { dispatch } from "../queue/index.js";
import { nonBloquant } from "./nonBloquant.js";

const APP_URL = process.env.APP_URL || "https://vit-auto.com";

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours entre deux relances du même dossier
const STALE_MS    = 3 * 24 * 60 * 60 * 1000; // ignore les dossiers créés il y a moins de 3 jours

// Au-delà, on se tait. Un partenaire qui n'a pas complété son dossier après
// trois rappels ne le fera pas au quatrième : insister ne convertit personne,
// entraîne les plaintes pour courrier indésirable et abîme la réputation
// d'envoi pour ceux qui attendent une confirmation de réservation. La relance
// reprend d'elle-même dès que la liste des pièces manquantes change.
const MAX_RELANCES = 3;

function isDue(lastReminderSentAt, reminderCount = 0) {
  if (reminderCount >= MAX_RELANCES) return false;
  return !lastReminderSentAt || (Date.now() - new Date(lastReminderSentAt).getTime()) > COOLDOWN_MS;
}

// Relance manuelle demandée par l'admin (sans délai) : mêmes pièces que la
// relance automatique, jamais à un partenaire déjà validé.
export async function relancerValidation(userId) {
  const r = await evaluerPartenaire(userId);
  if (!r) return { erreur: "Partenaire introuvable." };
  if (r.statut !== "a_completer" || !r.manquants.length) return { erreur: r.statut === "valide" ? "Ce partenaire est déjà validé : aucune pièce ne manque." : "Dossier suspendu : aucune relance." };
  const missingDocs = r.manquants.map((c) => DOCUMENTS_PARTENAIRE[c]?.libelle || c);
  const ok = await sendReminder({ userId, companyName: null, missingDocs, portalPath: DOCUMENTS_PARTENAIRE[r.manquants[0]]?.lien || "/vendor/dashboard" });
  return ok ? { missingDocs } : { erreur: "Utilisateur introuvable." };
}

export async function sendReminder({ userId, companyName, missingDocs, portalPath }) {
  const user = await User.findById(userId).select("firstName email").lean();
  if (!user) return false;
  const titre   = "📋 Dossier partenaire incomplet";
  const message = `Il manque des documents dans votre dossier : ${missingDocs.join(", ")}. Complétez-le pour accélérer sa vérification.`;
  // skipEmail : l'e-mail dédié part juste en dessous — sans ce drapeau, le
  // filet e-mail des notifications envoyait une SECONDE copie (relevé du
  // 09/10/2026 : chaque relance arrivait en double dans la boîte du partenaire).
  const notif = await Notification.create({ user: userId, titre, message, type: "dossier_partenaire", lien: portalPath || null, skipEmail: true }).catch(() => null);
  // "notification_new" (pas "notification") + payload complet — voir
  // insuranceController.notify, même correctif (bug réel trouvé en audit).
  if (notif && global._io) {
    global._io.to(`user_${userId}`).emit("notification_new", {
      _id: notif._id, type: "dossier_partenaire", titre, message, lien: portalPath || null, lu: false, createdAt: notif.createdAt,
    });
  }
  if (user.email) {
    await dispatch.partnerDocumentsMissing(user.email, String(userId), {
      firstName: user.firstName, companyName, missingDocs, portalPath,
    }).catch((e) => logger.error("dispatch.partnerDocumentsMissing:", e.message));
  }
  return true;
}

// ── Pièces manquantes pour la validation du partenaire ─────────────────────
// Une SEULE relance par partenaire (règle de l'exploitant, 2026-10-09), qui
// liste les pièces exigées pour SON métier et SON entité
// (services/validationPartenaire.js) : permis et CV pour un chauffeur, pièce
// d'identité pour un particulier, registre de commerce pour une entreprise…
// Un partenaire validé, fondateur, suspendu, de test ou supprimé n'en reçoit
// aucune. Elle remplace quatre relances qui demandaient toutes des documents
// d'entreprise, à tous, y compris à des chauffeurs déjà en règle.
const joignable = (u) => !u?.isTestAccount && !u?.deletedAt && u?.isActive !== false;

async function checkValidationPartenaires() {
  const partenaires = await User.find({ role: "partenaire", deletedAt: null, isActive: { $ne: false }, isTestAccount: { $ne: true } })
    .select("_id createdAt validationPartenaire.relances")
    .lean();
  let sent = 0;
  for (const p of partenaires) {
    const r = await evaluerPartenaire(p._id);
    if (!r || r.statut !== "a_completer" || !r.manquants.length) continue;
    if (Date.now() - new Date(p.createdAt).getTime() < STALE_MS) continue;
    // Le compteur repart quand la liste des pièces manquantes change : le
    // partenaire a avancé, il redevient joignable.
    const signature = r.manquants.join(",");
    const rel = p.validationPartenaire?.relances || {};
    const nombre = rel.signature === signature ? rel.nombre || 0 : 0;
    if (!isDue(rel.signature === signature ? rel.derniere : null, nombre)) continue;
    const ok = await sendReminder({
      userId: p._id,
      companyName: null,
      missingDocs: r.manquants.map((c) => DOCUMENTS_PARTENAIRE[c]?.libelle || c),
      portalPath: DOCUMENTS_PARTENAIRE[r.manquants[0]]?.lien || "/vendor/dashboard",
    });
    if (ok) {
      await User.updateOne({ _id: p._id }, { $set: {
        "validationPartenaire.relances.nombre": nombre + 1,
        "validationPartenaire.relances.derniere": new Date(),
        "validationPartenaire.relances.signature": signature,
      } });
      sent++;
    }
  }
  return sent;
}

// ── Founding Partner — LOI/Accord envoyés mais jamais signés ───────────────
// Comble un angle mort réel : checkFoundingPartnerDrafts ne couvre que
// brouillon/info_demandee — un dossier bloqué à loi_envoyee ou accord_envoye
// (lien de signature expiré, cassé, ou simplement oublié) ne recevait
// jusqu'ici AUCUNE relance automatique, alors que c'est précisément l'étape
// qui empêche le dossier d'avancer. Régénère un token frais (l'ancien peut
// avoir expiré) et renvoie un seul email via documentsReadyReminder.
async function checkFoundingPartnerPendingSignature() {
  const docs = await PartnerOnboarding.find({ status: { $in: ["loi_envoyee", "accord_envoye"] } })
    .select("userId companyInfo status referenceNumber lastReminderSentAt reminderCount updatedAt")
    .populate("userId", "firstName email isTestAccount deletedAt isActive")
    .lean();
  let sent = 0;
  for (const doc of docs) {
    if (!doc.userId?.email || !joignable(doc.userId)) continue;
    if (Date.now() - new Date(doc.updatedAt).getTime() < STALE_MS) continue;
    if (!isDue(doc.lastReminderSentAt, doc.reminderCount)) continue;

    const isLoiStep = doc.status === "loi_envoyee";
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const signLink = `${APP_URL}/sign/${token}`;
    const field = isLoiStep ? "loi" : "agreement";

    await PartnerOnboarding.updateOne({ _id: doc._id }, {
      $set: {
        [`${field}.signingToken`]: token,
        [`${field}.signingTokenExpires`]: expires,
        [`${field}.sentAt`]: new Date(),
        lastReminderSentAt: new Date(),
      },
      $inc: { reminderCount: 1 },
    });

    const titre = "✍️ Signature en attente";
    const message = `Votre ${isLoiStep ? "Lettre d'Intention" : "Accord de Partenariat Fondateur"} attend toujours votre signature — votre dossier Founding Partner ne peut pas avancer sans elle.`;
    const notif = await Notification.create({ user: doc.userId._id, titre, message, type: "system", lien: "/partner-onboarding", skipEmail: true }).catch(() => null);
    if (notif && global._io) {
      global._io.to(`user_${doc.userId._id}`).emit("notification_new", {
        _id: notif._id, type: "dossier_partenaire", titre, message, lien: "/partner-onboarding", lu: false, createdAt: notif.createdAt,
      });
    }

    await dispatch.documentsReadyReminder(String(doc.userId._id), doc.userId.email, {
      firstName:       doc.userId.firstName,
      companyName:     doc.companyInfo?.legalName || doc.userId.firstName,
      referenceNumber: doc.referenceNumber,
      loiUrl:          isLoiStep ? signLink : null,
      agreementUrl:    isLoiStep ? null : signLink,
      expiresAt:       expires,
    }).catch((e) => logger.error("dispatch.documentsReadyReminder:", e.message));

    sent++;
  }
  return sent;
}

// ── Annonces incomplètes ───────────────────────────────────────────────────
// Une annonce sans prix ne peut être ni publiée ni réservée : elle reste en
// brouillon indéfiniment, et le partenaire l'ignore souvent — il a déposé sa
// flotte et croit le travail fait. C'est le cas de 32 véhicules d'un même
// partenaire, complets par ailleurs (ville, photos, contact) et bloqués sur ce
// seul champ.
//
// Le compteur de relance vit sur l'utilisateur et non sur l'annonce : un
// partenaire ayant trente annonces incomplètes doit recevoir UN message, pas
// trente.
async function checkIncompleteListings() {
  const incompletes = await Vehicle.aggregate([
    { $match: {
        status: { $in: ["draft", "pending"] },
        $or: [
          { type: "location", $or: [{ pricePerDay: null }, { pricePerDay: 0 }, { pricePerDay: { $exists: false } }] },
          { type: "vente",    $or: [{ priceForSale: null }, { priceForSale: 0 }, { priceForSale: { $exists: false } }] },
        ],
    } },
    { $group: { _id: "$owner", n: { $sum: 1 }, exemples: { $push: "$title" } } },
  ]);

  let sent = 0;
  for (const grp of incompletes) {
    const user = await User.findById(grp._id).select("firstName email lastListingReminderAt listingReminderCount isTestAccount deletedAt isActive").lean();
    if (!user?.email || !joignable(user)) continue;
    if (!isDue(user.lastListingReminderAt, user.listingReminderCount)) continue;

    await User.updateOne({ _id: grp._id }, { $set: { lastListingReminderAt: new Date() }, $inc: { listingReminderCount: 1 } });

    const titre = "🚗 Annonces à compléter";
    const message = `${grp.n} de vos annonce${grp.n > 1 ? "s sont incomplètes" : " est incomplète"} : il manque le tarif, sans lequel elle${grp.n > 1 ? "s ne peuvent" : " ne peut"} être publiée${grp.n > 1 ? "s" : ""} ni réservée${grp.n > 1 ? "s" : ""}. Exemples : ${grp.exemples.slice(0, 3).join(", ")}.`;
    const notif = await Notification.create({ user: grp._id, titre, message, type: "system", lien: "/vendor/dashboard", skipEmail: true }).catch(() => null);
    if (notif && global._io) {
      global._io.to(`user_${grp._id}`).emit("notification_new", {
        _id: notif._id, type: "dossier_partenaire", titre, message, lien: "/vendor/dashboard", lu: false, createdAt: notif.createdAt,
      });
    }
    // Réutilise le gabarit « dossier incomplet » : le besoin est le même —
    // dire ce qui manque et où le compléter.
    await dispatch.partnerDocumentsMissing(user.email, String(grp._id), {
      firstName: user.firstName,
      companyName: null,
      missingDocs: [`Tarif manquant sur ${grp.n} annonce${grp.n > 1 ? "s" : ""}`],
      portalPath: "/vendor/dashboard",
    }).catch((e) => logger.error("dispatch.partnerDocumentsMissing (annonces):", e.message));

    sent++;
  }
  return sent;
}

export async function checkAndSendPartnerReminders() {
  try {
    // Séquentiel : la validation est évaluée (et enregistrée) avant tout le reste.
    const validation = await checkValidationPartenaires();
    const [fpSig, annonces] = await Promise.all([
      checkFoundingPartnerPendingSignature(),
      checkIncompleteListings(),
    ]);
    const total = validation + fpSig + annonces;
    if (total > 0) {
      logger.info("[PartnerReminders] Relances envoyées", { validation, foundingPartnerSignature: fpSig, annoncesIncompletes: annonces });
    }
    return total;
  } catch (err) {
    logger.error("checkAndSendPartnerReminders:", err);
    return 0;
  }
}

// ── Démarrage : premier passage différé, puis toutes les 24h ──────────────
// Chaque cycle passe par le verrou partagé entre instances (voir
// utils/schedulerLock.js) : jamais deux exécutions simultanées du même cycle.
let _interval = null;
export function startPartnerReminderScheduler() {
  if (_interval) return;
  setTimeout(() => avecVerrou("partnerReminders", 30 * 60 * 1000, () => checkAndSendPartnerReminders()).catch(nonBloquant("partnerReminders")), 5 * 60 * 1000); // 5 min après le démarrage
  _interval = setInterval(() => avecVerrou("partnerReminders", 30 * 60 * 1000, () => checkAndSendPartnerReminders()).catch(nonBloquant("partnerReminders")), 24 * 60 * 60 * 1000);
}
