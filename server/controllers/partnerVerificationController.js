import logger from "../utils/logger.js";
import PartnerVerification, { CRITERIA_WEIGHTS } from "../models/PartnerVerification.js";
import PartnerCertification from "../models/PartnerCertification.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const CRITERIA_LIST = Object.keys(CRITERIA_WEIGHTS);

// ── Audit helper ──────────────────────────────────────────────────────────────
async function addAudit(docId, action, criterion, performedBy, note) {
  await PartnerVerification.findByIdAndUpdate(docId, {
    $push: { auditLog: { action, criterion: criterion || null, performedBy: performedBy || null, note: note || "", timestamp: new Date() } },
  }).catch(() => {});
}

// ── Notifier le partenaire ────────────────────────────────────────────────────
async function notifyPartner(userId, title, message) {
  try {
    await Notification.create({ user: userId, titre: title, message, type: "system" });
    if (global._io) global._io.to(`user_${userId}`).emit("notification", { titre: title, message });
  } catch { /* non-bloquant */ }
}

// ── GET /api/partner-verification/admin/list ──────────────────────────────────
export const adminList = async (req, res) => {
  try {
    const { status, trustLevel, companyType, search, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (status)      filter.status = status;
    if (trustLevel)  filter.trustLevel = trustLevel;
    if (companyType) filter.companyType = companyType;
    if (search) {
      const safe = escapeRegex(String(search).slice(0, 100));
      filter.$or = [
        { companyName: { $regex: safe, $options: "i" } },
        { email:       { $regex: safe, $options: "i" } },
        { country:     { $regex: safe, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [docs, total] = await Promise.all([
      PartnerVerification.find(filter)
        .populate("userId", "firstName lastName email phone profilePhoto role")
        .populate("assignedTo", "firstName lastName")
        .sort({ trustScore: -1, updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      PartnerVerification.countDocuments(filter),
    ]);

    res.json({ verifications: docs, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    logger.error("partnerVerif adminList:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/partner-verification/admin/stats ─────────────────────────────────
export const adminStats = async (req, res) => {
  try {
    const [total, byStatus, byLevel, byType] = await Promise.all([
      PartnerVerification.countDocuments(),
      PartnerVerification.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      PartnerVerification.aggregate([{ $group: { _id: "$trustLevel", count: { $sum: 1 } } }]),
      PartnerVerification.aggregate([{ $group: { _id: "$companyType", count: { $sum: 1 } } }]),
    ]);

    const avgScore = await PartnerVerification.aggregate([
      { $group: { _id: null, avg: { $avg: "$trustScore" } } },
    ]);

    res.json({
      total,
      byStatus:   Object.fromEntries(byStatus.map((x) => [x._id, x.count])),
      byLevel:    Object.fromEntries(byLevel.map((x)  => [x._id, x.count])),
      byType:     Object.fromEntries(byType.map((x)   => [x._id, x.count])),
      avgScore:   Math.round(avgScore[0]?.avg || 0),
    });
  } catch (err) {
    logger.error("partnerVerif adminStats:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/partner-verification/admin/:userId ───────────────────────────────
export const adminDetail = async (req, res) => {
  try {
    let doc = await PartnerVerification.findOne({ userId: req.params.userId })
      .populate("userId", "firstName lastName email phone profilePhoto role certificationBadge createdAt")
      .populate("certificationId")
      .populate("assignedTo", "firstName lastName email")
      .populate("auditLog.performedBy", "firstName lastName")
      .lean();

    if (!doc) {
      const user = await User.findById(req.params.userId).lean();
      if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
      return res.json({ verification: null, user });
    }

    res.json({ verification: doc });
  } catch (err) {
    logger.error("partnerVerif adminDetail:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── POST /api/partner-verification/admin ──────────────────────────────────────
export const adminCreate = async (req, res) => {
  try {
    const { userId, companyName, companyType, country, city, website, phone, email, description, exportCountries, importCountries, vehicleCategories, portsUsed, annualVolume, yearsExperience, paymentMethods, adminNote, internalRating, assignedTo } = req.body;

    if (!userId || !companyName) return res.status(400).json({ message: "userId et companyName requis." });

    const exists = await PartnerVerification.findOne({ userId });
    if (exists) return res.status(409).json({ message: "Un dossier existe déjà pour ce partenaire.", id: exists._id });

    // Lier la certification si elle existe
    const cert = await PartnerCertification.findOne({ userId }).lean();

    const doc = await PartnerVerification.create({
      userId, companyName, companyType, country, city, website, phone, email, description,
      certificationId: cert?._id || null,
      exportCountries: exportCountries || [],
      importCountries: importCountries || [],
      vehicleCategories: vehicleCategories || [],
      portsUsed: portsUsed || [],
      annualVolume: annualVolume || "",
      yearsExperience: yearsExperience || 0,
      paymentMethods: paymentMethods || [],
      adminNote: adminNote || "",
      internalRating: internalRating || 0,
      assignedTo: assignedTo || null,
    });

    await addAudit(doc._id, "DOSSIER_CREE", null, req.user.id, `Dossier créé par admin`);
    await notifyPartner(userId, "Votre dossier partenaire a été ouvert", "Un administrateur VIT AUTO a ouvert votre dossier de vérification partenaire.");

    res.status(201).json({ success: true, verification: doc });
  } catch (err) {
    logger.error("partnerVerif adminCreate:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/partner-verification/admin/:userId/info ────────────────────────
export const adminUpdateInfo = async (req, res) => {
  try {
    const allowed = ["companyName","companyType","country","city","website","phone","email","description","exportCountries","importCountries","vehicleCategories","portsUsed","annualVolume","yearsExperience","paymentMethods","adminNote","internalRating","assignedTo","status","documents"];
    const update = {};
    for (const key of allowed) {
      if (key in req.body) update[key] = req.body[key];
    }

    const doc = await PartnerVerification.findOneAndUpdate(
      { userId: req.params.userId },
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    if (!doc) return res.status(404).json({ message: "Dossier introuvable." });

    await addAudit(doc._id, "INFO_MISE_A_JOUR", null, req.user.id, "Informations générales mises à jour");
    res.json({ success: true, verification: doc });
  } catch (err) {
    logger.error("partnerVerif adminUpdateInfo:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/partner-verification/admin/:userId/criterion ──────────────────
export const adminToggleCriterion = async (req, res) => {
  try {
    const { criterion, verified, note, docUrl } = req.body;

    if (!CRITERIA_LIST.includes(criterion)) {
      return res.status(400).json({ message: `Critère invalide. Valeurs : ${CRITERIA_LIST.join(", ")}` });
    }

    const doc = await PartnerVerification.findOne({ userId: req.params.userId });
    if (!doc) return res.status(404).json({ message: "Dossier introuvable." });

    doc.criteria[criterion] = {
      verified: Boolean(verified),
      verifiedAt: verified ? new Date() : null,
      verifiedBy: verified ? req.user.id : null,
      note:       note    ?? doc.criteria[criterion]?.note ?? "",
      docUrl:     docUrl  ?? doc.criteria[criterion]?.docUrl ?? null,
    };

    await doc.save(); // déclenche le recalcul pre-save

    const actionLabel = verified ? "CRITERE_VALIDE" : "CRITERE_RETIRE";
    await addAudit(doc._id, actionLabel, criterion, req.user.id, note || "");

    // Notifier si tout est vérifié
    if (doc.trustScore === 100) {
      await notifyPartner(doc.userId, "Votre profil partenaire est entièrement vérifié !", "Félicitations ! Tous vos critères de vérification ont été validés par notre équipe.");
    } else if (verified) {
      await notifyPartner(doc.userId, "Critère de vérification validé", `Le critère "${criterion}" de votre dossier partenaire a été validé.`);
    }

    res.json({ success: true, verification: doc.toObject(), trustScore: doc.trustScore, trustLevel: doc.trustLevel });
  } catch (err) {
    logger.error("partnerVerif adminToggleCriterion:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/partner-verification/admin/:userId/status ─────────────────────
export const adminUpdateStatus = async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const VALID_STATUSES = ["en_cours", "en_attente", "verifie", "suspendu", "rejete"];
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ message: "Statut invalide." });

    const doc = await PartnerVerification.findOneAndUpdate(
      { userId: req.params.userId },
      { $set: { status, ...(adminNote !== undefined ? { adminNote } : {}) } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: "Dossier introuvable." });

    await addAudit(doc._id, "STATUT_CHANGE", null, req.user.id, `Statut → ${status}`);

    const statusMessages = {
      verifie:   "Votre dossier partenaire a été vérifié et approuvé.",
      suspendu:  "Votre dossier partenaire a été temporairement suspendu.",
      rejete:    "Votre dossier partenaire a été rejeté. Contactez notre équipe pour plus d'informations.",
      en_cours:  "Votre dossier partenaire est en cours de traitement.",
      en_attente:"Votre dossier partenaire est en attente de documents complémentaires.",
    };
    await notifyPartner(doc.userId, "Mise à jour de votre dossier partenaire", statusMessages[status] || "");

    res.json({ success: true, verification: doc });
  } catch (err) {
    logger.error("partnerVerif adminUpdateStatus:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── DELETE /api/partner-verification/admin/:userId ────────────────────────────
export const adminDelete = async (req, res) => {
  try {
    const doc = await PartnerVerification.findOneAndDelete({ userId: req.params.userId });
    if (!doc) return res.status(404).json({ message: "Dossier introuvable." });
    res.json({ success: true, message: "Dossier supprimé." });
  } catch (err) {
    logger.error("partnerVerif adminDelete:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/partner-verification/public/:userId ──────────────────────────────
export const publicProfile = async (req, res) => {
  try {
    const doc = await PartnerVerification.findOne({ userId: req.params.userId, status: "verifie" })
      .select("companyName companyType country city website trustScore trustLevel criteria exportCountries importCountries vehicleCategories yearsExperience logoUrl")
      .lean();
    if (!doc) return res.status(404).json({ message: "Profil non trouvé ou non vérifié." });
    res.json({ verification: doc });
  } catch (err) {
    logger.error("partnerVerif publicProfile:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
