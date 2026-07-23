import logger from "../utils/logger.js";
import crypto from "crypto";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import PartnerCertification from "../models/PartnerCertification.js";
import PartnerVerification, { CRITERIA_WEIGHTS } from "../models/PartnerVerification.js";
import ImporterPartnerProfile from "../models/ImporterPartnerProfile.js";
import { buildOnboardingPDFBuffer } from "../utils/pdfGenerator.js";
import { dispatch } from "../queue/index.js";
import { validateDocumentDataUri } from "../utils/imageValidation.js";
import { computeScore, computeBadge, syncUserBadge } from "./partnerCertificationController.js";
import { getConfig } from "../services/pricingEngine.js";
import { decryptField } from "../utils/fieldEncryption.js";

const APP_URL = process.env.APP_URL || "https://vit-auto.com";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── Demande explicite : le programme Founding Partner devient le parcours
// obligatoire de TOUT partenaire à l'inscription (voir Register.jsx) — le
// plafond de 20/pays, pensé pour une offre de lancement rare, est donc retiré
// (il bloquerait sinon les inscriptions dès le 21e partenaire d'un pays).
// Conservée en no-op (plutôt que supprimée) pour ne pas devoir retoucher tous
// ses appelants (applyToProgram/getAvailability) si une limite devait revenir.
async function checkFoundingCapacity() {
  return { ok: true };
}

// ── Nom affiché dans les notifications admin ──────────────────────────────────
// `companyInfo.legalName` n'existe que pour professionnel/entreprise/exportateur
// — un dossier "particulier" (désormais la majorité des candidatures, le
// programme étant devenu le parcours obligatoire de tout partenaire) l'a
// toujours vide, ce qui affichait "undefined" dans les notifications admin.
function applicantDisplayName(doc, user) {
  return doc.companyInfo?.legalName
    || [user?.firstName, user?.lastName].filter(Boolean).join(" ")
    || "Candidat";
}

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

// ── Cascade Founding Partner ──────────────────────────────────────────────────
// Avant ceci, signer l'Accord de Partenariat Fondateur ne posait le badge
// "fondateur" QUE sur User.certificationBadge : le KYC (User.kycStatus), la
// Certification 7 niveaux (PartnerCertification) et la Vérification Partenaire
// (PartnerVerification) restaient chacun dans leur état antérieur, inchangé —
// trois écrans admin séparés donnant une image incohérente du même partenaire
// (ex: "EN_ATTENTE" en KYC alors qu'il est déjà partenaire fondateur signé).
// L'Accord Founding Partner est le niveau de vérification le plus exigeant du
// site (identité + entreprise + représentant + banque + véhicules + export déjà
// collectés pendant l'onboarding) : sa signature vaut donc validation complète
// des 3 autres systèmes, pas seulement l'attribution d'un badge isolé.
const NOTE_AUTO = "Vérifié automatiquement — Accord de Partenariat Fondateur signé.";

async function cascadeFoundingPartnerApproval(doc) {
  const userId = doc.userId;
  const now = new Date();

  try {
    // 1. KYC — mêmes champs qu'une décision admin "VERIFIE" manuelle
    //    (voir kycController.adminReviewKyc) + score/badge au maximum (cohérent
    //    avec kycEngine.js : score 100 → badge "CERTIFIÉ").
    await User.findByIdAndUpdate(userId, {
      $set: {
        kycStatus:          "VERIFIE",
        kycScore:           100,
        kycBadge:           "CERTIFIÉ",
        documentsVerified:  true,
        "identity.status":     "verified",
        "identity.verifiedAt": now,
      },
    });

    // Pièce d'identité KYC — réutilisée pour compléter Certification niveau 2 et
    // Vérification Partenaire ci-dessous (un seul fetch pour les deux).
    const identityUser = await User.findById(userId).select("identity.frontImage identity.backImage identity.selfie").lean();
    // Déchiffrement avant réutilisation dans d'autres collections (Certification/
    // Vérification Partenaire) — voir fieldEncryption.js. Sans ceci, le blob chiffré
    // serait copié tel quel et deviendrait indéchiffrable dans ces autres documents.
    if (identityUser?.identity) {
      identityUser.identity.frontImage = decryptField(identityUser.identity.frontImage);
      identityUser.identity.backImage  = decryptField(identityUser.identity.backImage);
      identityUser.identity.selfie     = decryptField(identityUser.identity.selfie);
    }

    // 2. Certification (7 niveaux) — même résultat qu'un admin approuvant
    //    manuellement chaque niveau (computeScore/computeBadge réutilisés tels
    //    quels, jamais recalculés séparément ici).
    let cert = await PartnerCertification.findOne({ userId });
    if (!cert) cert = new PartnerCertification({ userId });
    for (let n = 1; n <= 7; n++) {
      const lvl = cert[`level${n}`];
      lvl.status     = "approved";
      lvl.reviewedAt = now;
      lvl.adminNote  = lvl.adminNote || NOTE_AUTO;
    }
    // Copier les vraies pièces collectées pendant l'onboarding — avant ceci, un
    // Founding Partner qui n'était jamais passé par le formulaire de certification
    // séparé (submitLevel) voyait ses 7 niveaux marqués "approved" sans aucun
    // document réel, alors que ces mêmes pièces existaient déjà dans son dossier
    // d'onboarding et son KYC.
    const fillCertDoc = (docObj, url) => (docObj?.data ? docObj : (url ? { name: NOTE_AUTO, data: url, uploadedAt: now } : docObj));
    // Un partenaire "particulier" n'a ni RCCM ni licence commerciale — sa seule
    // pièce (individualDoc) tient lieu de justificatif d'immatriculation/adresse.
    cert.level1.registrationDoc = fillCertDoc(cert.level1.registrationDoc, doc.legalDocs?.businessRegistration || doc.legalDocs?.businessLicense || doc.individualDoc?.file);
    cert.level1.taxDoc          = fillCertDoc(cert.level1.taxDoc, doc.legalDocs?.taxCertificate);
    cert.level1.addressProofDoc = fillCertDoc(cert.level1.addressProofDoc, doc.legalDocs?.proofOfAddress || doc.individualDoc?.file);
    cert.level2.idFrontDoc      = fillCertDoc(cert.level2.idFrontDoc, identityUser?.identity?.frontImage || doc.individualDoc?.file);
    cert.level2.idBackDoc       = fillCertDoc(cert.level2.idBackDoc, identityUser?.identity?.backImage);
    cert.level2.selfieDoc       = fillCertDoc(cert.level2.selfieDoc, identityUser?.identity?.selfie);
    // Un badge de niveau 8 attribué manuellement AVANT que ce partenaire ne
    // devienne Founding Partner (ex: "verifie" via adminAssignBadge) court-
    // circuite computeBadge() — qui teste level8.badgeAwarded en premier — et
    // masquait silencieusement le badge "fondateur" pourtant gagné par les 7
    // niveaux approuvés ci-dessus (constaté sur un partenaire réel en
    // production : score 96/100, 7 niveaux approuvés, badge resté "verifie").
    // Founding Partner est le niveau de vérification le plus exigeant du site,
    // il doit donc toujours l'emporter sur un badge de niveau 8 antérieur.
    cert.level8.badgeAwarded = "fondateur";
    cert.level8.status       = "approved";
    cert.level8.reviewedAt   = now;
    cert.level8.awardedAt    = cert.level8.awardedAt || now;
    cert.certificationScore = computeScore(cert);
    cert.certificationBadge = computeBadge(cert);
    cert.overallStatus      = "approved";
    await cert.save();
    await syncUserBadge(userId, cert.certificationBadge);

    // 3. Vérification Partenaire — tous les critères validés (recalcul
    //    trustScore/trustLevel automatique via le pre("save") du modèle).
    let pv = await PartnerVerification.findOne({ userId });
    if (!pv) {
      pv = new PartnerVerification({
        userId,
        companyName: doc.companyInfo?.legalName || `${doc.companyInfo?.mainContact || "Founding Partner"}`,
        companyType: "autre",
        country:     doc.companyInfo?.registrationCountry || "",
        city:        "",
      });
    }
    for (const key of Object.keys(CRITERIA_WEIGHTS)) {
      pv.criteria[key] = {
        verified:   true,
        verifiedAt: now,
        verifiedBy: null,
        note:       pv.criteria[key]?.note || NOTE_AUTO,
        docUrl:     pv.criteria[key]?.docUrl || null,
      };
    }
    pv.status = "verifie";
    // Copier les vraies pièces/infos collectées pendant l'onboarding — avant ceci,
    // la cascade ne validait que les CRITÈRES (booléens) sans jamais recopier les
    // documents ni compléter le profil : l'onglet "Vérification Partenaires" de
    // l'admin affichait donc un dossier "vérifié" mais entièrement vide.
    pv.documents = pv.documents || {};
    pv.documents.businessLicenseDoc = pv.documents.businessLicenseDoc || doc.legalDocs?.businessLicense || doc.legalDocs?.businessRegistration || null;
    pv.documents.rccmDoc            = pv.documents.rccmDoc            || doc.legalDocs?.businessRegistration || null;
    pv.documents.taxIdDoc           = pv.documents.taxIdDoc           || doc.legalDocs?.taxCertificate || null;
    pv.documents.otherDoc           = pv.documents.otherDoc           || doc.legalDocs?.exportLicense || doc.legalDocs?.proofOfAddress || null;
    pv.logoUrl          = pv.logoUrl          || doc.platformMedia?.logo || null;
    pv.website           = pv.website           || doc.companyInfo?.website || "";
    pv.email              = pv.email              || doc.companyInfo?.email || "";
    pv.phone               = pv.phone               || doc.companyInfo?.phone || "";
    pv.description           = pv.description           || doc.businessVerification?.companyPresentation || "";
    pv.yearsExperience        = pv.yearsExperience        || doc.businessVerification?.yearsExperience || 0;
    if (!pv.exportCountries?.length) pv.exportCountries = doc.businessVerification?.exportMarkets || [];
    pv.documents.repIdDoc = pv.documents.repIdDoc || identityUser?.identity?.frontImage || doc.individualDoc?.file || null;
    await pv.save();

    // 4. Profil Importateur (Import/Export) — si un dossier existe déjà (ancien
    //    parcours /importer-apply, en attente ou refusé), le faire basculer
    //    "vérifié" lui aussi : le Founding Partner Program prime désormais sur
    //    cette candidature séparée pour l'accès à la publication export (voir
    //    ensureImporterProfile.js, appelé par importExportController).
    await ImporterPartnerProfile.findOneAndUpdate(
      { userId },
      { $set: { status: "verified", badgeLevel: "gold", reviewedAt: now, rejectionReason: null } }
    );

    logger.info("cascadeFoundingPartnerApproval : KYC/Certification/Vérification/Importateur synchronisés", { userId: userId.toString() });
  } catch (err) {
    // Non bloquant : l'Accord Founding Partner reste valide même si la
    // synchronisation d'un des systèmes annexes échoue (à examiner via ce log).
    logger.error("cascadeFoundingPartnerApproval:", err);
  }
}

// ── Auto-génération de l'Accord juste après signature de la LOI ──────────────
// Avant ceci, l'Accord de Partenariat n'était généré qu'après une action admin
// manuelle séparée (adminSendAgreement), obligeant à envoyer un second lien/email
// au partenaire après la signature de la LOI — deux liens pour un seul parcours.
// Désormais un seul lien (ou une seule visite du tableau de bord partenaire)
// suffit pour signer les deux documents à la suite : voir signLOI et la branche
// LOI de signByToken. Non bloquant : si la génération échoue, le dossier reste
// en "loi_signee" et l'admin peut toujours déclencher l'envoi manuel via
// adminSendAgreement (filet de sécurité conservé).
async function autoGenerateAgreement(doc, reuseToken = null) {
  const user = await User.findById(doc.userId).lean();
  const refDate = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  doc.agreement.content = await generateAgreement(doc, user, refDate);
  doc.agreement.sentAt  = new Date();
  if (reuseToken) {
    doc.agreement.signingToken        = reuseToken;
    doc.agreement.signingTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
  doc.status = "accord_envoye";
  await doc.save();
}

// ── Section update factory ────────────────────────────────────────────────────
const SECTION_FIELDS = {
  "company-info": ["legalName", "registrationNumber", "incorporationDate", "registrationCountry", "address", "website", "email", "phone", "whatsapp", "wechat", "mainContact", "mainContactPosition"],
  "legal-docs":   ["businessRegistration", "businessLicense", "exportLicense", "taxCertificate", "proofOfAddress"],
  "individual-doc": ["type", "file"],
  "business-verification": ["companyPresentation", "brands", "mainActivities", "exportMarkets", "annualExportCapacity", "yearsExperience", "oemAuthorization", "entityTypes"],
  "platform-media": ["logo", "companyPhotos", "officePhotos", "showroomPhotos", "warehousePhotos", "teamPhotos", "promotionalVideo"],
  "vehicle-inventory": ["newVehicles", "usedVehicles", "electricVehicles", "hybridVehicles", "luxuryVehicles", "commercialVehicles"],
  "export-capabilities": ["shippingPorts", "shippingMethods", "shippingPartners", "incoterms"],
  "payment-info": ["acceptedMethods", "bankName", "preferredCurrency"],
  "commercial-terms": ["minimumOrderQuantity", "depositPercentage", "depositTiming", "deliveryDays", "warrantyAvailable", "warrantyMonths", "inspectionType", "inspectionAgency", "paymentModes"],
};

const SECTION_KEYS = {
  "company-info": "companyInfo",
  "legal-docs": "legalDocs",
  "individual-doc": "individualDoc",
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
// Lecture seule : ne crée plus rien. Un simple GET (déclenché par une navigation,
// un retour arrière, un bot, un pré-chargement de lien) ne doit jamais avoir d'effet
// de bord — la création du dossier (et la promotion de rôle qui va avec) exige
// désormais un clic explicite sur "Commencer ma candidature" (voir applyToProgram).
export const getMyOnboarding = async (req, res) => {
  try {
    const doc = await PartnerOnboarding.findOne({ userId: req.user.id });
    if (!doc) return res.status(404).json({ message: "Aucun dossier existant.", notStarted: true });
    res.json({ onboarding: doc.toObject({ virtuals: true }) });
  } catch (err) {
    logger.error("getMyOnboarding:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── POST /api/partner-onboarding/apply ───────────────────────────────────────
// Action explicite (bouton "Commencer ma candidature") : crée le dossier et, si besoin,
// promeut le compte au rôle "partenaire". C'est la SEULE façon de créer un dossier —
// contrairement à l'ancien comportement où un simple GET le faisait déjà.
export const applyToProgram = async (req, res) => {
  try {
    const existing = await PartnerOnboarding.findOne({ userId: req.user.id });
    if (existing) return res.json({ onboarding: existing.toObject({ virtuals: true }) });

    const country = req.user.country || null;
    const check = await checkFoundingCapacity(country);
    if (!check.ok) {
      return res.status(403).json({ message: check.message, programFull: true });
    }
    if (!["partenaire", "admin"].includes(req.user.role)) {
      await User.findByIdAndUpdate(req.user.id, { role: "partenaire" });
      await notify(req.user.id, "🤝 Compte partenaire activé", "Votre compte est maintenant un compte partenaire suite à votre candidature au programme Founding Partner.");
    }
    // Reprend le statut choisi à l'inscription (Register.jsx — particulier/
    // professionnel/entreprise) : sans ça, le dossier démarrait toujours sur
    // "entreprise" par défaut, même pour un partenaire ayant explicitement
    // choisi "particulier" ou "professionnel", l'obligeant à re-choisir un
    // statut déjà donné et risquant une incohérence entre les deux.
    const legalEntityType = ["particulier", "professionnel", "entreprise"].includes(req.user.sellerType)
      ? req.user.sellerType
      : "entreprise";
    const doc = await PartnerOnboarding.create({ userId: req.user.id, country, legalEntityType });
    res.status(201).json({ onboarding: doc.toObject({ virtuals: true }) });
  } catch (err) {
    logger.error("applyToProgram:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/partner-onboarding/availability (public) ─────────────────────────
// Permet d'afficher "programme complet" avant même l'inscription, plutôt que de
// laisser un candidat remplir tout le dossier pour se le voir refuser à la fin.
// ?country=XX (code ISO) pour vérifier la limite du pays du visiteur — sans ce
// paramètre, vérifie la limite globale (tous pays confondus) par compatibilité.
export const getAvailability = async (req, res) => {
  try {
    const country = req.query.country ? String(req.query.country).toUpperCase().slice(0, 2) : null;
    const check = await checkFoundingCapacity(country);
    res.json({ available: check.ok, message: check.ok ? null : check.message, country });
  } catch (err) {
    logger.error("getAvailability:", err);
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
    if (!doc) doc = await PartnerOnboarding.create({ userId: req.user.id, country: req.user.country || null });

    if (["accord_signe", "actif"].includes(doc.status)) {
      return res.status(400).json({ message: "Dossier finalisé — modifications non autorisées." });
    }

    const MAX_FILE_BYTES = 6 * 1024 * 1024; // 6 Mo en base64 ≈ 5 Mo réels
    const update = {};
    for (const field of fields) {
      if (field in req.body) {
        const val = req.body[field];
        // Valider les fichiers base64 : taille ET type réel (magic bytes) — pas
        // seulement le préfixe "data:" déclaré, qu'un client malveillant peut
        // usurper (ex: un SVG contenant du script passerait un simple contrôle
        // de taille). S'applique aussi aux champs tableaux (companyPhotos, etc.).
        const candidates = Array.isArray(val) ? val : [val];
        for (const item of candidates) {
          if (typeof item === "string" && item.startsWith("data:")) {
            const check = validateDocumentDataUri(item, MAX_FILE_BYTES);
            if (!check.ok) {
              return res.status(400).json({ message: `Le fichier "${field}" est invalide : ${check.message}` });
            }
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
    if (!doc) doc = await PartnerOnboarding.create({ userId: req.user.id, country: req.user.country || null });

    doc.partnerType = partnerType;
    await doc.save();
    res.json({ success: true, onboarding: doc.toObject({ virtuals: true }) });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/partner-onboarding/legal-entity-type ──────────────────────────
// Détermine l'exigence documentaire à la soumission (voir submitApplication) :
// un particulier ne doit jamais être soumis aux mêmes exigences qu'une
// entreprise (RCCM, licence commerciale...) — une seule pièce d'identité
// suffit. Changer de statut ne supprime pas les documents déjà fournis (le
// partenaire peut revenir en arrière sans perdre sa saisie).
export const updateLegalEntityType = async (req, res) => {
  try {
    const VALID = ["particulier", "professionnel", "entreprise"];
    const { legalEntityType } = req.body;
    if (!VALID.includes(legalEntityType)) return res.status(400).json({ message: "Statut partenaire invalide." });

    let doc = await PartnerOnboarding.findOne({ userId: req.user.id });
    if (!doc) doc = await PartnerOnboarding.create({ userId: req.user.id, country: req.user.country || null });

    doc.legalEntityType = legalEntityType;
    await doc.save();
    res.json({ success: true, onboarding: doc.toObject({ virtuals: true }) });
  } catch (err) {
    logger.error("updateLegalEntityType:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/partner-onboarding/accept-legal ───────────────────────────────
// Enregistre l'acceptation électronique de la LOI, du Founding Partner Agreement et
// de la Partner Verification Policy — requis avant de pouvoir soumettre le dossier.
export const acceptLegalDocuments = async (req, res) => {
  try {
    if (!req.body.accepted) {
      return res.status(400).json({ message: "L'acceptation des documents légaux est requise." });
    }
    let doc = await PartnerOnboarding.findOne({ userId: req.user.id });
    if (!doc) doc = await PartnerOnboarding.create({ userId: req.user.id, country: req.user.country || null });

    doc.legalAcceptance = {
      accepted: true,
      acceptedAt: new Date(),
      ip: req.ip || null,
    };
    await doc.save();
    await addAudit(doc._id, "DOCUMENTS_LEGAUX_ACCEPTES", req.user.id, "LOI + Founding Partner Agreement + Verification Policy acceptés électroniquement");

    res.json({ success: true, onboarding: doc.toObject({ virtuals: true }) });
  } catch (err) {
    logger.error("acceptLegalDocuments:", err);
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
    // Exigence documentaire différente selon le statut légal (voir
    // updateLegalEntityType) : un particulier n'a ni raison sociale, ni RCCM —
    // on ne doit jamais lui demander l'un ou l'autre. Une seule pièce
    // justificative au choix (CNI, passeport, autre) suffit à rendre son
    // dossier soumissible ; pour un professionnel/une entreprise, les
    // documents légaux classiques restent exigés (au moins un des cinq
    // possibles, au choix ou combinés — jusqu'ici seuls deux des cinq
    // comptaient, ce qui pénalisait un partenaire n'ayant fourni que sa
    // licence d'export ou son attestation fiscale par exemple).
    if (doc.legalEntityType === "particulier") {
      if (!doc.individualDoc?.file) {
        return res.status(400).json({ message: "Fournissez au moins une pièce justificative (pièce d'identité, passeport ou autre document) avant de soumettre." });
      }
    } else {
      if (!doc.companyInfo?.legalName) {
        return res.status(400).json({ message: "Le nom légal de l'entreprise est requis avant de soumettre." });
      }
      const hasAnyLegalDoc = ["businessRegistration", "businessLicense", "exportLicense", "taxCertificate", "proofOfAddress"]
        .some((k) => !!doc.legalDocs?.[k]);
      if (!hasAnyLegalDoc) {
        return res.status(400).json({ message: "Fournissez au moins un document légal (certificat d'immatriculation, licence commerciale, licence d'export, attestation fiscale ou justificatif d'adresse) avant de soumettre." });
      }
    }
    if (!doc.legalAcceptance?.accepted) {
      return res.status(400).json({ message: "Vous devez accepter la Letter of Intent, le Founding Partner Agreement et la Verification Policy avant de soumettre." });
    }

    // Dossier créé avant l'ajout du champ `country` (ou via un auto-create de
    // section qui ne le renseignait pas) — on le complète ici par cohérence
    // (utilisé ailleurs pour le filtrage CRM par pays), sans incidence sur la
    // soumission elle-même : le programme n'a plus de plafond par pays (voir
    // checkFoundingCapacity — devenu obligatoire pour tout partenaire).
    if (!doc.country && req.user.country) doc.country = req.user.country;

    doc.status = "soumis";
    await doc.save();
    await addAudit(doc._id, "DOSSIER_SOUMIS", req.user.id, "Candidature soumise par le partenaire");

    const admins = await User.find({ role: "admin" }).select("_id").lean();
    for (const admin of admins) {
      await notify(admin._id,
        "📋 Nouvelle candidature Founding Partner",
        `${applicantDisplayName(doc, req.user)} (réf. ${doc.referenceNumber}) a soumis sa candidature au programme Founding Partner.`
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

    // Enchaîne immédiatement sur l'Accord — un seul lien/une seule visite du
    // tableau de bord suffit pour signer les deux documents à la suite.
    let chained = false;
    try {
      await autoGenerateAgreement(doc);
      chained = true;
      await addAudit(doc._id, "ACCORD_ENVOYE", null, "Généré automatiquement après signature de la LOI");
    } catch (agrErr) {
      logger.error("autoGenerateAgreement (signLOI):", agrErr.message);
    }

    await notify(doc.userId,
      chained ? "✅ LOI signée — Signez maintenant l'Accord" : "✅ LOI signée — Accord de partenariat en cours",
      chained
        ? "Votre Lettre d'Intention a été signée avec succès. Votre Accord de Partenariat Fondateur est prêt : signez-le dès maintenant depuis votre tableau de bord."
        : "Votre Lettre d'Intention a été signée avec succès. Notre équipe prépare votre Accord de Partenariat Fondateur."
    );

    dispatch.loiSigned(req.user.email, req.user.id, {
      firstName:   req.user.firstName,
      companyName: doc.companyInfo?.legalName,
      loiRef:      doc.referenceNumber,
    }).catch((e) => logger.error("dispatch.loiSigned:", e.message));

    const admins = await User.find({ role: "admin" }).select("_id").lean();
    for (const admin of admins) {
      await notify(admin._id, "LOI signée",
        chained
          ? `${applicantDisplayName(doc, req.user)} (${doc.referenceNumber}) a signé la LOI. Accord généré automatiquement et en attente de signature.`
          : `${applicantDisplayName(doc, req.user)} (${doc.referenceNumber}) a signé la LOI. Veuillez envoyer l'Accord de Partenariat.`
      );
    }

    res.json({ success: true, status: doc.status });
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
    doc.isFoundingPartner = true;
    await doc.save();

    // Activer le partenaire comme Founding Partner + synchroniser KYC,
    // Certification et Vérification Partenaire (voir cascadeFoundingPartnerApproval).
    await User.findByIdAndUpdate(doc.userId, { $set: { isFounder: true } });
    await cascadeFoundingPartnerApproval(doc);

    await addAudit(doc._id, "ACCORD_SIGNE", req.user.id, `Signé par: ${signerName} — Commissions verrouillées`);

    await notify(doc.userId,
      "🎉 Bienvenue dans le programme Founding Partner VIT-AUTO !",
      `Félicitations ! Votre accord de partenariat fondateur a été signé. Votre badge exclusif "Founding Partner" est maintenant actif. Commissions : Location ${doc.commissions.location}% / Vente ${doc.commissions.vente}%.`
    );

    dispatch.agreementSigned(req.user.email, req.user.id, {
      firstName:      req.user.firstName,
      companyName:    doc.companyInfo?.legalName,
      commissionRate: doc.commissions.location,
      networkRate:    doc.commissions.vente,
      dashboardUrl:   `${APP_URL}/partner-pms`,
    }).catch((e) => logger.error("dispatch.agreementSigned:", e.message));

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
    const { status, partnerType, crmStatus, search, page = 1, limit = 20 } = req.query;
    const VALID_STATUS      = ["brouillon","soumis","en_review","loi_envoyee","loi_signee","accord_envoye","accord_signe","actif","rejete","info_demandee"];
    const VALID_PARTNER_TYPE = ["founding","standard"];
    const VALID_CRM_STATUS  = ["interested","reserved","verified","active","inactive"];
    const filter = {};
    if (status      && VALID_STATUS.includes(status))           filter.status = status;
    if (partnerType && VALID_PARTNER_TYPE.includes(partnerType)) filter.partnerType = partnerType;
    if (crmStatus   && VALID_CRM_STATUS.includes(crmStatus))    filter["adminCRM.crmStatus"] = crmStatus;
    if (search) {
      const safe = escapeRegex(String(search).slice(0, 100));
      filter["companyInfo.legalName"] = { $regex: safe, $options: "i" };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [docs, total] = await Promise.all([
      PartnerOnboarding.find(filter)
        .populate("userId", "firstName lastName email phone profilePhoto certificationBadge country")
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

    const loiContent = await generateLOI(doc, user, refDate);
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
    const agreementContent = await generateAgreement(doc, user, refDate);
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

    const doc = await PartnerOnboarding.findById(req.params.id)
      .populate("userId", "firstName lastName email");
    if (!doc) return res.status(404).json({ message: "Dossier introuvable." });

    const partner = doc.userId;
    doc.status = "info_demandee";
    doc.adminReview.infoRequested = infoRequested.trim();
    doc.adminReview.reviewedBy    = req.user.id;
    doc.adminReview.reviewedAt    = new Date();
    await doc.save();

    await addAudit(doc._id, "INFO_DEMANDEE", req.user.id, infoRequested);

    const partnerId = partner._id || partner;
    await notify(partnerId,
      "📝 Informations complémentaires requises",
      `Notre équipe a besoin d'informations supplémentaires pour traiter votre candidature : ${infoRequested}. Mettez à jour votre dossier et resoumettez.`
    );

    // Email — un partenaire resté en "brouillon" ne consulte pas forcément le
    // site : une notification in-app seule (comportement précédent) ne le
    // touche jamais s'il n'est pas déjà connecté.
    if (partner?.email) {
      dispatch.foundingPartnerInfoRequested(partner.email, String(partnerId), {
        firstName:       partner.firstName,
        companyName:     doc.companyInfo?.legalName,
        infoRequested:   infoRequested.trim(),
        referenceNumber: doc.referenceNumber,
      }).catch((e) => logger.error("dispatch.foundingPartnerInfoRequested:", e.message));
    }

    res.json({ success: true, status: "info_demandee" });
  } catch (err) {
    logger.error("adminRequestInfo:", err);
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

// ── PATCH /api/partner-onboarding/admin/:id/crm ──────────────────────────────
export const adminUpdateCRM = async (req, res) => {
  try {
    const VALID_CRM_STATUS   = ["interested", "reserved", "verified", "active", "inactive"];
    const VALID_CHANNELS     = ["whatsapp", "wechat", "email", "phone", "meeting", "other", ""];
    const VALID_PRIORITY     = ["high", "medium", "low"];

    const {
      crmStatus, lastContactDate, lastContactChannel,
      nextFollowUpDate, internalNotes, priority,
    } = req.body;

    const parseSafeDate = (val) => {
      if (!val || typeof val !== "string" || val.length > 50) return null;
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    };

    const update = {};
    if (crmStatus         !== undefined && VALID_CRM_STATUS.includes(crmStatus))   update["adminCRM.crmStatus"]          = crmStatus;
    if (lastContactDate   !== undefined) update["adminCRM.lastContactDate"]   = parseSafeDate(lastContactDate);
    if (lastContactChannel !== undefined && VALID_CHANNELS.includes(lastContactChannel)) update["adminCRM.lastContactChannel"] = lastContactChannel;
    if (nextFollowUpDate  !== undefined) update["adminCRM.nextFollowUpDate"]  = parseSafeDate(nextFollowUpDate);
    if (internalNotes     !== undefined) update["adminCRM.internalNotes"]     = String(internalNotes).slice(0, 2000);
    if (priority          !== undefined && VALID_PRIORITY.includes(priority)) update["adminCRM.priority"] = priority;
    if (Object.keys(update).length === 0)
      return res.status(400).json({ message: "Aucune donnée CRM valide fournie." });

    update.updatedAt = new Date();

    const doc = await PartnerOnboarding.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, select: "adminCRM companyInfo.legalName" }
    );
    if (!doc) return res.status(404).json({ message: "Dossier introuvable." });

    await addAudit(doc._id, "CRM_UPDATED", req.user.id, `crmStatus=${doc.adminCRM.crmStatus}`);
    res.json({ success: true, adminCRM: doc.adminCRM });
  } catch (err) {
    logger.error("adminUpdateCRM:", err);
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

      // Enchaîne immédiatement sur l'Accord en réutilisant EXACTEMENT le même
      // token/lien — le partenaire n'a besoin que d'un seul lien envoyé par email
      // pour signer la LOI puis, dans la foulée, l'Accord de Partenariat.
      let chained = false;
      try {
        await autoGenerateAgreement(doc, token);
        chained = true;
        await addAudit(doc._id, "ACCORD_ENVOYE", null, "Généré automatiquement après signature de la LOI (lien combiné)");
      } catch (agrErr) {
        logger.error("autoGenerateAgreement (signByToken):", agrErr.message);
      }

      await notify(doc.userId,
        chained ? "✅ LOI signée — Signez maintenant l'Accord" : "✅ LOI signée — Accord en préparation",
        chained
          ? "Votre Lettre d'Intention a été signée via le lien sécurisé. Le même lien vous permet maintenant de signer votre Accord de Partenariat Fondateur."
          : "Votre Lettre d'Intention a été signée via le lien sécurisé. Notre équipe prépare votre Accord de Partenariat Fondateur."
      );

      const loiSigner = await User.findById(doc.userId).select("email firstName").lean();
      if (loiSigner) {
        dispatch.loiSigned(loiSigner.email, doc.userId, {
          firstName:   loiSigner.firstName,
          companyName: doc.companyInfo?.legalName,
          loiRef:      doc.referenceNumber,
        }).catch((e) => logger.error("dispatch.loiSigned:", e.message));
      }

      const admins = await User.find({ role: "admin" }).select("_id").lean();
      for (const admin of admins) {
        await notify(admin._id, "LOI signée (lien sécurisé)",
          chained
            ? `${doc.companyInfo?.legalName} (${doc.referenceNumber}) a signé la LOI via le lien email. Accord généré automatiquement sur le même lien.`
            : `${doc.companyInfo?.legalName} (${doc.referenceNumber}) a signé la LOI via le lien email.`);
      }
      return res.json({ success: true, type: "loi", status: doc.status, chained, documentHash: hash });
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
      doc.isFoundingPartner = true;
      await doc.save();

      await User.findByIdAndUpdate(doc.userId, { $set: { isFounder: true } });
      await cascadeFoundingPartnerApproval(doc);

      await addAudit(doc._id, "ACCORD_SIGNE_PAR_LIEN", null, `Via lien sécurisé — IP: ${ip}`);

      await notify(doc.userId, "🎉 Bienvenue dans le programme Founding Partner VIT-AUTO !",
        `Votre accord a été signé. Badge "Founding Partner" activé ! Commissions : Location ${doc.commissions.location}% / Vente ${doc.commissions.vente}%.`);

      const agreementSigner = await User.findById(doc.userId).select("email firstName").lean();
      if (agreementSigner) {
        dispatch.agreementSigned(agreementSigner.email, doc.userId, {
          firstName:      agreementSigner.firstName,
          companyName:    doc.companyInfo?.legalName,
          commissionRate: doc.commissions.location,
          networkRate:    doc.commissions.vente,
          dashboardUrl:   `${APP_URL}/partner-pms`,
        }).catch((e) => logger.error("dispatch.agreementSigned:", e.message));
      }

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

export async function generateLOI(doc, user, date) {
  const company   = doc.companyInfo?.legalName   || "—";
  const contact   = doc.companyInfo?.mainContact || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "—";
  const position  = doc.companyInfo?.mainContactPosition || "—";
  const country   = doc.companyInfo?.registrationCountry || "—";
  const email     = doc.companyInfo?.email || user.email || "—";
  const typeLabel = PARTNER_TYPE_LABELS[doc.partnerType] || doc.partnerType;
  const loiTier   = doc.legalEntityType === "particulier" ? "particulier" : "entreprise";

  // Conditions commerciales lues live depuis PricingConfig (jamais figées dans
  // le texte légal) — reflète exactement ce que pricingEngine.resolveCommissionRate
  // applique réellement à la facturation, même si l'admin les modifie ensuite.
  const config       = await getConfig();
  const fpRate       = config.foundingPartner[loiTier];
  const fpDuration   = config.foundingPartner.durationMonths;
  const stdLocation  = Math.round(config.commissions.standard.location * 100);
  const stdVente     = Math.round(config.commissions.standard.vente * 100);
  const businessSub  = config.subscriptions.business?.priceUSD ?? 0;

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
Program          : Founding Partner Program (limited to the first 20 partners per country)
Reference        : ${doc.referenceNumber}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FOUNDING PARTNER BENEFITS

  ✓  Free Premium Subscription ......... ${fpDuration} months (value: $${(businessSub * fpDuration).toFixed(0)}+)
  ✓  Rental Commission ................. ${fpRate.location * 100}% for ${fpDuration} months, then standard rate (${stdLocation}%)
  ✓  Sales Commission .................. ${fpRate.vente * 100}% for ${fpDuration} months, then standard rate (${stdVente}%)
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

export async function generateAgreement(doc, user, date) {
  const company   = doc.companyInfo?.legalName   || "—";
  const contact   = doc.companyInfo?.mainContact || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "—";
  const position  = doc.companyInfo?.mainContactPosition || "—";
  const country   = doc.companyInfo?.registrationCountry || "—";
  const regNum    = doc.companyInfo?.registrationNumber  || "—";
  const email     = doc.companyInfo?.email || user.email || "—";
  const typeLabel = PARTNER_TYPE_LABELS[doc.partnerType] || doc.partnerType;
  const agrTier   = doc.legalEntityType === "particulier" ? "particulier" : "entreprise";

  // Conditions commerciales lues live depuis PricingConfig — voir generateLOI.
  const config      = await getConfig();
  const fpRate      = config.foundingPartner[agrTier];
  const fpDuration  = config.foundingPartner.durationMonths;
  const stdLocation = Math.round(config.commissions.standard.location * 100);
  const stdVente    = Math.round(config.commissions.standard.vente * 100);
  const stdDrv      = Math.round(config.commissions.standard.chauffeur * 100);
  const drvRate     = doc.commissions?.chauffeur || stdDrv;

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
     member of the exclusive first cohort (limited to 20 partners
     per country).

2.2  This status is non-transferable and permanently recorded
     in the Partner profile under reference ${doc.referenceNumber}.

2.3  Partner type: ${typeLabel}

2.4  The exclusive "Founding Partner" badge is displayed
     on all Partner listings for the duration of the partnership.

ARTICLE 3 — COMMERCIAL CONDITIONS

3.1  Preferential rate for ${fpDuration} months from the Agreement signing date, then automatic return to the standard rate:

     Transaction Type       Standard Rate   Founding Partner Rate (${fpDuration} months)
     ─────────────────────────────────────────────────────────────────
     Vehicle Rental         ${stdLocation}%             ${fpRate.location * 100}%
     Vehicle Sales          ${stdVente}%              ${fpRate.vente * 100}%
     Professional Driver    ${stdDrv}%             ${drvRate}%
     Premium Subscription   Paid            FREE (${fpDuration} months)

3.2  The Founding Partner rate above applies for the first ${fpDuration} months
     from the Agreement signing date (Article 3.3). From month ${fpDuration + 1}
     onward, the Standard Rate applies automatically, without requiring
     a new agreement or admin action.

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
