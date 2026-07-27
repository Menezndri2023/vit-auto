import logger from "../utils/logger.js";
import PartnerCertification from "../models/PartnerCertification.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { sendEmail } from "../config/email.js";
import { validateDocumentDataUri } from "../utils/imageValidation.js";
import { decryptField } from "../utils/fieldEncryption.js";

// ── Champs autorisés par niveau (whitelist anti mass-assignment) ──────────────
const LEVEL_ALLOWED_FIELDS = {
  1: ["companyName","legalForm","country","registrationType","registrationNumber",
      "taxId","officialAddress","city","website","businessEmail",
      "registrationDoc","taxDoc","addressProofDoc"],
  2: ["repFirstName","repLastName","repFunction","repIdType","repIdNumber",
      "hasProfCard","videoCallDone","videoCallDate",
      "idFrontDoc","idBackDoc","selfieDoc","profCardDoc"],
  3: ["yearsExperience","exportCountries","monthlyVolume","portsUsed",
      "paymentMethods","averageDelay","activityTypes","vehicleCategories"],
  4: ["bankName","accountHolder","iban","swift","bankCountry","bankDoc"],
  5: ["make","model","year","vin","mileage","hasVideo","hasInspection","hasHistory",
      "grayCardDoc","photoDoc","invoiceDoc"],
  6: ["canProvideProforma","canProvideCommercialInvoice","canProvidePackingList",
      "canProvideBillOfLading","canProvideOriginCert","canProvideInspectionCert",
      "canProvideCustomsDocs","sampleDoc"],
  7: ["agreedToGCU","agreedToCharte","agreedToAntifraud",
      "agreedToDelays","agreedToDataProt","agreedToRefund"],
};

// ── Champs "document" (base64) par niveau — doivent être validés en taille/type
// réel avant tout stockage (voir MAX_CERT_DOC_BYTES ci-dessous), contrairement au
// reste du payload qui n'est que du texte/booléens.
const LEVEL_DOC_FIELDS = {
  1: ["registrationDoc", "taxDoc", "addressProofDoc"],
  2: ["idFrontDoc", "idBackDoc", "selfieDoc", "profCardDoc"],
  4: ["bankDoc"],
  5: ["grayCardDoc", "photoDoc", "invoiceDoc"],
  6: ["sampleDoc"],
};

// Cohérent avec MAX_KYC_IMAGE_BYTES (kycController.js) — ces documents peuvent
// être scannés en PDF (RCCM, RIB...) ou en photo, voir accept="image/*,application/pdf"
// sur le formulaire (PartnerCertification.jsx).
const MAX_CERT_DOC_BYTES = 6 * 1024 * 1024;

// ── Extraire uniquement les champs autorisés d'un payload ────────────────────
function pickAllowed(payload, lvlNum) {
  const allowed = LEVEL_ALLOWED_FIELDS[lvlNum] || [];
  const safe = {};
  for (const key of allowed) {
    if (key in payload) safe[key] = payload[key];
  }
  return safe;
}

// ── Valider les documents soumis pour un niveau (taille + type réel) ─────────
// Avant ce contrôle, seul le NOM du champ était vérifié (anti mass-assignment) —
// le CONTENU (n'importe quel fichier, n'importe quelle taille jusqu'à la limite
// globale du body JSON) était stocké tel quel, avec deux conséquences concrètes :
// un document surdimensionné pouvait faire dépasser la limite BSON 16 Mo du
// document PartnerCertification (qui cumule tous les niveaux), et un fichier
// comme un SVG contenant du script passait les filtres d'affichage admin
// (safeImgHref n'autorise que data:image/*, qu'un <svg> satisfait techniquement).
function validateLevelDocs(payload, lvlNum) {
  for (const key of LEVEL_DOC_FIELDS[lvlNum] || []) {
    const doc = payload[key];
    if (!doc) continue;
    const data = typeof doc === "object" ? doc.data : null;
    if (!data) continue;
    const check = validateDocumentDataUri(data, MAX_CERT_DOC_BYTES);
    if (!check.ok) return { ok: false, field: key, message: check.message };
  }
  return { ok: true };
}

// ── Calcul du score global ───────────────────────────────────────────────────
// Exportées (avec computeBadge/syncUserBadge) pour être réutilisées par la
// cascade Founding Partner (partnerOnboardingController.js) — un partenaire
// dont l'Accord de Partenariat Fondateur est signé doit obtenir exactement le
// même résultat qu'un admin approuvant manuellement les 7 niveaux ici, pas une
// logique de score/badge dupliquée et potentiellement désynchronisée.
export function computeScore(cert) {
  let score = 0;
  ["level1","level2","level3","level4","level5","level6","level7"].forEach((l) => {
    if (cert[l]?.status === "approved") score += Math.floor(100 / 8);
  });
  if (cert.level8?.badgeAwarded && cert.level8.badgeAwarded !== "none") score += Math.floor(100 / 8);
  return Math.min(score, 100);
}

// ── Calcul du badge automatique ─────────────────────────────────────────────
export function computeBadge(cert) {
  const approved = (l) => cert[l]?.status === "approved";
  if (cert.level8?.badgeAwarded && cert.level8.badgeAwarded !== "none") return cert.level8.badgeAwarded;
  if (["level1","level2","level3","level4","level5","level6","level7"].every(approved)) return "fondateur";
  if (["level1","level2","level3"].every(approved)) return "verifie";
  return "none";
}

// ── Sync badge sur le modèle User ────────────────────────────────────────────
export async function syncUserBadge(userId, certBadge) {
  const badgeLevelMap = { premium: "platinum", fondateur: "gold", verifie: "silver", none: "none" };
  await User.findByIdAndUpdate(userId, {
    $set: {
      certificationBadge: certBadge,
      "importerProfile.badgeLevel": badgeLevelMap[certBadge] || "none",
    },
  });
}

// ── Audit helper ─────────────────────────────────────────────────────────────
async function addAudit(certId, action, level, performedBy, note) {
  await PartnerCertification.findByIdAndUpdate(certId, {
    $push: { auditLog: { action, level, performedBy: performedBy || null, note, timestamp: new Date() } },
  }).catch(() => {});
}

// ── GET /api/certification/status ────────────────────────────────────────────
export const getStatus = async (req, res) => {
  try {
    // Upsert atomique : élimine la race condition findOne + create
    const cert = await PartnerCertification.findOneAndUpdate(
      { userId: req.user.id },
      { $setOnInsert: { userId: req.user.id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ certification: cert });
  } catch (err) {
    logger.error("certification getStatus:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── POST /api/certification/level/:level ─────────────────────────────────────
export const submitLevel = async (req, res) => {
  try {
    // Seuls les partenaires peuvent certifier (pas les clients, chauffeurs, etc.)
    if (!["partenaire", "admin"].includes(req.user.role)) {
      return res.status(403).json({
        message: "La certification est réservée aux partenaires VIT AUTO.",
        code: "PARTNER_ONLY",
      });
    }

    const lvlNum = parseInt(req.params.level, 10);
    if (isNaN(lvlNum) || lvlNum < 1 || lvlNum > 7) {
      return res.status(400).json({ message: "Niveau invalide (1-7)." });
    }

    let cert = await PartnerCertification.findOne({ userId: req.user.id });
    if (!cert) cert = new PartnerCertification({ userId: req.user.id });

    // Niveau 7 : tous les niveaux 1-6 doivent être approuvés
    if (lvlNum === 7) {
      const allApproved = ["level1","level2","level3","level4","level5","level6"]
        .every((l) => cert[l]?.status === "approved");
      if (!allApproved) {
        return res.status(403).json({
          message: "Vous devez faire approuver les niveaux 1 à 6 avant de signer le contrat.",
        });
      }
    }

    // Whitelist : seuls les champs autorisés pour ce niveau sont acceptés
    const safePayload = pickAllowed(req.body, lvlNum);

    const docCheck = validateLevelDocs(safePayload, lvlNum);
    if (!docCheck.ok) {
      return res.status(400).json({ message: `${docCheck.field} : ${docCheck.message}`, code: "INVALID_DOCUMENT" });
    }

    const levelKey = `level${lvlNum}`;
    cert[levelKey] = {
      ...cert[levelKey],
      ...safePayload,
      status:      "submitted",
      submittedAt: new Date(),
    };

    // Niveau 7 : horodatage + IP de la signature
    if (lvlNum === 7) {
      cert.level7.signedAt = new Date();
      cert.level7.signerIp = req.ip || null;
    }

    cert.overallStatus      = "in_progress";
    cert.certificationScore = computeScore(cert);
    cert.certificationBadge = computeBadge(cert);

    await cert.save();
    await addAudit(cert._id, "LEVEL_SUBMITTED", lvlNum, req.user.id, `Niveau ${lvlNum} soumis`);

    if (global._io) {
      global._io.to("admins").emit("certification:submitted", {
        userId: req.user.id, level: lvlNum, certificationId: cert._id,
      });
    }

    res.json({
      success: true,
      message: `Niveau ${lvlNum} soumis. Notre équipe l'examinera sous 24-48h.`,
      certification: cert,
    });
  } catch (err) {
    logger.error("certification submitLevel:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// La liste ne doit JAMAIS charger les documents en base64 (jusqu'à 12 par dossier,
// potentiellement plusieurs Mo chacun) : avec `limit=20`, ça multiplierait vite la
// réponse à des dizaines de Mo. Seul adminDetail() les renvoie, à l'ouverture d'un
// dossier précis — même principe que kycController.js (voir commit "documents
// jamais affichés").
const CERT_LIST_EXCLUDE_DOCS = [
  "-level1.registrationDoc.data", "-level1.taxDoc.data", "-level1.addressProofDoc.data",
  "-level2.idFrontDoc.data", "-level2.idBackDoc.data", "-level2.selfieDoc.data", "-level2.profCardDoc.data",
  "-level4.bankDoc.data",
  "-level5.grayCardDoc.data", "-level5.photoDoc.data", "-level5.invoiceDoc.data",
  "-level6.sampleDoc.data",
].join(" ");

// ── GET /api/certification/admin/list ────────────────────────────────────────
export const adminList = async (req, res) => {
  try {
    const { status, badge, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.overallStatus = status;
    if (badge)  filter.certificationBadge = badge;

    const skip  = (Number(page) - 1) * Number(limit);
    const [certs, total] = await Promise.all([
      PartnerCertification.find(filter)
        .select(CERT_LIST_EXCLUDE_DOCS)
        .populate("userId", "firstName lastName email phone role profilePhoto")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      PartnerCertification.countDocuments(filter),
    ]);

    let allCerts = certs;
    let allTotal = total;

    // Comptes partenaire SANS AUCUN dossier de certification — invisibles
    // autrement dans cette liste (bug réel corrigé, audit). PartnerCertification
    // n'est créé que quand le partenaire visite lui-même /partner-certification
    // (upsert, voir getStatus) ou par la cascade Founding Partner à la signature
    // de l'accord — un partenaire fraîchement inscrit n'ayant fait ni l'un ni
    // l'autre était totalement absent de cet onglet, même mémoire pattern que
    // adminList (Founding Partner) déjà corrigé. Fusionné uniquement en
    // l'absence de filtre (aucun statut/badge n'a de sens pour un dossier qui
    // n'existe pas).
    if (!status && !badge) {
      const existingUserIds = await PartnerCertification.distinct("userId");
      const orphanUsers = await User.find({ role: "partenaire", _id: { $nin: existingUserIds } })
        .select("firstName lastName email phone role profilePhoto createdAt")
        .sort({ createdAt: -1 })
        .lean();
      const orphanRows = orphanUsers.map((u) => ({
        _id:                u._id,
        noDossier:          true,
        userId:             u,
        certificationBadge: "none",
        certificationScore: 0,
        overallStatus:      "not_started",
        createdAt:          u.createdAt,
        updatedAt:          u.createdAt,
      }));
      allCerts = [...certs, ...orphanRows];
      allTotal = total + orphanRows.length;
    }

    res.json({ certifications: allCerts, total: allTotal, page: Number(page), limit: Number(limit) });
  } catch (err) {
    logger.error("certification adminList:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/certification/admin/:userId ─────────────────────────────────────
export const adminDetail = async (req, res) => {
  try {
    let cert = await PartnerCertification.findOne({ userId: req.params.userId })
      .populate("userId", "firstName lastName email phone role profilePhoto business")
      .lean();

    // Bug réel corrigé (audit) : un partenaire sans AUCUN dossier (voir
    // orphanRows, adminList) faisait 404 ici — l'admin ne pouvait même pas
    // ouvrir "Examiner" pour un compte qu'il vient tout juste de retrouver.
    // Même upsert atomique que getStatus (côté partenaire), réservé aux
    // comptes réellement partenaire.
    if (!cert) {
      const user = await User.findById(req.params.userId).select("role").lean();
      if (!user || user.role !== "partenaire") {
        return res.status(404).json({ message: "Certification introuvable." });
      }
      await PartnerCertification.findOneAndUpdate(
        { userId: req.params.userId },
        { $setOnInsert: { userId: req.params.userId } },
        { upsert: true, setDefaultsOnInsert: true }
      );
      cert = await PartnerCertification.findOne({ userId: req.params.userId })
        .populate("userId", "firstName lastName email phone role profilePhoto business")
        .lean();
    }
    if (!cert) return res.status(404).json({ message: "Certification introuvable." });

    // Enrichissement en LECTURE SEULE (jamais persisté) : un Founding Partner passé
    // par l'onboarding complet mais jamais par le formulaire de certification séparé
    // (submitLevel) a ses 7 niveaux marqués "approved" par la cascade de signature
    // sans documents attachés — on les complète à l'affichage depuis son dossier
    // d'onboarding et son KYC, sans dépendre d'une re-signature ou d'un script.
    const needsFill = !cert.level1?.registrationDoc?.data || !cert.level2?.idFrontDoc?.data;
    if (needsFill) {
      const [onboarding, identityUser] = await Promise.all([
        PartnerOnboarding.findOne({ userId: req.params.userId }).select("legalDocs").lean(),
        User.findById(req.params.userId).select("identity.frontImage identity.backImage identity.selfie").lean(),
      ]);
      const fillDoc = (docObj, url) => (docObj?.data ? docObj : (url ? { name: "Fourni via Founding Partner / KYC", data: url, uploadedAt: null } : docObj));
      if (onboarding || identityUser) {
        cert.level1 = cert.level1 || {};
        cert.level1.registrationDoc = fillDoc(cert.level1.registrationDoc, onboarding?.legalDocs?.businessRegistration || onboarding?.legalDocs?.businessLicense);
        cert.level1.taxDoc          = fillDoc(cert.level1.taxDoc, onboarding?.legalDocs?.taxCertificate);
        cert.level1.addressProofDoc = fillDoc(cert.level1.addressProofDoc, onboarding?.legalDocs?.proofOfAddress);
        cert.level2 = cert.level2 || {};
        // Déchiffrement avant réutilisation dans PartnerCertification — voir fieldEncryption.js.
        cert.level2.idFrontDoc = fillDoc(cert.level2.idFrontDoc, decryptField(identityUser?.identity?.frontImage));
        cert.level2.idBackDoc  = fillDoc(cert.level2.idBackDoc, decryptField(identityUser?.identity?.backImage));
        cert.level2.selfieDoc  = fillDoc(cert.level2.selfieDoc, decryptField(identityUser?.identity?.selfie));
      }
    }

    res.json({ certification: cert });
  } catch (err) {
    logger.error("certification adminDetail:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── POST /api/certification/admin/:userId/relance ────────────────────────────
// Relance manuelle (bypass le cooldown de 7j du job automatique — voir
// utils/partnerReminders.js) : l'admin veut prévenir tout de suite.
export const adminRelance = async (req, res) => {
  try {
    const { missingCertificationDocs, sendReminder } = await import("../utils/partnerReminders.js");
    const cert = await PartnerCertification.findOne({ userId: req.params.userId }).lean();
    if (!cert) return res.status(404).json({ message: "Certification introuvable." });

    const missing = missingCertificationDocs(cert);
    if (!missing.length) return res.status(400).json({ message: "Aucun document manquant sur ce dossier." });

    const ok = await sendReminder({ userId: cert.userId, companyName: cert.level1?.companyName, missingDocs: missing, portalPath: "/partner-certification" });
    if (!ok) return res.status(404).json({ message: "Utilisateur introuvable." });

    await PartnerCertification.updateOne({ _id: cert._id }, { $set: { lastReminderSentAt: new Date() } });
    await addAudit(cert._id, "RELANCE_ENVOYEE", null, req.user.id, `Documents manquants : ${missing.join(", ")}`);

    res.json({ success: true, missingDocs: missing });
  } catch (err) {
    logger.error("certification adminRelance:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/certification/admin/:userId/level/:level/review ───────────────
export const adminReviewLevel = async (req, res) => {
  try {
    const lvlNum = parseInt(req.params.level, 10);
    if (isNaN(lvlNum) || lvlNum < 1 || lvlNum > 7) {
      return res.status(400).json({ message: "Niveau invalide (1-7)." });
    }

    const { decision, note } = req.body;
    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({ message: "Décision : 'approved' ou 'rejected'." });
    }

    const cert = await PartnerCertification.findOne({ userId: req.params.userId });
    if (!cert) return res.status(404).json({ message: "Certification introuvable." });

    const levelKey = `level${lvlNum}`;
    cert[levelKey].status          = decision;
    cert[levelKey].reviewedAt      = new Date();
    cert[levelKey].adminNote       = note || null;
    cert[levelKey].rejectionReason = decision === "rejected" ? (note || "Dossier insuffisant.") : null;

    cert.certificationScore = computeScore(cert);
    cert.certificationBadge = computeBadge(cert);

    // Bug réel corrigé (audit) : sans ce `else`, rejeter un niveau 1-3 APRÈS
    // que overallStatus soit déjà passé à "approved" ne le faisait jamais
    // redescendre (ni "anyPending" ni "tous 1-3 approuvés" n'est vrai dans ce
    // cas) — le dossier restait affiché "approved" partout (Vue de confiance
    // admin, profil public, exclu de la relance automatique qui ne cible que
    // not_started/in_progress) alors qu'il n'est plus valide.
    const anyPending = ["level1","level2","level3","level4","level5","level6","level7"]
      .some((l) => cert[l]?.status === "submitted");
    if (anyPending) cert.overallStatus = "in_progress";
    else if (["level1","level2","level3"].every((l) => cert[l]?.status === "approved")) {
      cert.overallStatus = "approved";
    } else {
      cert.overallStatus = "in_progress";
    }

    await cert.save();

    // Sync certificationBadge + importerProfile.badgeLevel sur le User
    await syncUserBadge(req.params.userId, cert.certificationBadge);

    await addAudit(
      cert._id,
      decision === "approved" ? "LEVEL_APPROVED" : "LEVEL_REJECTED",
      lvlNum,
      req.user.id,
      note || `Décision : ${decision}`,
    );

    const user = await User.findById(req.params.userId).select("email firstName").lean();
    const notifMsg = decision === "approved"
      ? `✅ Niveau ${lvlNum} de certification approuvé. Continuez vers le niveau suivant !`
      : `❌ Niveau ${lvlNum} refusé. Motif : ${note || "Documents insuffisants."}`;

    {
      const certTitre = decision === "approved" ? `✅ Certification niveau ${lvlNum} approuvée` : `❌ Certification niveau ${lvlNum} refusée`;
      const certNotifDoc = await Notification.create({
        user:    req.params.userId,
        titre:   certTitre,
        message: notifMsg,
        type:    "system", // "certification" n'existe pas dans l'enum Notification.type
        lu:      false,
      }).catch(() => null);
      // Bug réel corrigé (audit) : aucune émission socket temps réel — le
      // partenaire ne voyait la décision qu'au prochain polling (20s).
      if (certNotifDoc && global._io) {
        global._io.to(`user_${req.params.userId}`).emit("notification_new", {
          _id: certNotifDoc._id, type: "system", titre: certTitre, message: notifMsg,
          lien: null, lu: false, createdAt: certNotifDoc.createdAt,
        });
      }
    }

    sendEmail({
      to:      user?.email,
      subject: `VIT AUTO — Certification Partenaire — Niveau ${lvlNum}`,
      html: `<div style="font-family:Arial,sans-serif;padding:24px;max-width:560px;margin:0 auto">
        <h2 style="color:#0f1b3f">🏆 VIT AUTO — Certification Partenaire</h2>
        <p>Bonjour <strong>${user?.firstName || "Partenaire"}</strong>,</p>
        <p>${notifMsg}</p>
        ${decision === "rejected" ? `<p>Veuillez corriger votre dossier et resoumettre : <a href="${process.env.APP_URL || "http://localhost:5173"}/partner-certification">Tableau de certification</a></p>` : ""}
        ${cert.certificationBadge !== "none" ? `<p>🎉 Badge obtenu : <strong>${cert.certificationBadge.toUpperCase()}</strong></p>` : ""}
        <p style="color:#64748b;font-size:0.85rem">L'équipe VIT AUTO</p>
      </div>`,
    }).catch(() => {});

    res.json({
      success:             true,
      certificationBadge:  cert.certificationBadge,
      message:             `Niveau ${lvlNum} : ${decision}`,
    });
  } catch (err) {
    logger.error("certification adminReviewLevel:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/certification/admin/:userId/badge ─────────────────────────────
export const adminAssignBadge = async (req, res) => {
  try {
    const { badge, publicStatement, note } = req.body;
    const validBadges = ["none", "verifie", "fondateur", "premium"];
    if (!validBadges.includes(badge)) {
      return res.status(400).json({ message: `Badge invalide. Valeurs : ${validBadges.join(", ")}` });
    }

    const cert = await PartnerCertification.findOne({ userId: req.params.userId });
    if (!cert) return res.status(404).json({ message: "Certification introuvable." });

    cert.level8.status          = badge === "none" ? "rejected" : "approved";
    cert.level8.badgeAwarded    = badge;
    cert.level8.awardedBy       = req.user.id;
    cert.level8.awardedAt       = new Date();
    cert.level8.publicStatement = publicStatement || null;
    cert.level8.adminNote       = note || null;
    cert.level8.reviewedAt      = new Date();

    cert.certificationBadge = badge;
    cert.certificationScore = computeScore(cert);
    cert.overallStatus      = badge !== "none" ? "approved" : cert.overallStatus;

    await cert.save();

    // Sync certificationBadge + importerProfile.badgeLevel sur le User
    await syncUserBadge(req.params.userId, badge);

    await addAudit(cert._id, "BADGE_ASSIGNED", 8, req.user.id, `Badge : ${badge} — ${note || ""}`);

    const user = await User.findById(req.params.userId).select("email firstName").lean();
    const badgeLabels = {
      premium:   "⭐ Partenaire Premium",
      fondateur: "🏆 Partenaire Fondateur",
      verifie:   "🟢 Partenaire Vérifié",
      none:      "Badge retiré",
    };

    {
      const badgeTitre = `🏆 Badge VIT AUTO : ${badgeLabels[badge]}`;
      const badgeMsg   = `Félicitations ! Vous avez obtenu le badge "${badgeLabels[badge]}" sur VIT AUTO. ${publicStatement || ""}`;
      const badgeNotifDoc = await Notification.create({
        user:    req.params.userId,
        titre:   badgeTitre,
        message: badgeMsg,
        type:    "system", // "certification" n'existe pas dans l'enum Notification.type
        lu:      false,
      }).catch(() => null);
      // Bug réel corrigé (audit) : même angle mort, aucune émission temps réel.
      if (badgeNotifDoc && global._io) {
        global._io.to(`user_${req.params.userId}`).emit("notification_new", {
          _id: badgeNotifDoc._id, type: "system", titre: badgeTitre, message: badgeMsg,
          lien: null, lu: false, createdAt: badgeNotifDoc.createdAt,
        });
      }
    }

    sendEmail({
      to:      user?.email,
      subject: `VIT AUTO — Vous êtes maintenant ${badgeLabels[badge]} !`,
      html: `<div style="font-family:Arial,sans-serif;padding:32px;max-width:560px;margin:0 auto;background:#f8fafc;border-radius:16px">
        <div style="background:linear-gradient(135deg,#0f1b3f,#1e3a6e);padding:24px;border-radius:12px;text-align:center;margin-bottom:24px">
          <h1 style="color:#f59e0b;margin:0;font-size:2rem">${badge === "premium" ? "⭐" : badge === "fondateur" ? "🏆" : "🟢"}</h1>
          <h2 style="color:#fff;margin:8px 0 0">${badgeLabels[badge]}</h2>
        </div>
        <p>Bonjour <strong>${user?.firstName || "Partenaire"}</strong>,</p>
        <p>Félicitations ! Votre dossier de certification VIT AUTO a été intégralement validé.</p>
        ${publicStatement ? `<p style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px;border-radius:4px">"${publicStatement}"</p>` : ""}
        <p>Votre badge est désormais visible sur votre profil et vos annonces.</p>
        <p style="color:#64748b;font-size:0.85rem">L'équipe VIT AUTO — certification@vit-auto.com</p>
      </div>`,
    }).catch(() => {});

    res.json({ success: true, badge, message: `Badge ${badgeLabels[badge]} attribué.` });
  } catch (err) {
    logger.error("certification adminAssignBadge:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/certification/public/:userId ────────────────────────────────────
export const publicProfile = async (req, res) => {
  try {
    const cert = await PartnerCertification.findOne({ userId: req.params.userId })
      .select("certificationBadge certificationScore level8 overallStatus")
      .lean();
    if (!cert) return res.json({ certificationBadge: "none", certificationScore: 0 });
    res.json({
      certificationBadge: cert.certificationBadge,
      certificationScore: cert.certificationScore,
      publicStatement:    cert.level8?.publicStatement || null,
      overallStatus:      cert.overallStatus,
    });
  } catch (err) {
    logger.error("certification publicProfile:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
