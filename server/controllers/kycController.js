import logger from "../utils/logger.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { sendEmail } from "../config/email.js";
import { dispatch } from "../queue/index.js";
import { logAction } from "../middleware/auditLog.js";
import { validateImageDataUri } from "../utils/imageValidation.js";
import { smsConfigured } from "../utils/smsConfigured.js";
import { emailVerificationRequiredForKyc } from "../utils/emailVerificationRequired.js";
import { encryptField, decryptField, hmacIndex } from "../utils/fieldEncryption.js";
import { captureException } from "../config/sentry.js";
import { unpublishPartnerListings } from "../utils/partnerListings.js";
import { notifyAdmins } from "../utils/notifyAdmins.js";

const MAX_KYC_IMAGE_BYTES = 6 * 1024 * 1024; // 6 Mo — cohérent avec usersController/partnerOnboarding

// ── Ajouter une entrée dans le journal d'audit ────────────────────────────────
async function addAuditLog(userId, action, performedBy = null, note = null) {
  await User.findByIdAndUpdate(userId, {
    $push: { kycAuditLog: { action, performedBy, note, timestamp: new Date() } },
  }).catch(() => {});
}

// ── GET /api/kyc/status ───────────────────────────────────────────────────────
export const getKycStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "email phone emailVerified phoneVerified identity kycStatus kycScore kycBadge kycSubmittedAt kycDocumentHash kycOcrData kycFaceMatchScore kycReviewNote kycRejectionReason driverLicenseOcr"
    );
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });

    res.json({
      hasEmail:          !!user.email,
      hasPhone:          !!user.phone,
      emailVerified:     user.emailVerified || false,
      phoneVerified:     user.phoneVerified || false,
      identityStatus:    user.identity?.status || "not_submitted",
      kycStatus:         user.kycStatus || "EN_ATTENTE",
      kycScore:          user.kycScore  ?? 0,
      kycBadge:          user.kycBadge  ?? "INSUFFISANT",
      kycSubmittedAt:    user.kycSubmittedAt ?? null,
      documentType:      user.identity?.type ?? null,
      kycOcrData:        user.kycOcrData ?? null,
      kycFaceMatchScore: user.kycFaceMatchScore ?? null,
      kycReviewNote:     user.kycReviewNote ?? null,
      kycRejectionReason: user.kycRejectionReason ?? null,
      driverLicenseOcr:  user.driverLicenseOcr ?? null,
      // Tant qu'aucun provider SMS réel n'est configuré, la vérification téléphone
      // ne doit jamais bloquer le parcours KYC (voir smsConfigured() dans
      // authController.js — sinon aucun utilisateur ne pourrait jamais recevoir de code).
      smsAvailable:      smsConfigured(),
      emailVerificationRequired: emailVerificationRequiredForKyc(),
    });
  } catch (err) {
    logger.error("getKycStatus:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── POST /api/kyc/submit ──────────────────────────────────────────────────────
// Nouveau flux : exige une image de document + données OCR extraites côté client.
// Le numéro seul ne suffit plus.
export const submitKyc = async (req, res) => {
  try {
    const {
      // Données OCR extraites du document (frontpopulées côté client via Tesseract)
      ocrData,         // { firstName, lastName, birthDate, gender, documentNumber, expiryDate, issuingCountry, documentType, rawOcrText, ocrConfidence }
      documentType,    // type sélectionné par l'utilisateur
      frontImageHash,  // SHA-256 de l'image recto
      backImageHash,   // SHA-256 de l'image verso
      selfieUploaded,  // boolean
      faceMatchScore,  // score 0–100 de correspondance visage-document
      // Images base64 (stockées pour le partenaire)
      frontImageData,  // base64 du recto de la pièce
      backImageData,   // base64 du verso de la pièce
      selfieData,      // base64 du selfie
      // Données de vérification étape 1
      emailVerified,
      phoneVerified,
    } = req.body;

    // ── Validation minimale : hash de l'image obligatoire ─────────────────────
    if (!frontImageHash) {
      return res.status(400).json({
        message: "La photo du document est obligatoire.",
        code: "DOCUMENT_IMAGE_REQUIRED",
      });
    }

    // ── Validation taille/type réel des images (avant tout traitement coûteux) ─
    for (const [label, img] of [["recto", frontImageData], ["verso", backImageData], ["selfie", selfieData]]) {
      const check = validateImageDataUri(img, MAX_KYC_IMAGE_BYTES);
      if (!check.ok) {
        return res.status(400).json({ message: `Photo (${label}) : ${check.message}`, code: "INVALID_IMAGE" });
      }
    }

    // ── Anti-spam : cooldown 60s entre soumissions ────────────────────────────
    const currentUser = await User.findById(req.user.id).select("kycStatus kycSubmittedAt");
    if (currentUser?.kycStatus === "EN_ATTENTE" && currentUser.kycSubmittedAt) {
      const elapsed = (Date.now() - new Date(currentUser.kycSubmittedAt).getTime()) / 1000;
      if (elapsed < 60) {
        return res.status(429).json({
          message: "Veuillez patienter avant de resoumettre votre dossier KYC.",
          code: "KYC_SUBMISSION_TOO_SOON",
          retryAfter: Math.ceil(60 - elapsed),
        });
      }
    }

    // ocrData peut être vide ou partiel — on accepte toujours, mais on force la révision manuelle
    const safeOcrData = ocrData && typeof ocrData === "object" ? ocrData : {};
    const ocrConf = Number(safeOcrData.ocrConfidence || 0);

    // ── Détection doublon document ────────────────────────────────────────────
    if (frontImageHash) {
      const existing = await User.findOne({
        kycDocumentHash: frontImageHash,
        _id: { $ne: req.user.id },
      });
      if (existing) {
        await addAuditLog(req.user.id, "DUPLICATE_DOCUMENT_BLOCKED", null, `Hash: ${frontImageHash}`);
        return res.status(409).json({
          message: "Ce document est déjà associé à un autre compte. Contactez le support VIT AUTO.",
          code: "DOCUMENT_ALREADY_USED",
        });
      }
    }

    // ── Détection doublon numéro (seulement si un numéro lisible a été extrait) ─
    // documentNumber est chiffré au repos (IV aléatoire, non cherchable par
    // égalité) — la détection de doublon passe par un HMAC déterministe dédié
    // (documentNumberHash), jamais par le numéro en clair. Voir fieldEncryption.js.
    const documentNumberHash = safeOcrData.documentNumber && safeOcrData.documentNumber.length >= 5
      ? hmacIndex(safeOcrData.documentNumber)
      : null;
    if (documentNumberHash) {
      const existingNum = await User.findOne({
        "kycOcrData.documentNumberHash": documentNumberHash,
        _id: { $ne: req.user.id },
        kycStatus: { $in: ["VERIFIE", "EN_ATTENTE", "A_REVOIR_MANUELLEMENT"] },
      });
      if (existingNum) {
        await addAuditLog(req.user.id, "DUPLICATE_NUMBER_BLOCKED", null, "Numéro de document déjà utilisé sur un autre compte");
        return res.status(409).json({
          message: "Ce numéro de document est déjà associé à un autre compte. Contactez le support.",
          code: "DOCUMENT_NUMBER_ALREADY_USED",
        });
      }
    }

    // ── Selfie obligatoire ─────────────────────────────────────────────────────
    if (!selfieUploaded) {
      return res.status(400).json({
        message: "Le selfie est obligatoire pour soumettre votre dossier KYC.",
        code: "SELFIE_REQUIRED",
      });
    }

    // ── Vérification expiration (si date extraite) ────────────────────────────
    let isExpired = false;
    if (safeOcrData.expiryDate) {
      try {
        const ts = new Date(safeOcrData.expiryDate).getTime();
        if (!isNaN(ts)) isExpired = ts < Date.now();
      } catch { isExpired = false; }
    }
    if (isExpired) {
      return res.status(400).json({
        message: "Document expiré détecté. Fournissez un document en cours de validité.",
        code: "DOCUMENT_EXPIRED",
      });
    }

    // ── Calcul du statut KYC ──────────────────────────────────────────────────
    const faceConf = Number(faceMatchScore || 0);
    const hasEmail = emailVerified || false;
    const hasPhone = phoneVerified || false;

    // OCR partiel → révision manuelle automatique
    const hasUsableOcr = ocrConf >= 40 &&
      (safeOcrData.firstName || safeOcrData.lastName || safeOcrData.documentNumber);

    let newKycScore = 0;
    let newKycBadge = "INSUFFISANT";
    let newKycStatus = "EN_ATTENTE";
    let autoValidated = false;

    if (hasEmail)       newKycScore += 15;
    if (hasPhone)       newKycScore += 15;
    if (frontImageHash) newKycScore += 20;
    if (ocrConf >= 60)  newKycScore += 25;
    if (faceConf >= 80) newKycScore += 15;
    if (safeOcrData.firstName && safeOcrData.lastName && safeOcrData.birthDate) newKycScore += 10;
    newKycScore = Math.min(newKycScore, 100);

    if (newKycScore >= 80) newKycBadge = "CERTIFIÉ";
    else if (newKycScore >= 60) newKycBadge = "VÉRIFIÉ";

    // ── IMPORTANT ─────────────────────────────────────────────────────────────
    // ocrConfidence et faceMatchScore sont calculés CÔTÉ CLIENT (Tesseract.js dans
    // le navigateur) et transmis tels quels dans req.body : le serveur n'a aucun
    // moyen de vérifier indépendamment ces valeurs. Un utilisateur malveillant peut
    // les falsifier (ex: {ocrConfidence:100, faceMatchScore:100}) pour obtenir un
    // statut "VERIFIE" sans jamais avoir fourni de vrai document. Tant qu'un OCR/
    // face-match serveur (ou un prestataire tiers) n'est pas branché, AUCUNE
    // soumission n'est auto-validée — un admin doit toujours confirmer via
    // reviewKyc(). Le score ci-dessus reste utile pour prioriser la file de
    // révision manuelle (badge affiché à l'admin), pas pour décider seul.
    if (!hasUsableOcr || ocrConf < 30 || !selfieUploaded) {
      // OCR illisible ou selfie absent → révision manuelle prioritaire
      newKycStatus = "A_REVOIR_MANUELLEMENT";
    } else {
      newKycStatus = "EN_ATTENTE";
    }

    // ── Mise à jour en base ───────────────────────────────────────────────────
    const ocrProcessed = {
      firstName:      safeOcrData.firstName      || null,
      lastName:       safeOcrData.lastName       || null,
      birthDate:      safeOcrData.birthDate      ? new Date(safeOcrData.birthDate) : null,
      gender:         safeOcrData.gender         || null,
      // Chiffrés au repos — voir fieldEncryption.js. documentNumberHash (déterministe,
      // non réversible) reste seul cherchable, pour la détection de doublon ci-dessus.
      documentNumber:     encryptField(safeOcrData.documentNumber) || null,
      documentNumberHash,
      expiryDate:     safeOcrData.expiryDate     ? new Date(safeOcrData.expiryDate) : null,
      issuingCountry: safeOcrData.issuingCountry || null,
      documentType:   documentType               || safeOcrData.documentType || null,
      rawOcrText:     encryptField(safeOcrData.rawOcrText) || null,
      ocrConfidence:  ocrConf,
      isExpired,
      processedAt:    new Date(),
      qualityScore:   ocrConf,
    };

    await User.findByIdAndUpdate(req.user.id, {
      $set: {
        kycStatus:          newKycStatus,
        kycScore:           newKycScore,
        kycBadge:           newKycBadge,
        kycSubmittedAt:     new Date(),
        kycDocumentHash:    frontImageHash || null,
        kycOcrData:         ocrProcessed,
        kycFaceMatchScore:  faceConf,
        documentsVerified:  newKycStatus === "VERIFIE",
        "identity.type":    documentType || safeOcrData.documentType || null,
        "identity.number":  encryptField(safeOcrData.documentNumber) || null,
        "identity.status":  newKycStatus === "VERIFIE" ? "verified" : "pending",
        "identity.submittedAt": new Date(),
        "identity.verifiedAt":  newKycStatus === "VERIFIE" ? new Date() : null,
        // Images du document — chiffrées au repos (AES-256-GCM, voir fieldEncryption.js)
        ...(frontImageData ? { "identity.frontImage": encryptField(frontImageData) } : {}),
        ...(backImageData  ? { "identity.backImage":  encryptField(backImageData)  } : {}),
        ...(selfieData     ? { "identity.selfie":     encryptField(selfieData)     } : {}),
      },
    });

    // Journal d'audit
    const auditMsg = autoValidated
      ? `Validation automatique — OCR: ${ocrConf}%, Face: ${faceConf}%`
      : `Soumission KYC — Score: ${newKycScore}/100 — Statut: ${newKycStatus}`;
    await addAuditLog(req.user.id, autoValidated ? "AUTO_VERIFIED" : "SUBMITTED", null, auditMsg);

    // Dispatch queue : validation serveur + email confirmation
    const userForDispatch = await User.findById(req.user.id).select("email firstName").lean();
    dispatch.kycSubmitted(req.user.id, userForDispatch?.email, userForDispatch?.firstName)
      .catch((e) => logger.error("dispatch.kycSubmitted:", { error: e.message }));

    // ── Notifier les admins (non bloquant) ───────────────────────────────
    // Bug réel corrigé (audit) : aucune soumission KYC n'est jamais
    // auto-validée (voir commentaire plus haut — un admin doit toujours
    // confirmer via reviewKyc()), pourtant les admins n'étaient jamais
    // alertés d'une nouvelle soumission. Le message "vous serez notifié
    // sous 24h" suppose une file de traitement active côté admin qui, en
    // réalité, ne l'était jamais.
    notifyAdmins(
      "kyc_submitted",
      "🪪 Nouvelle vérification d'identité à examiner",
      `${userForDispatch?.firstName || "Un utilisateur"} a soumis son KYC (statut : ${newKycStatus}, score ${newKycScore}/100).`,
      "/admin",
    ).catch((e) => logger.error("notifyAdmins submitKyc (non bloquant) :", e.message));

    res.json({
      success:      true,
      kycStatus:    newKycStatus,
      kycScore:     newKycScore,
      kycBadge:     newKycBadge,
      autoValidated,
      message: newKycStatus === "A_REVOIR_MANUELLEMENT"
        ? "Votre dossier est en cours d'examen par notre équipe. Vous serez notifié sous 24h."
        : "Dossier soumis. En attente de vérification. Vous serez notifié une fois validé.",
    });
  } catch (err) {
    logger.error("submitKyc:", err);
    captureException(err, { controller: "kycController.submitKyc", userId: req.user?._id });
    res.status(500).json({ message: "Erreur lors de l'enregistrement KYC." });
  }
};

// ── POST /api/kyc/submit-driver-license ──────────────────────────────────────
// Vérification permis de conduire pour les réservations de type "location"
export const submitDriverLicense = async (req, res) => {
  try {
    const { licenseOcrData, licenseImageHash, frontImageData, backImageData } = req.body;

    if (!licenseImageHash || !licenseOcrData) {
      return res.status(400).json({
        message: "L'image du permis de conduire et les données OCR sont obligatoires.",
        code: "LICENSE_DATA_REQUIRED",
      });
    }

    if (!backImageData) {
      return res.status(400).json({
        message: "Le verso du permis de conduire est obligatoire.",
        code: "LICENSE_BACK_REQUIRED",
      });
    }

    // ── Validation taille/type réel des images (avant tout traitement coûteux) ─
    for (const [label, img] of [["recto", frontImageData], ["verso", backImageData]]) {
      const check = validateImageDataUri(img, MAX_KYC_IMAGE_BYTES);
      if (!check.ok) {
        return res.status(400).json({ message: `Photo (${label}) : ${check.message}`, code: "INVALID_IMAGE" });
      }
    }

    const isExpired = licenseOcrData.expiryDate
      ? new Date(licenseOcrData.expiryDate) < new Date()
      : false;

    if (isExpired) {
      return res.status(400).json({
        message: "Permis de conduire expiré. Vous ne pouvez pas effectuer de réservation location avec un permis expiré.",
        code: "LICENSE_EXPIRED",
      });
    }

    await User.findByIdAndUpdate(req.user.id, {
      $set: {
        driverLicenseOcr: {
          licenseNumber:   encryptField(licenseOcrData.licenseNumber) || null,
          deliveredDate:   licenseOcrData.deliveredDate  ? new Date(licenseOcrData.deliveredDate) : null,
          expiryDate:      licenseOcrData.expiryDate     ? new Date(licenseOcrData.expiryDate)    : null,
          categories:      licenseOcrData.categories     || null,
          issuingCountry:  licenseOcrData.issuingCountry || null,
          isExpired:       isExpired,
          rawOcrText:      encryptField(licenseOcrData.rawOcrText) || null,
          processedAt:     new Date(),
          // Images du permis — chiffrées au repos (AES-256-GCM, voir fieldEncryption.js)
          frontImage:      encryptField(frontImageData) || null,
          backImage:       encryptField(backImageData)  || null,
        },
      },
    });

    // Le journal d'audit n'est pas chiffré — ne jamais y écrire le numéro de
    // permis en clair (voir fieldEncryption.js pour le champ lui-même).
    await addAuditLog(req.user.id, "DRIVER_LICENSE_SUBMITTED", null,
      `Permis soumis — Exp: ${licenseOcrData.expiryDate}`);

    res.json({
      success:   true,
      isExpired: false,
      message:   "Permis de conduire enregistré. Vous pouvez effectuer des réservations de location.",
    });
  } catch (err) {
    logger.error("submitDriverLicense:", err);
    // Contrairement à submitKyc ci-dessus, cette route n'envoyait jamais
    // l'erreur à Sentry — un chauffeur bloqué en boucle sur "Erreur serveur."
    // ne laissait donc aucune trace exploitable pour comprendre pourquoi.
    captureException(err, { controller: "kycController.submitDriverLicense", userId: req.user?._id });
    // FIELD_ENCRYPTION_KEY absente/mal formée fait échouer TOUT chiffrement
    // (encryptField ci-dessus) avec un message précis — le distinguer d'une
    // panne serveur générique évite de faire chercher le chauffeur/le support
    // du mauvais côté (son permis, son réseau) alors que c'est une
    // configuration serveur manquante (voir /api/health → services.fieldEncryption).
    if (err.message?.includes("FIELD_ENCRYPTION_KEY")) {
      return res.status(503).json({ message: "Le service de vérification est temporairement indisponible (configuration serveur). Réessayez plus tard ou contactez le support." });
    }
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/kyc/admin/list ───────────────────────────────────────────────────
// Admin : liste des dossiers KYC à traiter
export const getKycList = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Accès réservé aux administrateurs." });
    }

    const { status, page = 1, limit = 20 } = req.query;
    // Plafond relevé (bug réel trouvé en audit) : 100 coupait silencieusement
    // les dossiers au-delà, sans que rien côté front n'indique la troncature
    // ni ne permette de voir la suite — voir loadMoreKyc (AdminPanel.jsx).
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 500);
    const filter = {};
    // "ALL" : aucun filtre de statut — sinon un compte déjà vérifié/refusé (donc
    // absent des deux statuts par défaut ci-dessous) devient introuvable pour
    // l'admin s'il ne pense pas à cliquer sur le filtre correspondant.
    if (status === "ALL") { /* pas de filtre kycStatus */ }
    else if (status) filter.kycStatus = status;
    else filter.kycStatus = { $in: ["EN_ATTENTE", "A_REVOIR_MANUELLEMENT"] };

    const skip  = (Math.max(Number(page), 1) - 1) * safeLimit;
    const total = await User.countDocuments(filter);
    // Exclut les photos base64 (identity.frontImage/backImage/selfie, plusieurs Mo chacune)
    // de la LISTE — l'admin les consulte via getKycDetail en cliquant sur un dossier précis.
    const users = await User.find(filter)
      .select("firstName lastName email phone role country kycStatus kycScore kycBadge kycSubmittedAt kycOcrData kycFaceMatchScore kycAuditLog identity.type identity.number identity.expiryDate identity.status")
      .sort({ kycSubmittedAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean();

    // .lean() renvoie le document Mongo brut : les comptes créés avant l'ajout du
    // champ kycStatus au schéma (défaut "EN_ATTENTE") ne l'ont jamais eu écrit en
    // base et arrivent donc avec kycStatus=undefined. Le filtre "ALL" (aucun filtre
    // de statut) les inclut, et le front appelle u.kycStatus.replace(...) sans
    // garde — ça faisait planter tout l'onglet KYC/Identités (écran d'erreur React)
    // dès qu'un seul de ces comptes legacy apparaissait dans la liste.
    for (const u of users) {
      if (!u.kycStatus) u.kycStatus = "EN_ATTENTE";
      if (u.kycScore == null) u.kycScore = 0;
      if (!u.kycBadge) u.kycBadge = "INSUFFISANT";
      // Déchiffrement pour affichage admin — voir fieldEncryption.js.
      if (u.identity) u.identity.number = decryptField(u.identity.number);
      if (u.kycOcrData) {
        u.kycOcrData.documentNumber = decryptField(u.kycOcrData.documentNumber);
        u.kycOcrData.rawOcrText     = decryptField(u.kycOcrData.rawOcrText);
      }
    }

    res.json({ users, total, page: Number(page), limit: safeLimit });
  } catch (err) {
    logger.error("getKycList:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/kyc/admin/:userId ────────────────────────────────────────────────
// Admin : détail complet d'un dossier KYC
export const getKycDetail = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Accès réservé aux administrateurs." });
    }

    // "business" ajouté (bug réel trouvé en audit) : le modal admin affiche
    // un bloc entier "Entreprise partenaire" (RCCM/NIF/adresse) conditionné
    // sur kycDetailUser.business?.companyName — jamais sélectionné ici, donc
    // toujours undefined et le bloc ne s'affichait jamais, pour aucun dossier.
    const user = await User.findById(req.params.userId).select(
      "firstName lastName email phone role kycStatus kycScore kycBadge kycSubmittedAt kycOcrData kycFaceMatchScore kycAuditLog kycReviewNote kycRejectionReason kycDocumentHash identity driverLicenseOcr emailVerified phoneVerified createdAt business"
    ).lean();
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });

    // Déchiffrement pour affichage admin — voir fieldEncryption.js. Les valeurs
    // legacy non chiffrées (comptes créés avant le 2026-07-16) sont renvoyées
    // telles quelles par decryptField (no-op si déjà en clair).
    if (user.identity) {
      user.identity.number     = decryptField(user.identity.number);
      user.identity.frontImage = decryptField(user.identity.frontImage);
      user.identity.backImage  = decryptField(user.identity.backImage);
      user.identity.selfie     = decryptField(user.identity.selfie);
    }
    if (user.kycOcrData) {
      user.kycOcrData.documentNumber = decryptField(user.kycOcrData.documentNumber);
      user.kycOcrData.rawOcrText     = decryptField(user.kycOcrData.rawOcrText);
    }
    if (user.driverLicenseOcr) {
      user.driverLicenseOcr.licenseNumber = decryptField(user.driverLicenseOcr.licenseNumber);
      user.driverLicenseOcr.frontImage    = decryptField(user.driverLicenseOcr.frontImage);
      user.driverLicenseOcr.backImage     = decryptField(user.driverLicenseOcr.backImage);
      user.driverLicenseOcr.rawOcrText    = decryptField(user.driverLicenseOcr.rawOcrText);
    }

    res.json({ user });
  } catch (err) {
    logger.error("getKycDetail:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── PATCH /api/kyc/admin/:userId/review ──────────────────────────────────────
// Admin : approuver / refuser / mettre en révision un dossier KYC
export const adminReviewKyc = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Accès réservé aux administrateurs." });
    }

    const { decision, note } = req.body;
    const validDecisions = ["VERIFIE", "REFUSE", "A_REVOIR_MANUELLEMENT", "EN_ATTENTE"];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({
        message: `Décision invalide. Valeurs acceptées : ${validDecisions.join(", ")}`,
      });
    }

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });

    const updateFields = {
      kycStatus: decision,
      ...(note ? { kycReviewNote: note } : {}),
      ...(decision === "REFUSE" ? { kycRejectionReason: note || "Dossier refusé par l'administrateur." } : { kycRejectionReason: null }),
      ...(decision === "VERIFIE" ? {
        documentsVerified: true,
        "identity.status": "verified",
        "identity.verifiedAt": new Date(),
      } : {}),
    };

    await User.findByIdAndUpdate(req.params.userId, { $set: updateFields });

    // Un dossier KYC refusé retire le droit de publier (voir createVehicle/
    // createListing) — sans dépublier aussi les annonces déjà en ligne, un
    // partenaire "particulier" (dont le KYC identité est la seule barrière)
    // continuait d'en recevoir des réservations malgré le refus.
    if (decision === "REFUSE") {
      await unpublishPartnerListings(req.params.userId);
    }

    const actionLabels = {
      VERIFIE:                "ADMIN_APPROVED",
      REFUSE:                 "ADMIN_REJECTED",
      A_REVOIR_MANUELLEMENT:  "ADMIN_FLAGGED_REVIEW",
      EN_ATTENTE:             "ADMIN_RESET_PENDING",
    };
    await addAuditLog(
      req.params.userId,
      actionLabels[decision],
      req.user.id,
      note || `Décision admin : ${decision}`
    );
    // Journal d'audit global (traçabilité admin — voir models/AuditLog.js)
    await logAction(req, `kyc.${decision.toLowerCase()}`, "User", req.params.userId, {
      after: { kycStatus: decision, note: note || null },
    });

    // ── Notification in-app ────────────────────────────────────────────────
    // `type` doit être une valeur existante de l'enum Notification.type — "kyc"
    // n'en fait pas partie et échouait silencieusement (avalé par le .catch ci-
    // dessous) pour CHAQUE décision admin, quel que soit son résultat.
    // VERIFIE est différencié par rôle (même contrôleur pour client ET
    // partenaire, voir commentaire de fonction) : un partenaire dont le profil
    // est approuvé rejoint le réseau de partenaires VIT AUTO, un client voit
    // simplement son identité confirmée — message et ton adaptés en conséquence.
    const isPartner = user.role === "partenaire";
    const notifMap = {
      VERIFIE: isPartner
        ? { type: "kyc_approved", titre: "🎉 Bienvenue parmi nos partenaires VIT-AUTO !", message: "Votre profil a été approuvé par notre équipe. Bienvenue parmi nos partenaires VIT-AUTO — vous pouvez dès maintenant publier vos annonces." }
        : { type: "kyc_approved", titre: "✅ Profil vérifié",                              message: "Votre identité a été vérifiée avec succès. Vous pouvez effectuer des réservations en toute confiance." },
      REFUSE:                { type: "kyc_rejected", titre: "❌ Dossier KYC refusé",      message: `Votre dossier KYC a été refusé. Motif : ${note || "Documents insuffisants."}` },
      A_REVOIR_MANUELLEMENT: { type: "system",       titre: "🔍 Dossier en révision",     message: "Votre dossier KYC est en cours d'examen approfondi par notre équipe. Vous serez notifié sous 48h." },
      EN_ATTENTE:            { type: "system",       titre: "⏳ Dossier remis en attente", message: "Votre dossier KYC a été remis en file d'attente pour examen." },
    };
    const notif = notifMap[decision];
    if (notif) {
      const celebrate = decision === "VERIFIE";
      const notifDoc = await Notification.create({
        user:    user._id,
        titre:   notif.titre,
        message: notif.message,
        type:    notif.type,
        lu:      false,
      }).catch(() => null); // non-bloquant

      // Émission temps réel — manquait jusqu'ici (contrairement au patron
      // `notify()` de partnerOnboardingController.js) : la notification n'était
      // visible qu'au prochain polling (jusqu'à 20s de latence, voir
      // NotificationContext.jsx), et surtout `celebrate` (déclenche l'animation
      // de félicitations côté front) ne pouvait pas être transmis du tout.
      if (notifDoc && global._io) {
        global._io.to(`user_${user._id}`).emit("notification_new", {
          _id: notifDoc._id, type: notif.type, titre: notif.titre, message: notif.message,
          lien: null, lu: false, createdAt: notifDoc.createdAt, celebrate,
        });
      }

      // Notification email
      sendEmail({
        to:      user.email,
        subject: `VIT AUTO — ${notif.titre}`,
        html:    `<div style="font-family:Arial,sans-serif;padding:24px;max-width:560px;margin:0 auto">
          <h2 style="color:#0f1b3f">${celebrate ? "🎉" : "🚗"} VIT AUTO — Mise à jour KYC</h2>
          <p>Bonjour <strong>${user.firstName}</strong>,</p>
          <p>${notif.message}</p>
          ${decision === "REFUSE" ? `<p>Pour resoumettre votre dossier, rendez-vous sur : <a href="${process.env.APP_URL || "http://localhost:5173"}/kyc">Ma vérification KYC</a></p>` : ""}
          ${decision === "VERIFIE" ? `<p>${isPartner ? `Rendez-vous sur votre <a href="${process.env.APP_URL || "http://localhost:5173"}/vendor/dashboard">tableau de bord partenaire</a> pour publier votre première annonce.` : `Vous pouvez maintenant réserver des véhicules sur <a href="${process.env.APP_URL || "http://localhost:5173"}/catalogue">notre catalogue</a>.`}</p>` : ""}
          <p style="color:#64748b;font-size:0.85rem">L'équipe VIT AUTO</p>
        </div>`,
      }).catch(() => {}); // non-bloquant
    }

    res.json({
      success:   true,
      kycStatus: decision,
      message:   `Dossier KYC mis à jour : ${decision}`,
    });
  } catch (err) {
    logger.error("adminReviewKyc:", err);
    captureException(err, { controller: "kycController.adminReviewKyc", userId: req.params?.userId });
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── DELETE /api/kyc/reset ─────────────────────────────────────────────────────
export const resetKyc = async (req, res) => {
  try {
    const current = await User.findById(req.user.id).select("kycStatus kycSubmittedAt").lean();
    if (!current) return res.status(404).json({ message: "Utilisateur introuvable." });
    if (current.kycStatus === "VERIFIE") {
      return res.status(403).json({ message: "Impossible de réinitialiser un KYC déjà approuvé." });
    }
    // Anti-spam : 1 reset toutes les 24h
    if (current.kycSubmittedAt) {
      const hoursSince = (Date.now() - new Date(current.kycSubmittedAt).getTime()) / 3_600_000;
      if (hoursSince < 24) {
        return res.status(429).json({ message: "Vous devez attendre 24h avant de pouvoir réinitialiser à nouveau." });
      }
    }
    await User.findByIdAndUpdate(req.user.id, {
      $set: {
        kycStatus:          "EN_ATTENTE",
        kycScore:           0,
        kycBadge:           "INSUFFISANT",
        kycSubmittedAt:     null,
        kycDocumentHash:    null,
        kycOcrData:         null,
        kycFaceMatchScore:  null,
        kycReviewNote:      null,
        kycRejectionReason: null,
        documentsVerified:  false,
        "identity.status":       "not_submitted",
        "identity.type":         null,
        "identity.number":       null,
        "identity.expiryDate":   null,
        "identity.verifiedAt":   null,
        "identity.submittedAt":  null,
      },
      $push: {
        kycAuditLog: { action: "RESET", performedBy: req.user.id, note: "KYC réinitialisé", timestamp: new Date() },
      },
    });
    res.json({ success: true, message: "KYC réinitialisé." });
  } catch (err) {
    logger.error("resetKyc:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
