import logger from "../utils/logger.js";
import crypto from "crypto";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { buildOnboardingPDFBuffer } from "../utils/pdfGenerator.js";
import { dispatch } from "../queue/index.js";

const APP_URL = process.env.APP_URL || "https://vit-auto.com";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── Notification helper ───────────────────────────────────────────────────────
async function notify(userId, title, message) {
  try {
    await Notification.create({ user: userId, titre: title, message, type: "system" });
    if (global._io) global._io.to(`user_${userId}`).emit("notification", { titre: title, message });
  } catch { /* non-bloquant */ }
}

// ── Audit helper ──────────────────────────────────────────────────────────────
async function addAudit(docId, action, performedBy, note = "") {
  await PartnerOnboarding.findByIdAndUpdate(docId, {
    $push: { auditLog: { action, performedBy: performedBy || null, note, timestamp: new Date() } },
  }).catch(() => {});
}

// ── Section update factory ────────────────────────────────────────────────────
const SECTION_FIELDS = {
  "company-info": ["legalName", "registrationNumber", "incorporationDate", "registrationCountry", "address", "website", "email", "phone", "whatsapp", "mainContact", "mainContactPosition"],
  "legal-docs":   ["businessRegistration", "businessLicense", "exportLicense", "taxCertificate", "proofOfAddress"],
  "business-verification": ["companyPresentation", "brands", "mainActivities", "exportMarkets", "annualExportCapacity", "yearsExperience", "oemAuthorization"],
  "platform-media": ["logo", "companyPhotos", "officePhotos", "showroomPhotos", "warehousePhotos", "teamPhotos", "promotionalVideo"],
  "vehicle-inventory": ["newVehicles", "usedVehicles", "electricVehicles", "hybridVehicles", "luxuryVehicles", "commercialVehicles"],
  "export-capabilities": ["shippingPorts", "shippingMethods", "shippingPartners", "incoterms"],
  "payment-info": ["acceptedMethods", "bankName", "preferredCurrency"],
  "commercial-terms": ["minimumOrderQuantity", "depositPolicy", "balanceTerms", "deliveryTime", "warrantyPolicy", "inspectionProcess"],
};

const SECTION_KEYS = {
  "company-info": "companyInfo",
  "legal-docs": "legalDocs",
  "business-verification": "businessVerification",
  "platform-media": "platformMedia",
  "vehicle-inventory": "vehicleInventory",
  "export-capabilities": "exportCapabilities",
  "payment-info": "paymentInfo",
  "commercial-terms": "commercialTerms",
};

// ════════════════════════════════════════════════════════════════════════════════
// ROUTES PARTENAIRE
// ════════════════════════════════════════════════════════════════════════════════

// ── GET /api/partner-onboarding/my ───────────────────────────────────────────
export const getMyOnboarding = async (req, res) => {
  try {
    let doc = await PartnerOnboarding.findOne({ userId: req.user.id });
    if (!doc) {
      doc = await PartnerOnboarding.create({ userId: req.user.id });
    }
    res.json({ onboarding: doc.toObject({ virtuals: true }) });
  } catch (err) {
    logger.error("getMyOnboarding:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/partner-onboarding/section/:sectionName ──────────────────────
export const updateSection = async (req, res) => {
  try {
    const { sectionName } = req.params;
    const fields = SECTION_FIELDS[sectionName];
    const sectionKey = SECTION_KEYS[sectionName];

    if (!fields || !sectionKey) {
      return res.status(400).json({ message: "Section invalide." });
    }

    let doc = await PartnerOnboarding.findOne({ userId: req.user.id });
    if (!doc) doc = await PartnerOnboarding.create({ userId: req.user.id });

    if (["accord_signe", "actif"].includes(doc.status)) {
      return res.status(400).json({ message: "Dossier finalisé — modifications non autorisées." });
    }

    const MAX_FILE_BYTES = 6 * 1024 * 1024; // 6 Mo en base64 ≈ 5 Mo réels
    const update = {};
    for (const field of fields) {
      if (field in req.body) {
        const val = req.body[field];
        // Valider la taille des fichiers base64
        if (typeof val === "string" && val.startsWith("data:")) {
          const base64Part = val.split(",")[1] || val;
          const byteSize = Buffer.byteLength(base64Part, "base64");
          if (byteSize > MAX_FILE_BYTES) {
            return res.status(413).json({
              message: `Le fichier "${field}" dépasse la taille maximale autorisée (5 Mo). Compressez le fichier et réessayez.`,
            });
          }
        }
        update[`${sectionKey}.${field}`] = val;
      }
    }
    update.updatedAt = new Date();

    const updated = await PartnerOnboarding.findOneAndUpdate(
      { userId: req.user.id },
      { $set: update },
      { new: true, runValidators: true }
    );

    res.json({ success: true, onboarding: updated.toObject({ virtuals: true }) });
  } catch (err) {
    logger.error("updateSection:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/partner-onboarding/partner-type ───────────────────────────────
export const updatePartnerType = async (req, res) => {
  try {
    const VALID = ["agence_location", "concessionnaire", "importateur_exportateur", "chauffeur_professionnel", "expert_auto", "transitaire_logistique", "financement", "assurance", "inspecteur_vehicles"];
    const { partnerType } = req.body;
    if (!VALID.includes(partnerType)) return res.status(400).json({ message: "Type partenaire invalide." });

    let doc = await PartnerOnboarding.findOne({ userId: req.user.id });
    if (!doc) doc = await PartnerOnboarding.create({ userId: req.user.id });

    doc.partnerType = partnerType;
    await doc.save();
    res.json({ success: true, onboarding: doc.toObject({ virtuals: true }) });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── POST /api/partner-onboarding/submit ─────────────────────────────────────
export const submitApplication = async (req, res) => {
  try {
    const doc = await PartnerOnboarding.findOne({ userId: req.user.id });
    if (!doc) return res.status(404).json({ message: "Dossier introuvable." });

    if (!["brouillon", "info_demandee"].includes(doc.status)) {
      return res.status(400).json({ message: "Ce dossier a déjà été soumis." });
    }
    if (!doc.companyInfo?.legalName) {
      return res.status(400).json({ message: "Le nom légal de l'entreprise est requis avant de soumettre." });
    }

    // Vérifier la limite du programme (20 partenaires fondateurs max)
    const FOUNDING_LIMIT = 20;
    const activeCount = await PartnerOnboarding.countDocuments({
      status: { $in: ["soumis", "en_review", "loi_envoyee", "loi_signee", "accord_envoye", "accord_signe", "actif"] },
      _id: { $ne: doc._id },
    });
    if (activeCount >= FOUNDING_LIMIT) {
      return res.status(400).json({
        message: `Le programme Founding Partner est complet (${FOUNDING_LIMIT}/${FOUNDING_LIMIT} partenaires). Contactez-nous à contact@vit-auto.com pour rejoindre la liste d'attente.`,
        programFull: true,
      });
    }

    doc.status = "soumis";
    await doc.save();
    await addAudit(doc._id, "DOSSIER_SOUMIS", req.user.id, "Candidature soumise par le partenaire");

    const admins = await User.find({ role: "admin" }).select("_id").lean();
    for (const admin of admins) {
      await notify(admin._id,
        "📋 Nouvelle candidature Founding Partner",
        `${doc.companyInfo.legalName} (réf. ${doc.referenceNumber}) a soumis sa candidature au programme Founding Partner.`
      );
    }

    res.json({ success: true, status: "soumis", referenceNumber: doc.referenceNumber });
  } catch (err) {
    logger.error("submitApplication:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── POST /api/partner-onboarding/sign-loi ────────────────────────────────────
export const signLOI = async (req, res) => {
  try {
    const { signerName, signerPosition } = req.body;
    if (!signerName?.trim()) return res.status(400).json({ message: "Le nom du signataire est requis." });

    const doc = await PartnerOnboarding.findOne({ userId: req.user.id });
    if (!doc) return res.status(404).json({ message: "Dossier introuvable." });
    if (doc.status !== "loi_envoyee") {
      return res.status(400).json({ message: "La LOI n'est pas disponible pour signature." });
    }

    doc.loi.signedAt = new Date();
    doc.loi.signerName = signerName.trim();
    doc.loi.signerPosition = signerPosition?.trim() || "";
    doc.loi.signatureIp = req.ip || "unknown";
    doc.loi.signatureUserAgent = req.headers["user-agent"] || "";
    doc.loi.documentHash = crypto.createHash("sha256").update(doc.loi.content || "").digest("hex");
    doc.loi.signingToken = null;
    doc.loi.signingTokenExpires = null;
    doc.status = "loi_signee";
    await doc.save();

    await addAudit(doc._id, "LOI_SIGNEE", req.user.id, `Signé par: ${signerName}`);

    await notify(doc.userId,
      "✅ LOI signée — Accord de partenariat en cours",
      "Votre Lettre d'Intention a été signée avec succès. Notre équipe prépare votre Accord de Partenariat Fondateur."
    );

    const admins = await User.find({ role: "admin" }).select("_id").lean();
    for (const admin of admins) {
      await notify(admin._id, "LOI signée",
        `${doc.companyInfo.legalName} (${doc.referenceNumber}) a signé la LOI. Veuillez envoyer l'Accord de Partenariat.`
      );
    }

    res.json({ success: true, status: "loi_signee" });
  } catch (err) {
    logger.error("signLOI:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── POST /api/partner-onboarding/sign-agreement ──────────────────────────────
export const signAgreement = async (req, res) => {
  try {
    const { signerName, signerPosition } = req.body;
    if (!signerName?.trim()) return res.status(400).json({ message: "Le nom du signataire est requis." });

    const doc = await PartnerOnboarding.findOne({ userId: req.user.id });
    if (!doc) return res.status(404).json({ message: "Dossier introuvable." });
    if (doc.status !== "accord_envoye") {
      return res.status(400).json({ message: "L'accord n'est pas disponible pour signature." });
    }

    const now = new Date();
    doc.agreement.signedAt = now;
    doc.agreement.signerName = signerName.trim();
    doc.agreement.signerPosition = signerPosition?.trim() || "";
    doc.agreement.signatureIp = req.ip || "unknown";
    doc.agreement.signatureUserAgent = req.headers["user-agent"] || "";
    doc.agreement.documentHash = crypto.createHash("sha256").update(doc.agreement.content || "").digest("hex");
    doc.agreement.signingToken = null;
    doc.agreement.signingTokenExpires = null;
    doc.commissions.lockedAt = now;
    doc.status = "accord_signe";
    await doc.save();

    // Activer le partenaire comme Founding Partner
    await User.findByIdAndUpdate(doc.userId, {
      $set: {
        isFounder: true,
        certificationBadge: "fondateur",
      },
    });

    await addAudit(doc._id, "ACCORD_SIGNE", req.user.id, `Signé par: ${signerName} — Commissions verrouillées`);

    await notify(doc.userId,
      "🎉 Bienvenue dans le programme Founding Partner VIT-AUTO !",
      `Félicitations ! Votre accord de partenariat fondateur a été signé. Votre badge exclusif "Founding Partner" est maintenant actif. Commissions : Location ${doc.commissions.location}% / Vente ${doc.commissions.vente}%.`
    );

    res.json({
      success: true,
      status: "accord_signe",
      commissions: {
        location: doc.commissions.location,
        vente: doc.commissions.vente,
        chauffeur: doc.commissions.chauffeur,
      },
    });
  } catch (err) {
    logger.error("signAgreement:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// ROUTES ADMIN
// ════════════════════════════════════════════════════════════════════════════════

// ── GET /api/partner-onboarding/admin/list ───────────────────────────────────
export const adminList = async (req, res) => {
  try {
    const { status, partnerType, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status)      filter.status = status;
    if (partnerType) filter.partnerType = partnerType;
    if (search) {
      const safe = escapeRegex(String(search).slice(0, 100));
      filter["companyInfo.legalName"] = { $regex: safe, $options: "i" };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [docs, total] = await Promise.all([
      PartnerOnboarding.find(filter)
        .populate("userId", "firstName lastName email phone profilePhoto certificationBadge")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Math.min(Number(limit), 50))
        .lean({ virtuals: true }),
      PartnerOnboarding.countDocuments(filter),
    ]);

    res.json({ onboardings: docs, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    logger.error("adminList:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/partner-onboarding/admin/stats ──────────────────────────────────
export const adminStats = async (req, res) => {
  try {
    const [total, byStatus, byType, founders] = await Promise.all([
      PartnerOnboarding.countDocuments(),
      PartnerOnboarding.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      PartnerOnboarding.aggregate([{ $group: { _id: "$partnerType", count: { $sum: 1 } } }]),
      PartnerOnboarding.countDocuments({ status: { $in: ["accord_signe", "actif"] } }),
    ]);

    res.json({
      total,
      activeFounders: founders,
      byStatus:  Object.fromEntries(byStatus.map((x) => [x._id, x.count])),
      byType:    Object.fromEntries(byType.map((x)   => [x._id, x.count])),
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/partner-onboarding/admin/:id ────────────────────────────────────
export const adminGetOne = async (req, res) => {
  try {
    const doc = await PartnerOnboarding.findById(req.params.id)
      .populate("userId", "firstName lastName email phone profilePhoto certificationBadge kycStatus createdAt")
      .populate("adminReview.reviewedBy", "firstName lastName email")
      .populate("auditLog.performedBy", "firstName lastName")
      .lean({ virtuals: true });
    if (!doc) return res.status(404).json({ message: "Dossier introuvable." });
    res.json({ onboarding: doc });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── POST /api/partner-onboarding/admin/:id/approve ───────────────────────────
export const adminApprove = async (req, res) => {
  try {
    const { note } = req.body;
    const doc = await PartnerOnboarding.findById(req.params.id)
      .populate("userId", "firstName lastName email");
    if (!doc) return res.status(404).json({ message: "Dossier introuvable." });
    if (!["soumis", "en_review"].includes(doc.status)) {
      return res.status(400).json({ message: "Ce dossier n'est pas en attente de validation." });
    }

    const user = doc.userId;
    const refDate = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

    const loiContent = generateLOI(doc, user, refDate);
    const loiToken = crypto.randomBytes(32).toString("hex");

    doc.loi.content             = loiContent;
    doc.loi.sentAt              = new Date();
    doc.loi.signingToken        = loiToken;
    doc.loi.signingTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours
    doc.status    = "loi_envoyee";
    doc.adminReview = {
      reviewedBy: req.user.id,
      reviewedAt: new Date(),
      decision:   "approved",
      note:       note || "",
    };
    await doc.save();

    await addAudit(doc._id, "CANDIDATURE_APPROUVEE", req.user.id, note || "Candidature approuvée — LOI générée et envoyée");

    // Notification in-app
    const partnerId = doc.userId._id || doc.userId;
    await notify(partnerId,
      "✅ Candidature approuvée — Signez votre LOI",
      `Félicitations ${user.firstName} ! Votre candidature a été approuvée. Vous avez reçu un email avec votre LOI et un lien sécurisé pour la signer.`
    );

    // Email avec PDF via queue (non-bloquant)
    const signLink = `${APP_URL}/sign/${loiToken}`;
    dispatch.loiReady(
      String(user._id || doc.userId),
      user.email,
      user.firstName || doc.companyInfo?.legalName,
      loiContent,
      doc.referenceNumber,
      signLink,
    ).catch((e) => logger.error("dispatch.loiReady:", e.message));

    res.json({ success: true, status: "loi_envoyee", referenceNumber: doc.referenceNumber, signLink });
  } catch (err) {
    logger.error("adminApprove:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── POST /api/partner-onboarding/admin/:id/send-agreement ────────────────────
export const adminSendAgreement = async (req, res) => {
  try {
    const doc = await PartnerOnboarding.findById(req.params.id)
      .populate("userId", "firstName lastName email");
    if (!doc) return res.status(404).json({ message: "Dossier introuvable." });
    if (doc.status !== "loi_signee") {
      return res.status(400).json({ message: "La LOI doit être signée avant d'envoyer l'accord." });
    }

    const user = doc.userId;
    const refDate = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    const agreementContent = generateAgreement(doc, user, refDate);
    const agrToken = crypto.randomBytes(32).toString("hex");

    doc.agreement.content             = agreementContent;
    doc.agreement.sentAt              = new Date();
    doc.agreement.signingToken        = agrToken;
    doc.agreement.signingTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    doc.status = "accord_envoye";
    await doc.save();

    await addAudit(doc._id, "ACCORD_ENVOYE", req.user.id, "Founding Partner Agreement généré et envoyé");

    // Notification in-app
    const partnerId = doc.userId._id || doc.userId;
    await notify(partnerId,
      "📄 Accord de Partenariat Fondateur disponible",
      "Votre Accord est prêt. Vous avez reçu un email avec le document PDF et un lien sécurisé pour signer et activer votre statut Founding Partner."
    );

    // Email avec PDF via queue (non-bloquant)
    const signLink = `${APP_URL}/sign/${agrToken}`;
    dispatch.agreementReady(
      String(user._id || doc.userId),
      user.email,
      user.firstName || doc.companyInfo?.legalName,
      agreementContent,
      doc.referenceNumber,
      signLink,
    ).catch((e) => logger.error("dispatch.agreementReady:", e.message));

    res.json({ success: true, status: "accord_envoye", signLink });
  } catch (err) {
    logger.error("adminSendAgreement:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── POST /api/partner-onboarding/admin/:id/reject ────────────────────────────
export const adminReject = async (req, res) => {
  try {
    const { note } = req.body;
    if (!note?.trim()) return res.status(400).json({ message: "Une note de rejet est requise." });

    const doc = await PartnerOnboarding.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Dossier introuvable." });

    doc.status = "rejete";
    doc.adminReview = {
      reviewedBy: req.user.id,
      reviewedAt: new Date(),
      decision:   "rejected",
      note:       note.trim(),
    };
    await doc.save();

    await addAudit(doc._id, "CANDIDATURE_REJETEE", req.user.id, note);
    await notify(doc.userId,
      "Candidature non retenue",
      `Après examen de votre dossier, votre candidature n'a pas été retenue. Motif : ${note}. N'hésitez pas à nous contacter pour plus d'informations.`
    );

    res.json({ success: true, status: "rejete" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── POST /api/partner-onboarding/admin/:id/request-info ──────────────────────
export const adminRequestInfo = async (req, res) => {
  try {
    const { infoRequested } = req.body;
    if (!infoRequested?.trim()) return res.status(400).json({ message: "Précisez les informations demandées." });

    const doc = await PartnerOnboarding.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Dossier introuvable." });

    doc.status = "info_demandee";
    doc.adminReview.infoRequested = infoRequested.trim();
    doc.adminReview.reviewedBy    = req.user.id;
    doc.adminReview.reviewedAt    = new Date();
    await doc.save();

    await addAudit(doc._id, "INFO_DEMANDEE", req.user.id, infoRequested);
    await notify(doc.userId,
      "📝 Informations complémentaires requises",
      `Notre équipe a besoin d'informations supplémentaires pour traiter votre candidature : ${infoRequested}. Mettez à jour votre dossier et resoumettez.`
    );

    res.json({ success: true, status: "info_demandee" });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/partner-onboarding/admin/:id/status ───────────────────────────
export const adminUpdateStatus = async (req, res) => {
  try {
    const VALID = ["brouillon", "soumis", "en_review", "loi_envoyee", "loi_signee", "accord_envoye", "accord_signe", "actif", "rejete", "info_demandee"];
    const { status, note } = req.body;
    if (!VALID.includes(status)) return res.status(400).json({ message: "Statut invalide." });

    const doc = await PartnerOnboarding.findByIdAndUpdate(
      req.params.id,
      { $set: { status, updatedAt: new Date() } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: "Dossier introuvable." });

    await addAudit(doc._id, "STATUT_MODIFIE", req.user.id, `Statut → ${status}${note ? ` (${note})` : ""}`);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// SIGNATURE PAR LIEN SÉCURISÉ (public — sans authentification)
// ════════════════════════════════════════════════════════════════════════════════

// ── GET /api/partner-onboarding/sign-token/:token ─────────────────────────────
export const verifySigningToken = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || token.length < 32) return res.status(400).json({ valid: false, message: "Token invalide." });
    const now = new Date();

    // Chercher LOI
    let doc = await PartnerOnboarding.findOne({
      "loi.signingToken": token,
      "loi.signingTokenExpires": { $gt: now },
    }).populate("userId", "firstName lastName email").lean();

    if (doc) {
      return res.json({
        valid:           true,
        type:            "loi",
        referenceNumber: doc.referenceNumber,
        content:         doc.loi.content,
        companyName:     doc.companyInfo?.legalName || "—",
        partnerName:     `${doc.userId?.firstName || ""} ${doc.userId?.lastName || ""}`.trim(),
        alreadySigned:   !!doc.loi.signedAt,
      });
    }

    // Chercher Accord
    doc = await PartnerOnboarding.findOne({
      "agreement.signingToken": token,
      "agreement.signingTokenExpires": { $gt: now },
    }).populate("userId", "firstName lastName email").lean();

    if (doc) {
      return res.json({
        valid:           true,
        type:            "agreement",
        referenceNumber: doc.referenceNumber,
        content:         doc.agreement.content,
        companyName:     doc.companyInfo?.legalName || "—",
        partnerName:     `${doc.userId?.firstName || ""} ${doc.userId?.lastName || ""}`.trim(),
        alreadySigned:   !!doc.agreement.signedAt,
        commissions:     doc.commissions,
      });
    }

    res.status(404).json({ valid: false, message: "Lien invalide ou expiré. Contactez votre responsable VIT-AUTO." });
  } catch (err) {
    logger.error("verifySigningToken:", err);
    res.status(500).json({ valid: false, message: "Erreur serveur." });
  }
};

// ── POST /api/partner-onboarding/sign-by-token/:token ─────────────────────────
export const signByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const { signerName, signerPosition } = req.body;
    if (!signerName?.trim()) return res.status(400).json({ message: "Le nom du signataire est requis." });

    const now = new Date();
    const ip  = req.ip || "unknown";
    const ua  = req.headers["user-agent"] || "";

    // ── Essayer LOI ──────────────────────────────────────────────────────────
    let doc = await PartnerOnboarding.findOne({
      "loi.signingToken": token,
      "loi.signingTokenExpires": { $gt: now },
      "loi.signedAt": null,
    });

    if (doc) {
      if (doc.status !== "loi_envoyee") {
        return res.status(400).json({ message: "Ce document ne peut plus être signé." });
      }
      const hash = crypto.createHash("sha256").update(doc.loi.content || "").digest("hex");
      doc.loi.signedAt             = now;
      doc.loi.signerName           = signerName.trim();
      doc.loi.signerPosition       = signerPosition?.trim() || "";
      doc.loi.signatureIp          = ip;
      doc.loi.signatureUserAgent   = ua;
      doc.loi.documentHash         = hash;
      doc.loi.signingToken         = null;
      doc.loi.signingTokenExpires  = null;
      doc.status = "loi_signee";
      await doc.save();

      await addAudit(doc._id, "LOI_SIGNEE_PAR_LIEN", null, `Via lien sécurisé — IP: ${ip}`);

      await notify(doc.userId, "✅ LOI signée — Accord en préparation",
        "Votre Lettre d'Intention a été signée via le lien sécurisé. Notre équipe prépare votre Accord de Partenariat Fondateur.");

      const admins = await User.find({ role: "admin" }).select("_id").lean();
      for (const admin of admins) {
        await notify(admin._id, "LOI signée (lien sécurisé)",
          `${doc.companyInfo?.legalName} (${doc.referenceNumber}) a signé la LOI via le lien email.`);
      }
      return res.json({ success: true, type: "loi", status: "loi_signee", documentHash: hash });
    }

    // ── Essayer Accord ───────────────────────────────────────────────────────
    doc = await PartnerOnboarding.findOne({
      "agreement.signingToken": token,
      "agreement.signingTokenExpires": { $gt: now },
      "agreement.signedAt": null,
    });

    if (doc) {
      if (doc.status !== "accord_envoye") {
        return res.status(400).json({ message: "Ce document ne peut plus être signé." });
      }
      const hash = crypto.createHash("sha256").update(doc.agreement.content || "").digest("hex");
      doc.agreement.signedAt            = now;
      doc.agreement.signerName          = signerName.trim();
      doc.agreement.signerPosition      = signerPosition?.trim() || "";
      doc.agreement.signatureIp         = ip;
      doc.agreement.signatureUserAgent  = ua;
      doc.agreement.documentHash        = hash;
      doc.agreement.signingToken        = null;
      doc.agreement.signingTokenExpires = null;
      doc.commissions.lockedAt          = now;
      doc.status = "accord_signe";
      await doc.save();

      await User.findByIdAndUpdate(doc.userId, {
        $set: { isFounder: true, certificationBadge: "fondateur" },
      });

      await addAudit(doc._id, "ACCORD_SIGNE_PAR_LIEN", null, `Via lien sécurisé — IP: ${ip}`);

      await notify(doc.userId, "🎉 Bienvenue dans le programme Founding Partner VIT-AUTO !",
        `Votre accord a été signé. Badge "Founding Partner" activé ! Commissions : Location ${doc.commissions.location}% / Vente ${doc.commissions.vente}%.`);

      const admins = await User.find({ role: "admin" }).select("_id").lean();
      for (const admin of admins) {
        await notify(admin._id, "Accord signé (lien sécurisé)",
          `${doc.companyInfo?.legalName} (${doc.referenceNumber}) a signé l'accord. Partenaire Fondateur activé.`);
      }
      return res.json({
        success: true,
        type:    "agreement",
        status:  "accord_signe",
        documentHash: hash,
        commissions:  { location: doc.commissions.location, vente: doc.commissions.vente },
      });
    }

    res.status(404).json({ message: "Lien invalide, expiré ou document déjà signé." });
  } catch (err) {
    logger.error("signByToken:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// TÉLÉCHARGEMENT PDF (partenaire authentifié)
// ════════════════════════════════════════════════════════════════════════════════

// ── GET /api/partner-onboarding/my/loi/pdf ────────────────────────────────────
export const downloadLOIPDF = async (req, res) => {
  try {
    const doc = await PartnerOnboarding.findOne({ userId: req.user.id }).lean();
    if (!doc?.loi?.content) return res.status(404).json({ message: "LOI non disponible." });

    const signBlock = doc.loi.signedAt ? {
      signerName:   doc.loi.signerName,
      signerPosition: doc.loi.signerPosition,
      signedAt:     doc.loi.signedAt,
      documentHash: doc.loi.documentHash,
    } : null;

    const buffer = await buildOnboardingPDFBuffer(
      doc.loi.content,
      "LETTRE D'INTENTION",
      `VA-LOI-${doc.referenceNumber}`,
      signBlock
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="LOI-${doc.referenceNumber}.pdf"`);
    res.send(buffer);
  } catch (err) {
    logger.error("downloadLOIPDF:", err);
    res.status(500).json({ message: "Erreur génération PDF." });
  }
};

// ── GET /api/partner-onboarding/my/agreement/pdf ──────────────────────────────
export const downloadAgreementPDF = async (req, res) => {
  try {
    const doc = await PartnerOnboarding.findOne({ userId: req.user.id }).lean();
    if (!doc?.agreement?.content) return res.status(404).json({ message: "Accord non disponible." });

    const signBlock = doc.agreement.signedAt ? {
      signerName:     doc.agreement.signerName,
      signerPosition: doc.agreement.signerPosition,
      signedAt:       doc.agreement.signedAt,
      documentHash:   doc.agreement.documentHash,
    } : null;

    const buffer = await buildOnboardingPDFBuffer(
      doc.agreement.content,
      "ACCORD DE PARTENARIAT FONDATEUR",
      `VA-FPA-${doc.referenceNumber}`,
      signBlock
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Accord-${doc.referenceNumber}.pdf"`);
    res.send(buffer);
  } catch (err) {
    logger.error("downloadAgreementPDF:", err);
    res.status(500).json({ message: "Erreur génération PDF." });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// GÉNÉRATEURS DE DOCUMENTS
// ════════════════════════════════════════════════════════════════════════════════

const PARTNER_TYPE_LABELS = {
  agence_location:         "Rental Agency / Agence de Location",
  concessionnaire:         "Dealer / Concessionnaire",
  importateur_exportateur: "Importer & Exporter",
  chauffeur_professionnel: "Professional Driver / Chauffeur Professionnel",
  expert_auto:             "Automotive Expert",
  transitaire_logistique:  "Freight Forwarder & Logistics",
  financement:             "Financing Partner",
  assurance:               "Insurance Partner",
  inspecteur_vehicles:     "Vehicle Inspector",
};

export function generateLOI(doc, user, date) {
  const company   = doc.companyInfo?.legalName   || "—";
  const contact   = doc.companyInfo?.mainContact || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "—";
  const position  = doc.companyInfo?.mainContactPosition || "—";
  const country   = doc.companyInfo?.registrationCountry || "—";
  const email     = doc.companyInfo?.email || user.email || "—";
  const typeLabel = PARTNER_TYPE_LABELS[doc.partnerType] || doc.partnerType;

  return `LETTER OF INTENT — VIT-AUTO FOUNDING PARTNER PROGRAM
══════════════════════════════════════════════════════════════

Reference  : VA-LOI-${doc.referenceNumber}
Date       : ${date}
Status     : PENDING PARTNER SIGNATURE

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BETWEEN:

  VIT-AUTO — International Automotive Services Platform
  Route 1029, Hay Sidi Maârouf, Casablanca, Morocco
  contact@vit-auto.com · vit-auto.com
  Represented by: Manassé N'DRI N'GUESSAN, Founder & CEO

  (hereinafter "the Platform")

AND:

  ${company}
  Country of Registration: ${country}
  Represented by: ${contact} — ${position}
  Contact email: ${email}

  (hereinafter "the Partner")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INTENT

This Letter of Intent formalizes the mutual intention of VIT-AUTO
and ${company} to enter into a Founding Partner relationship.

Partner Category : ${typeLabel}
Program          : Founding Partner Program (limited to first 20 partners)
Reference        : ${doc.referenceNumber}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FOUNDING PARTNER BENEFITS
(Guaranteed for 12 months from profile activation)

  ✓  Free Premium Subscription ......... 12 months (value: €300+)
  ✓  Rental Commission ................. ${doc.commissions?.location || 10}%  (standard rate: 15%)
  ✓  Sales Commission .................. ${doc.commissions?.vente || 2}%  (standard rate: 3%)
  ✓  Driver Commission ................. ${doc.commissions?.chauffeur || 10}%
  ✓  Exclusive "Founding Partner" Badge  on all listings
  ✓  Priority Catalog Placement ........ permanent top positioning
  ✓  Early Feature Access .............. all new features first
  ✓  Dedicated Onboarding Support ...... hands-on integration
  ✓  International Coverage ............ 20+ countries

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NEXT STEPS

Upon signing this LOI, both parties agree to:
  1. Proceed to the Founding Partner Agreement within 7 business days
  2. Complete platform integration and profile activation
  3. Go live in the VIT-AUTO catalog at platform launch

This LOI is non-binding but constitutes a formal statement of intent.
All binding obligations will be defined in the Founding Partner Agreement.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For VIT-AUTO:
  Manassé N'DRI N'GUESSAN — Founder & CEO
  Signed: ${date}

For the Partner:
  Signature pending via Secure Partner Portal

─────────────────────────────────────────────────────────────
Document Reference: ${doc.referenceNumber}
VIT-AUTO © 2026 · vit-auto.com · contact@vit-auto.com`;
}

export function generateAgreement(doc, user, date) {
  const company   = doc.companyInfo?.legalName   || "—";
  const contact   = doc.companyInfo?.mainContact || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "—";
  const position  = doc.companyInfo?.mainContactPosition || "—";
  const country   = doc.companyInfo?.registrationCountry || "—";
  const regNum    = doc.companyInfo?.registrationNumber  || "—";
  const email     = doc.companyInfo?.email || user.email || "—";
  const typeLabel = PARTNER_TYPE_LABELS[doc.partnerType] || doc.partnerType;
  const locRate   = doc.commissions?.location  || 10;
  const saleRate  = doc.commissions?.vente     || 2;
  const drvRate   = doc.commissions?.chauffeur || 10;

  return `FOUNDING PARTNER AGREEMENT
══════════════════════════════════════════════════════════════

Reference  : VA-FPA-${doc.referenceNumber}
Date       : ${date}
Version    : 1.0
Status     : PENDING PARTNER SIGNATURE

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BETWEEN:

  VIT-AUTO — International Automotive Services Platform
  Route 1029, Hay Sidi Maârouf, Casablanca, Morocco
  contact@vit-auto.com · vit-auto.com
  Represented by: Manassé N'DRI N'GUESSAN, Founder & CEO
  (hereinafter "the Platform")

AND:

  ${company}
  Registration No: ${regNum} · Country: ${country}
  Represented by: ${contact}, ${position}
  Email: ${email}
  (hereinafter "the Partner")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ARTICLE 1 — PURPOSE

This Founding Partner Agreement defines the terms under which
${company} joins VIT-AUTO as a Founding Partner and benefits
from preferential conditions in recognition of early commitment.

ARTICLE 2 — FOUNDING PARTNER STATUS

2.1  The Partner is recognized as a Founding Partner of VIT-AUTO,
     member of the exclusive first cohort (limited to 20 partners).

2.2  This status is non-transferable and permanently recorded
     in the Partner profile under reference ${doc.referenceNumber}.

2.3  Partner type: ${typeLabel}

2.4  The exclusive "Founding Partner" badge is displayed
     on all Partner listings for the duration of the partnership.

ARTICLE 3 — COMMERCIAL CONDITIONS

3.1  Preferential rates guaranteed for 12 months from activation:

     Transaction Type       Standard Rate   Founding Partner Rate
     ────────────────────────────────────────────────────────────
     Vehicle Rental         15%             ${locRate}%
     Vehicle Sales          3%              ${saleRate}%
     Professional Driver    10%             ${drvRate}%
     Premium Subscription   Paid            FREE (12 months)

3.2  After the 12-month period, standard rates apply unless renewed
     by mutual written agreement.

3.3  Commission rates locked from Agreement signing date: ${date}

ARTICLE 4 — PARTNER OBLIGATIONS

4.1  The Partner agrees to:
     a) Maintain accurate and up-to-date listings on the platform
     b) Respond to customer inquiries within 48 hours maximum
     c) Uphold VIT-AUTO quality and compliance standards
     d) Keep all verification documents current and valid
     e) Comply with all applicable laws in countries of operation
     f) Participate in the platform feedback and improvement process
     g) Not engage in fraudulent or misleading practices

ARTICLE 5 — PLATFORM OBLIGATIONS

5.1  VIT-AUTO agrees to:
     a) Provide and maintain a verified Founding Partner profile
     b) Apply the preferential commission rates in Article 3
     c) Grant permanent priority placement in search catalog
     d) Provide dedicated onboarding and integration support
     e) Give early access to all new platform features
     f) Display the Founding Partner badge on all listings
     g) Maintain partner data confidentiality

ARTICLE 6 — INTELLECTUAL PROPERTY

6.1  The Partner grants VIT-AUTO a non-exclusive license to use
     submitted logos, photos, and media for platform display.

6.2  VIT-AUTO retains all platform and technology rights.
     The Partner retains full rights to their own content.

ARTICLE 7 — CONFIDENTIALITY

7.1  Both parties agree to keep the terms of this Agreement
     strictly confidential and not disclose them to third parties
     without prior written consent.

ARTICLE 8 — TERM AND TERMINATION

8.1  This Agreement is valid from the signing date for 24 months.

8.2  Either party may terminate with 30 days' written notice
     after the initial 12-month period.

8.3  VIT-AUTO may terminate immediately for material breach,
     fraud, or non-compliance with platform quality standards.

8.4  Upon termination, standard commission rates apply retroactively
     only from the termination date, not retroactively.

ARTICLE 9 — DISPUTE RESOLUTION

9.1  Disputes shall be resolved first through good-faith negotiation
     within 30 days of written notice.

9.2  If unresolved, disputes shall be submitted to arbitration
     under applicable international commercial law.

ARTICLE 10 — GOVERNING LAW

10.1  This Agreement is governed by international commercial law.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SIGNATURES

For VIT-AUTO:
  Manassé N'DRI N'GUESSAN
  Founder & CEO, VIT-AUTO
  Signed: ${date}

For the Partner (${company}):
  Electronic signature via Secure Partner Portal
  Name: ${contact}
  Position: ${position}
  Signature: [Pending]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reference: ${doc.referenceNumber} · VIT-AUTO © 2026
vit-auto.com · contact@vit-auto.com`;
}
