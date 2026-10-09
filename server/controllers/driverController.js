import mongoose from "mongoose";
import logger from "../utils/logger.js";
import { avecRepliMondial } from "../utils/repliMondial.js";
import Driver from "../models/Driver.js";
import { outilOuvert, messageRefus } from "../services/planAccess.js";
import User from "../models/User.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import Notification from "../models/Notification.js";
import PartnerVerification from "../models/PartnerVerification.js";
import { cacheGet, cacheSet, buildCacheKey } from "../utils/catalogCache.js";
import { validateImageDataUri, validateDocumentDataUri } from "../utils/imageValidation.js";
import { logAction } from "../middleware/auditLog.js";
import { notifyAdmins } from "../utils/notifyAdmins.js";
import { uploadBase64Images, uploadBase64Document, FOLDERS } from "../config/imagekit.js";
import { getActiveRates } from "../services/currencyEngine.js";
import { evaluerPartenaire } from "../services/validationPartenaire.js";
import { refusDePerimetre } from "../utils/perimetre.js";
import { refusDeQuota } from "../services/quotaAnnonces.js";
import { refuserPublication } from "../utils/maintenanceWatchdog.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MAX_DRIVER_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_URL_LENGTH   = 2048;
const MAX_CV_BYTES           = 8 * 1024 * 1024;

// CV obligatoire à la publication — consultable par un employeur potentiel
// avant une proposition d'embauche CDD/CDI (DriverEmployment). Accepte PDF ou
// image scannée (validateDocumentDataUri), ou une URL http(s) déjà hébergée.
function validateCv(cv) {
  if (!cv) return "CV requis pour publier un profil chauffeur.";
  if (typeof cv === "string" && cv.startsWith("data:")) {
    const check = validateDocumentDataUri(cv, MAX_CV_BYTES);
    if (!check.ok) return check.message;
  } else if (typeof cv !== "string" || !/^https?:\/\//i.test(cv) || cv.length > MAX_IMAGE_URL_LENGTH) {
    return "CV invalide : PDF/image encodée ou URL http(s) attendue.";
  }
  return null;
}

// Même validation que vehicleController.validateVehicleImages — un partenaire
// authentifié ne doit jamais pouvoir soumettre un blob arbitraire dans
// `images`/`profilePhoto` en dehors du flux prévu (compression client + upload).
function validateDriverImages(images) {
  if (!Array.isArray(images)) return null;
  for (const img of images) {
    if (typeof img !== "string" || !img) continue;
    if (img.startsWith("data:")) {
      const check = validateImageDataUri(img, MAX_DRIVER_IMAGE_BYTES);
      if (!check.ok) return check.message;
    } else if (!/^https?:\/\//i.test(img) || img.length > MAX_IMAGE_URL_LENGTH) {
      return "Image invalide : URL http(s) ou image encodée attendue.";
    }
  }
  return null;
}

// ── Pièce d'identité (CNI/passeport) + permis de conduire — restructuration
// réservation 2026-09, même principe que pour une réservation client (voir
// bookingController.processBookingDocuments) : un chauffeur transporte des
// clients, l'identité et le permis restent obligatoires, mais joints
// DIRECTEMENT à la création du profil plutôt que via un aller-retour séparé
// par /kyc (ancien circuit `missingDriverDocs`, qui exigeait un
// User.identity/driverLicenseOcr déjà VÉRIFIÉ par un admin AVANT même de
// pouvoir soumettre le profil — origine de bugs réels documentés dans
// VendorSubmit.jsx, partenaire bloqué indéfiniment). Aucun OCR, aucune revue
// manuelle bloquante ici : le profil part en modération standard
// (Driver.status: "pending"), l'admin voit ces documents au moment d'approuver
// la fiche publique (voir getDriverById ci-dessous et AdminPanel.jsx).
const MAX_DRIVER_DOC_BYTES = 6 * 1024 * 1024;

async function processDriverDocuments({ identityDocument, licenseDocument }) {
  for (const [label, img] of [
    ["identité (recto)", identityDocument?.frontImage], ["identité (verso)", identityDocument?.backImage],
    ["permis (recto)", licenseDocument?.frontImage], ["permis (verso)", licenseDocument?.backImage],
  ]) {
    const check = validateImageDataUri(img, MAX_DRIVER_DOC_BYTES);
    if (!check.ok) return { error: `Document ${label} : ${check.message}` };
  }
  // Règle de l'exploitant (2026-10-09) : un chauffeur fournit son permis et
  // son CV, rien d'autre. La pièce d'identité reste acceptée si elle est
  // jointe, elle n'est plus exigée.
  if (!licenseDocument?.frontImage) return { error: "Permis de conduire (recto) requis pour publier un profil chauffeur." };
  // `driverDocs`, et non `drivers` : ces pièces sont déposées en PRIVÉ (URL
  // signée obligatoire), tandis que le CV et les photos du même chauffeur
  // restent publics dans le dossier parent — voir FOLDERS dans config/imagekit.js.
  const [idFront, idBack, licFront, licBack] = await Promise.all([
    uploadBase64Document(identityDocument?.frontImage || null, FOLDERS.driverDocs),
    uploadBase64Document(identityDocument?.backImage || null, FOLDERS.driverDocs),
    uploadBase64Document(licenseDocument.frontImage, FOLDERS.driverDocs),
    uploadBase64Document(licenseDocument.backImage || null, FOLDERS.driverDocs),
  ]);
  return {
    error: null,
    identityDocument: { type: identityDocument?.type || null, frontImage: idFront, backImage: idBack },
    licenseDocument:  { frontImage: licFront, backImage: licBack },
  };
}

// ── Créer un profil chauffeur (partenaire) ────────────────────────────────
export const createDriver = async (req, res) => {
  try {
    if (!["partenaire", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Réservé aux partenaires." });
    }

    // Même logique que pour les véhicules (voir vehicleController.js createVehicle) :
    // un chauffeur particulier proposant son propre service n'a besoin que d'une
    // vérification d'identité KYC (déjà disponible via /kyc), pas de la
    // certification entreprise complète. Le type n'est jamais relu depuis
    // req.body une fois déjà fixé sur le compte (anti-contournement) — le corps
    // de la requête ne sert qu'à amorcer les comptes plus anciens.
    const SELLER_TYPES = ["particulier", "professionnel", "entreprise"];
    if (!req.user.sellerType && SELLER_TYPES.includes(req.body.typePubliant)) {
      req.user.sellerType = req.body.typePubliant;
      await req.user.save();
    }
    // Documents adaptés au service (décision de l'exploitant, 2026-09-15) :
    // pour un chauffeur PARTICULIER, la pièce d'identité et le permis joints
    // à ce profil (obligatoires, voir processDriverDocuments ci-dessous) SONT
    // sa vérification — l'admin les voit à la modération de la fiche. Exiger
    // en plus un KYC préalable par /kyc bloquait un vrai chauffeur cinq jours
    // sans qu'il sache quoi faire (VendorSubmit.jsx). Une entreprise reste
    // soumise à la certification de l'entité : ce sont SES documents.
    // Règle de l'exploitant (2026-10-09) : les pièces d'un chauffeur sont son
    // permis et son CV, joints à CE formulaire — quelle que soit son entité.
    // Lui demander en plus la certification d'une entreprise était l'une des
    // incohérences relevées. Un compte qui publie aussi d'autres offres reste
    // soumis à la règle de son entité pour celles-ci.

    // Secteur Chauffeur, puis quota du plan (voir perimetre.js et
    // quotaAnnonces.js). Un loueur qui propose ses véhicules AVEC chauffeur
    // passe par l'option `withDriver` de son annonce de location, pas par un
    // profil chauffeur : ce profil-ci est celui d'un partenaire chauffeur.
    const refusSecteur = refusDePerimetre(req.user, "chauffeur", "publier un profil chauffeur");
    if (refusSecteur) return refuserPublication(req, res, "Driver", refusSecteur);
    const refusQuota = await refusDeQuota(req.user, "chauffeur");
    if (refusQuota) return refuserPublication(req, res, "Driver", refusQuota);

    // Suspension/rejet Vérification Partenaire — voir vehicleController.js
    // createVehicle pour l'explication complète (deux systèmes de vérification
    // qui ne communiquaient jamais entre eux).
    const suspendedVerif = await PartnerVerification.findOne({
      userId: req.user._id,
      status: { $in: ["suspendu", "rejete"] },
    }).select("status").lean();
    if (suspendedVerif) {
      return res.status(403).json({
        code:    "PARTNER_SUSPENDED",
        message: suspendedVerif.status === "suspendu"
          ? "Votre dossier partenaire est suspendu. Contactez le support VIT AUTO."
          : "Votre dossier partenaire a été rejeté. Contactez le support VIT AUTO.",
      });
    }

    // ── Pièce d'identité + permis obligatoires (voir processDriverDocuments) ──
    const driverDocsResult = await processDriverDocuments({
      identityDocument: req.body.identityDocument, licenseDocument: req.body.licenseDocument,
    });
    if (driverDocsResult.error) {
      return res.status(400).json({ code: "DRIVER_DOCS_REQUIRED", message: driverDocsResult.error });
    }

    // Whitelist des champs autorisés (évite mass assignment sur owner, stats, status)
    const {
      firstName, lastName, telephone, contactTel, phone: phoneRaw,
      profilePhoto, cv, title, description,
      tarif, tarifDemiJournee, tarifHeure, tarifMois,
      tarifEntered, tarifDemiJourneeEntered, tarifHeureEntered, tarifMoisEntered, priceEntryCurrency,
      disponibilite, zone, ville,
      experience, langues, permisCategorie, vehiculePersonnel, typeVehicule,
      images, zonesTarifaires, miseADisposition,
    } = req.body;

    const phone = telephone || contactTel || phoneRaw;

    // ── Devise d'affichage (facultative) — même validation que
    // vehicleController.createVehicle : null = pas de préférence, sinon doit
    // être une devise active réelle (ExchangeRate), jamais acceptée telle
    // quelle (un code inventé casserait silencieusement l'affichage public).
    if (req.body.currency) {
      const activeRates = await getActiveRates();
      if (!activeRates.some((r) => r.code === req.body.currency)) {
        return res.status(400).json({ message: "Devise d'affichage invalide." });
      }
    }

    // ── Photos : profil toujours requis ; véhicule requis seulement "avec véhicule" ──
    if (!profilePhoto) {
      return res.status(400).json({ message: "Photo de profil du chauffeur requise." });
    }
    const vehicleImages = vehiculePersonnel ? (images || []) : [];
    if (vehiculePersonnel && vehicleImages.length === 0) {
      return res.status(400).json({ message: "Au moins une photo du véhicule est requise pour un chauffeur avec véhicule." });
    }
    const imagesError = validateDriverImages([profilePhoto, ...vehicleImages]);
    if (imagesError) return res.status(400).json({ message: imagesError });

    // ── CV obligatoire ──────────────────────────────────────────────────────
    const cvError = validateCv(cv);
    if (cvError) return res.status(400).json({ message: cvError });

    // ── Outils de palier saisis dès la publication (2026-09-27) ────────────
    // Ils passent par les MÊMES normaliseurs qu'à l'édition. Ils étaient
    // absents de la création : le partenaire saisissait ses zones au
    // formulaire de publication et elles disparaissaient sans un mot — une
    // écriture perdue en silence, faute d'être déclarée. Le verrou de palier
    // s'applique donc aussi ici.
    const zonesTarif = await normaliserZonesTarifaires(req.user, zonesTarifaires);
    if (zonesTarif.error) return res.status(400).json({ message: zonesTarif.error });
    if (zonesTarif.refus) return res.status(403).json(zonesTarif.refus);

    const dispo = await normaliserMiseADisposition(req.user, miseADisposition, { tarifMois });
    if (dispo.error) return res.status(400).json({ message: dispo.error });
    if (dispo.refus) return res.status(403).json(dispo.refus);

    // ── Entreprise du partenaire (facultatif) — même principe que Vehicle ───
    let business = null;
    if (req.body.businessId) {
      business = await (mongoose.Types.ObjectId.isValid(req.body.businessId) ? PartnerBusiness.findOne({ _id: req.body.businessId, owner: req.user._id }).lean() : null);
      if (!business) return res.status(400).json({ message: "Entreprise introuvable." });
    }

    // Bug réel corrigé (audit) : contrairement à vehicleController.createVehicle,
    // les photos chauffeur n'étaient jamais envoyées vers ImageKit — stockées en
    // base64 brut, gonflant chaque réponse /api/drivers (catalogue public,
    // aucune exclusion de champ contrairement à limitVehicleImages côté
    // véhicules) — même goulot d'étranglement déjà corrigé pour les véhicules
    // (voir imagekit.js uploadBase64Images). Jamais bloquant si ImageKit est
    // indisponible : reste en base64 en dégradation gracieuse.
    const [uploadedProfilePhoto] = await uploadBase64Images([profilePhoto], FOLDERS.drivers);
    const uploadedVehicleImages = vehicleImages.length ? await uploadBase64Images(vehicleImages, FOLDERS.drivers) : [];
    // Même correctif que profilePhoto/images ci-dessus — voir uploadBase64Document.
    const uploadedCv = await uploadBase64Document(cv, FOLDERS.drivers);

    const driver = await Driver.create({
      firstName, lastName, title, description,
      ...(phone ? { phone } : {}),
      profilePhoto: uploadedProfilePhoto, cv: uploadedCv,
      tarif: tarif || undefined, tarifDemiJournee: tarifDemiJournee || undefined, tarifHeure: tarifHeure || undefined, tarifMois: tarifMois || undefined,
      tarifEntered: tarifEntered != null && tarifEntered !== "" ? Number(tarifEntered) : null,
      tarifDemiJourneeEntered: tarifDemiJourneeEntered != null && tarifDemiJourneeEntered !== "" ? Number(tarifDemiJourneeEntered) : null,
      tarifHeureEntered: tarifHeureEntered != null && tarifHeureEntered !== "" ? Number(tarifHeureEntered) : null,
      tarifMoisEntered: tarifMoisEntered != null && tarifMoisEntered !== "" ? Number(tarifMoisEntered) : null,
      priceEntryCurrency: priceEntryCurrency || null,
      currency: req.body.currency || null,
      disponibilite, zone, ville,
      ...(zonesTarif.zones !== undefined ? { zonesTarifaires: zonesTarif.zones } : {}),
      ...(dispo.offre !== undefined ? { miseADisposition: dispo.offre } : {}),
      experience,
      langues: langues || ["Français"],
      permisCategorie: Array.isArray(permisCategorie) && permisCategorie.length ? permisCategorie : ["B"],
      vehiculePersonnel: !!vehiculePersonnel,
      typeVehicule,
      images: uploadedVehicleImages,
      identityDocument: driverDocsResult.identityDocument,
      licenseDocument:  driverDocsResult.licenseDocument,
      // Champs serveur — jamais depuis req.body
      owner:         req.user._id,
      business:      business?._id || null,
      country:       business?.country || req.user.country || null,
      status:        "pending",
      noteMoyenne:   0,
      nombreAvis:    0,
      missionsTotal: 0,
    });

    // Permis + CV fournis et contact confirmé : le partenaire est validé et la
    // fiche publiée sur-le-champ (services/validationPartenaire.js).
    await evaluerPartenaire(req.user._id);
    const enLigne = (await Driver.findById(driver._id).select("status").lean())?.status === "approved";
    if (enLigne) driver.status = "approved";

    // Notification non bloquante — le message « compte validé » part déjà de
    // l'évaluation quand la fiche est publiée.
    if (!enLigne) try {
      const titre   = "Profil chauffeur soumis";
      const message = "Votre profil chauffeur est en cours de vérification.";
      const notifDoc = await Notification.create({ user: req.user._id, type: "system", titre, message, lien: "/vendor/dashboard" });
      if (global._io) {
        global._io.to(`user_${req.user._id}`).emit("notification_new", {
          _id: notifDoc._id, type: "system", titre, message, lien: "/vendor/dashboard", lu: false, createdAt: notifDoc.createdAt,
        });
      }
    } catch (notifErr) {
      logger.error("Notification (non bloquant) :", notifErr.message);
    }

    // ── Notifier les admins (non bloquant) ───────────────────────────────
    // Bug réel corrigé (audit) : createDriver ne notifiait jamais les admins
    // d'un nouveau profil chauffeur en attente — ils ne le découvraient
    // qu'en rechargeant manuellement l'onglet Annonces & Validations.
    if (!enLigne) notifyAdmins(
      "new_driver",
      "🧑‍✈️ Nouveau profil chauffeur à valider",
      `${driver.firstName} ${driver.lastName} a soumis un profil chauffeur publié par ${req.user.firstName || ""} ${req.user.lastName || ""}.`,
      "/admin",
    ).catch((err) => logger.error("notifyAdmins createDriver (non bloquant) :", err.message));

    res.status(201).json({ driver });
  } catch (err) {
    logger.error("createDriver:", err);
    res.status(400).json({ message: err.message || "Erreur création chauffeur." });
  }
};

// ── Tous les chauffeurs approuvés (public) ────────────────────────────────
export const getDrivers = async (req, res) => {
  try {
    const { zone, disponibilite, country } = req.query;

    const cacheKey = buildCacheKey("drivers", { zone, disponibilite, country });
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const filter = { status: "approved" };
    if (zone)         filter.zone = new RegExp(escapeRegex(String(zone).slice(0, 100)), "i");
    if (disponibilite) filter.disponibilite = disponibilite;
    // Voir vehicleController.getVehicles pour le même filtre (pays absent = pas de restriction).
    let clePays = null;
    if (country && country !== "INTL") {
      // Strict depuis le 2026-10-09 : le pays du visiteur et lui seul.
      filter.country = String(country).toUpperCase();
      clePays = "country";
    }

    // owner.identity/driverLicenseOcr sont récupérés UNIQUEMENT pour calculer les
    // deux booléens publics ci-dessous (identityVerified/licenseVerified) — jamais
    // renvoyés tels quels : `owner` est reconstruit sans eux avant res.json (voir
    // .map ci-dessous). Le CV (`cv`), lui, est déjà public par conception (voir
    // Driver.js — "consultable par l'employeur potentiel").
    // Repli mondial : aucun chauffeur dans le pays du visiteur → l'offre
    // internationale entière (voir utils/repliMondial.js).
    const { resultat: drivers } = await avecRepliMondial(filter, clePays, (f) =>
      Driver.find(f)
        .sort({ noteMoyenne: -1, createdAt: -1 })
        .populate("owner", "firstName phone identity.type identity.status driverLicenseOcr.licenseNumber driverLicenseOcr.isExpired")
        .lean(),
      (d) => d.country === String(country).toUpperCase());

    const publicDrivers = drivers.map(fichePublique);

    cacheSet(cacheKey, publicDrivers);
    res.json(publicDrivers);
  } catch (err) {
    logger.error("getDrivers:", err);
    res.status(500).json({ message: "Erreur récupération chauffeurs." });
  }
};

// ── Une fiche chauffeur publique (2026-10-09) ─────────────────────────────
// Le catalogue ne charge plus que les chauffeurs du pays du visiteur : un lien
// direct (partagé, ou depuis un autre pays) vers la réservation ou l'embauche
// d'un chauffeur doit pouvoir lire SA fiche. Même mise en forme que la liste.
export const getDriverPublic = async (req, res) => {
  try {
    const d = await Driver.findOne({ _id: req.params.id, status: "approved" })
      .populate("owner", "firstName phone identity.type identity.status driverLicenseOcr.licenseNumber driverLicenseOcr.isExpired")
      .lean();
    if (!d) return res.status(404).json({ message: "Chauffeur introuvable." });
    res.json({ driver: fichePublique(d) });
  } catch (err) {
    logger.error("getDriverPublic:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

function fichePublique(d) {
  const owner = d.owner || {};
  // Mêmes 4 types acceptés que ci-dessus — sinon un chauffeur avec un
  // titre de séjour/permis vérifié affichait publiquement un badge
  // "identité non vérifiée" malgré une vérification admin réelle.
  const identityVerified = ["cni", "passport", "permis", "carte_sejour"].includes(owner.identity?.type) && owner.identity?.status === "verified";
  const license = owner.driverLicenseOcr;
  const licenseVerified = !!(license?.licenseNumber && !license?.isExpired);
  // Restructuration 2026-09 : document joint au profil mais pas encore
  // vérifié par un admin — jamais les images elles-mêmes en public
  // (identityDocument/licenseDocument exclus du spread ci-dessous).
  // Fuite PII corrigée (audit sécurité 2026-09) : le spread ne retirait que
  // les deux documents d'identité — `phone` et `cv` du chauffeur partaient
  // donc en clair sur une route PUBLIQUE et non authentifiée. `GET /api/drivers`
  // constituait ainsi un annuaire téléphonique complet des chauffeurs
  // publiés, moissonnable en une requête. Aucun contact direct ne doit être
  // exposé : le client passe par le service client centralisé (voir
  // utils/customerServiceContact.js), politique déjà appliquée au
  // propriétaire ci-dessous mais oubliée pour le chauffeur lui-même.
  // `cv` est volontairement conservé : la fiche publique sert au client à
  // choisir son chauffeur, et le lien « Voir le CV » existe dans les trois
  // interfaces. `phone`, lui, n'a aucune raison d'y être.
  // `phone` renommé `_phone` : il est extrait uniquement pour être EXCLU de
  // la réponse publique (le préfixe `_` marque une variable volontairement
  // inutilisée, convention reconnue par la configuration de lint).
  const { identityDocument, licenseDocument, phone: _phone, ...publicFields } = d;
  return {
    ...publicFields,
    owner: { _id: owner._id, firstName: owner.firstName },
    identityVerified,
    licenseVerified,
    identityProvided: !!identityDocument?.frontImage,
    licenseProvided:  !!licenseDocument?.frontImage,
  };
}

// ── Mes profils chauffeur (partenaire) ────────────────────────────────────
export const getMyDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json({ drivers });
  } catch (err) {
    logger.error("getMyDrivers:", err);
    res.status(500).json({ message: "Erreur récupération." });
  }
};

// ── Chauffeurs (admin) — même pattern que vehicleController.getVehicles :
// `status` par défaut "pending" (comportement historique de cette route,
// conservé pour ne rien casser côté appelants existants), ou "approved"/
// "rejected"/"all" pour couvrir toute la gestion admin (l'UI n'affichait
// jusqu'ici QUE les chauffeurs en attente, impossible de gérer/filtrer les
// profils déjà publiés ou rejetés sans repasser par la base directement).
export const getPendingDrivers = async (req, res) => {
  try {
    const { status = "pending" } = req.query;
    const filter = status && status !== "all" ? { status } : {};
    // File d'attente pending triée du plus ancien au plus récent (ordre de
    // traitement FIFO déjà en place) ; les autres vues (approved/rejected/all)
    // en plus récent d'abord, comme vehicleController.getVehicles.
    const drivers = await Driver.find(filter)
      .sort({ createdAt: status === "pending" ? 1 : -1 })
      .populate("owner", "firstName lastName email");
    res.json({ drivers });
  } catch (err) {
    logger.error("getPendingDrivers:", err);
    res.status(500).json({ message: "Erreur récupération." });
  }
};

// ── Approuver / rejeter un chauffeur (admin) ──────────────────────────────
export const updateDriverStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const allowed = ["approved", "rejected", "pending"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Statut invalide." });
    }

    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { status, rejectionReason: rejectionReason || null },
      { new: true }
    ).populate("owner", "_id firstName");

    if (!driver) return res.status(404).json({ message: "Chauffeur introuvable." });

    const driverStatusNotif = {
      type: status === "approved" ? "listing_approved" : "listing_rejected",
      titre: status === "approved" ? "Profil chauffeur approuvé ✅" : "Profil chauffeur rejeté ❌",
      message: status === "approved"
        ? `Votre profil "${driver.title}" est maintenant visible.`
        : `Votre profil "${driver.title}" a été rejeté. ${rejectionReason || ""}`,
      lien: "/vendor/dashboard",
    };
    const driverNotifDoc = await Notification.create({ user: driver.owner._id, ...driverStatusNotif });
    // Même angle mort que vehicleController.js corrigé précédemment : aucune
    // émission temps réel à l'approbation/rejet admin d'un profil chauffeur.
    if (global._io) {
      global._io.to(`user_${driver.owner._id}`).emit("notification_new", {
        _id: driverNotifDoc._id, ...driverStatusNotif, lu: false, createdAt: driverNotifDoc.createdAt,
      });
    }

    res.json({ driver });
  } catch (err) {
    logger.error("updateDriverStatus:", err);
    res.status(500).json({ message: "Erreur mise à jour statut." });
  }
};

// ── Supprimer un profil (propriétaire ou admin) ───────────────────────────
export const deleteDriver = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ message: "Chauffeur introuvable." });

    const isOwner = driver.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    await driver.deleteOne();
    res.json({ message: "Profil supprimé." });
  } catch (err) {
    logger.error("deleteDriver:", err);
    res.status(500).json({ message: "Erreur suppression." });
  }
};

// ── Bloquer des dates (congés/indisponibilité) — jusqu'ici seul le calendrier
// en lecture seule (réservations existantes) était visible, aucun moyen pour
// le partenaire de bloquer proactivement des dates pour un chauffeur.
export const addDriverBlackout = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ message: "Chauffeur introuvable." });

    const isOwner = driver.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    const { start, end, reason } = req.body;
    const startDate = start ? new Date(start) : null;
    const endDate   = end   ? new Date(end)   : null;
    if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
      return res.status(400).json({ message: "Période invalide (date de fin après la date de début requises)." });
    }

    driver.blackoutDates.push({ start: startDate, end: endDate, reason: (reason || "").slice(0, 200) });
    await driver.save();

    res.status(201).json({ driver });
  } catch (err) {
    logger.error("addDriverBlackout:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const removeDriverBlackout = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ message: "Chauffeur introuvable." });

    const isOwner = driver.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    driver.blackoutDates = driver.blackoutDates.filter((b) => b._id.toString() !== req.params.blackoutId);
    await driver.save();

    res.json({ driver });
  } catch (err) {
    logger.error("removeDriverBlackout:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Supprimer plusieurs profils à la fois (sélection multiple) ──────────────
// Même principe que vehicleController.bulkDeleteVehicles : un partenaire ne
// peut supprimer que SES propres profils, même s'il envoie des IDs hors
// périmètre (filtrés silencieusement, jamais d'erreur trompeuse).
const MAX_BULK_DELETE = 100;
export const bulkDeleteDrivers = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Liste d'identifiants requise." });
    }
    if (ids.length > MAX_BULK_DELETE) {
      return res.status(400).json({ message: `Maximum ${MAX_BULK_DELETE} profils à la fois.` });
    }
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));

    const filter = { _id: { $in: validIds } };
    if (req.user.role !== "admin") filter.owner = req.user._id;

    const toDelete = await Driver.find(filter).select("_id firstName lastName owner").lean();
    if (toDelete.length === 0) {
      return res.status(404).json({ message: "Aucun profil trouvé ou accès refusé." });
    }

    const deletedIds = toDelete.map((d) => d._id.toString());
    await Driver.deleteMany({ _id: { $in: deletedIds } });

    if (req.user.role === "admin") {
      await logAction(req, "driver.admin_bulk_delete", "Driver", null, {
        before: { count: deletedIds.length, ids: deletedIds },
      });
    }

    res.json({ message: `${deletedIds.length} profil(s) supprimé(s).`, deletedCount: deletedIds.length, deletedIds });
  } catch (err) {
    logger.error("bulkDeleteDrivers:", err);
    res.status(500).json({ message: "Erreur suppression multiple." });
  }
};

// ── Modifier un profil chauffeur (propriétaire ou admin) ─────────────────────
// Il n'existait jusqu'ici aucune route d'édition pour un chauffeur (contrairement
// à Vehicle) — un partenaire ne pouvait que créer ou supprimer. Whitelist calquée
// sur vehicleController.updateVehicle : mêmes garde-fous (mass assignment, photos).
/**
 * Valide les zones tarifaires et vérifie le palier d'abonnement.
 *
 * Renvoie `{ error }`, `{ refus }` ou `{ zones }`. Comme ailleurs, DÉFINIR
 * des zones demande le palier ; les RETIRER reste libre — on ne piège pas un
 * partenaire dans une grille qu'il ne pourrait plus simplifier.
 */
async function normaliserZonesTarifaires(user, brut) {
  if (brut === undefined) return {};
  if (!Array.isArray(brut)) return { error: "Zones tarifaires invalides." };
  if (brut.length === 0) return { zones: [] };

  const verdict = await outilOuvert(user, "zonesTarifairesChauffeur");
  if (!verdict.ouvert) {
    return { refus: { message: messageRefus("zonesTarifairesChauffeur"), code: "PLAN_REQUIS", feature: "zonesTarifairesChauffeur" } };
  }

  const zones = [];
  const noms = new Set();
  for (const z of brut.slice(0, 12)) {
    const nom = String(z?.nom || "").trim().slice(0, 60);
    const supplement = Number(z?.supplementUSD);
    if (!nom) return { error: "Chaque zone tarifaire doit porter un nom." };
    if (!Number.isFinite(supplement) || supplement < 0) return { error: `Supplément invalide pour la zone « ${nom} ».` };
    const cle = nom.toLowerCase();
    if (noms.has(cle)) return { error: `Deux zones s'appellent « ${nom} » — le supplément deviendrait ambigu.` };
    noms.add(cle);
    zones.push({ nom, supplementUSD: Math.round(supplement * 100) / 100 });
  }
  return { zones };
}

/**
 * Valide l'offre de mise à disposition longue durée et vérifie le palier.
 *
 * Comme pour les zones tarifaires : ACTIVER l'offre demande le palier, la
 * DÉSACTIVER reste libre. Un partenaire qui redescend d'abonnement doit
 * pouvoir retirer une promesse qu'il ne veut plus tenir — l'enfermer dedans
 * serait le punir d'avoir été client.
 */
async function normaliserMiseADisposition(user, brut, driver) {
  if (brut === undefined) return {};
  if (typeof brut !== "object" || brut === null) return { error: "Offre de mise à disposition invalide." };

  const active = Boolean(brut.active);
  const etaitActive = Boolean(driver?.miseADisposition?.active);
  if (active && !etaitActive) {
    const verdict = await outilOuvert(user, "miseADisposition");
    if (!verdict.ouvert) {
      return { refus: { message: messageRefus("miseADisposition"), code: "PLAN_REQUIS", feature: "miseADisposition" } };
    }
  }
  if (!active) return { offre: { ...(driver?.miseADisposition?.toObject?.() || {}), active: false } };

  if (!(Number(driver?.tarifMois) > 0) && !(Number(brut.tarifMois) > 0)) {
    return { error: "Un tarif au mois est nécessaire avant de proposer une mise à disposition longue durée." };
  }

  const dureeMin = Math.floor(Number(brut.dureeMinMois));
  const dureeMax = Math.floor(Number(brut.dureeMaxMois));
  if (!Number.isFinite(dureeMin) || dureeMin < 1 || dureeMin > 24) return { error: "Durée minimale d'engagement invalide (1 à 24 mois)." };
  if (!Number.isFinite(dureeMax) || dureeMax < dureeMin || dureeMax > 36) return { error: "Durée maximale invalide : elle doit aller de la durée minimale à 36 mois." };

  const paliers = [];
  const seuils = new Set();
  for (const p of Array.isArray(brut.paliers) ? brut.paliers.slice(0, 6) : []) {
    const seuil  = Math.floor(Number(p?.aPartirDeMois));
    const remise = Number(p?.remisePourcent);
    if (!Number.isFinite(seuil) || seuil < 1) return { error: "Chaque palier de remise doit partir d'un nombre de mois." };
    if (!Number.isFinite(remise) || remise < 0 || remise > 100) return { error: `Remise invalide pour le palier « à partir de ${seuil} mois ».` };
    if (seuil > dureeMax) return { error: `Le palier « à partir de ${seuil} mois » dépasse la durée maximale du contrat.` };
    if (seuils.has(seuil)) return { error: `Deux paliers partent de ${seuil} mois — la remise deviendrait ambiguë.` };
    seuils.add(seuil);
    paliers.push({ aPartirDeMois: seuil, remisePourcent: Math.round(remise * 100) / 100 });
  }

  return {
    offre: {
      active: true,
      dureeMinMois: dureeMin,
      dureeMaxMois: dureeMax,
      paliers,
      conditions: brut.conditions ? String(brut.conditions).trim().slice(0, 600) : null,
    },
  };
}

export const updateDriver = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ message: "Chauffeur introuvable." });

    const isOwner = driver.owner.toString() === req.user._id.toString();
    if (req.user.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    const EDITABLE = [
      "firstName", "lastName", "phone", "profilePhoto", "cv", "title", "description",
      "tarif", "tarifDemiJournee", "tarifHeure", "tarifMois",
      "tarifEntered", "tarifDemiJourneeEntered", "tarifHeureEntered", "tarifMoisEntered", "priceEntryCurrency", "currency",
      "disponibilite", "zone", "ville", "zonesTarifaires", "miseADisposition",
      "experience", "langues", "permisCategorie", "vehiculePersonnel", "typeVehicule",
      "images",
    ];

    if (req.body.currency) {
      const activeRates = await getActiveRates();
      if (!activeRates.some((r) => r.code === req.body.currency)) {
        return res.status(400).json({ message: "Devise d'affichage invalide." });
      }
    }

    const safeUpdate = {};
    for (const key of EDITABLE) {
      if (req.body[key] !== undefined) safeUpdate[key] = req.body[key];
    }

    const zonesTarif = await normaliserZonesTarifaires(req.user, safeUpdate.zonesTarifaires);
    if (zonesTarif.error) return res.status(400).json({ message: zonesTarif.error });
    if (zonesTarif.refus) return res.status(403).json(zonesTarif.refus);
    if (zonesTarif.zones !== undefined) safeUpdate.zonesTarifaires = zonesTarif.zones;

    const dispo = await normaliserMiseADisposition(req.user, safeUpdate.miseADisposition, driver);
    if (dispo.error) return res.status(400).json({ message: dispo.error });
    if (dispo.refus) return res.status(403).json(dispo.refus);
    if (dispo.offre !== undefined) safeUpdate.miseADisposition = dispo.offre;

    // Cohérence photos si l'un des deux champs est modifié (voir createDriver)
    const nextProfilePhoto = safeUpdate.profilePhoto !== undefined ? safeUpdate.profilePhoto : driver.profilePhoto;
    const nextVehiculePersonnel = safeUpdate.vehiculePersonnel !== undefined ? safeUpdate.vehiculePersonnel : driver.vehiculePersonnel;
    const nextImages = safeUpdate.images !== undefined ? safeUpdate.images : driver.images;
    if (!nextProfilePhoto) {
      return res.status(400).json({ message: "Photo de profil du chauffeur requise." });
    }
    if (nextVehiculePersonnel && (!nextImages || nextImages.length === 0)) {
      return res.status(400).json({ message: "Au moins une photo du véhicule est requise pour un chauffeur avec véhicule." });
    }
    if (!nextVehiculePersonnel) safeUpdate.images = [];
    const imagesError = validateDriverImages([nextProfilePhoto, ...(nextVehiculePersonnel ? nextImages : [])]);
    if (imagesError) return res.status(400).json({ message: imagesError });

    // uploadBase64Images ignore déjà toute valeur qui n'est pas un data URI
    // (une URL ImageKit déjà hébergée passe donc inchangée) — voir createDriver
    // pour le même correctif à la création.
    if (safeUpdate.profilePhoto !== undefined) {
      [safeUpdate.profilePhoto] = await uploadBase64Images([safeUpdate.profilePhoto], FOLDERS.drivers);
    }
    if (safeUpdate.images?.length) {
      safeUpdate.images = await uploadBase64Images(safeUpdate.images, FOLDERS.drivers);
    }

    // ── CV : requis en permanence (déjà exigé à la création) ────────────────
    const nextCv = safeUpdate.cv !== undefined ? safeUpdate.cv : driver.cv;
    const cvError = validateCv(nextCv);
    if (cvError) return res.status(400).json({ message: cvError });
    // Même correctif que profilePhoto/images ci-dessus — voir uploadBase64Document.
    if (safeUpdate.cv !== undefined) {
      safeUpdate.cv = await uploadBase64Document(safeUpdate.cv, FOLDERS.drivers);
    }

    // Rattachement à une entreprise du même propriétaire — même logique que
    // vehicleController.updateVehicle (déplacement du partenaire entre ses
    // propres entreprises/villes, sans changer de compte).
    if (req.body.businessId !== undefined) {
      if (req.body.businessId === null) {
        safeUpdate.business = null;
      } else {
        const business = await (mongoose.Types.ObjectId.isValid(req.body.businessId) ? PartnerBusiness.findOne({ _id: req.body.businessId, owner: driver.owner }).lean() : null);
        if (!business) return res.status(400).json({ message: "Entreprise introuvable." });
        safeUpdate.business = business._id;
      }
    }

    // Permis de conduire : le partenaire peut le joindre ou le remplacer à
    // l'édition (une fiche publiée sans permis ne pouvait jamais se compléter).
    const permis = req.body.licenseDocument;
    if (permis?.frontImage && String(permis.frontImage).startsWith("data:")) {
      for (const img of [permis.frontImage, permis.backImage].filter(Boolean)) {
        const check = validateImageDataUri(img, MAX_DRIVER_DOC_BYTES);
        if (!check.ok) return res.status(400).json({ message: `Permis : ${check.message}` });
      }
      const [recto, verso] = await Promise.all([
        uploadBase64Document(permis.frontImage, FOLDERS.driverDocs),
        uploadBase64Document(permis.backImage || null, FOLDERS.driverDocs),
      ]);
      safeUpdate.licenseDocument = { frontImage: recto, backImage: verso };
    }

    const updated = await Driver.findByIdAndUpdate(req.params.id, safeUpdate, { new: true, runValidators: true });
    // Permis et CV désormais complets : le partenaire peut devenir validé.
    if (isOwner) await evaluerPartenaire(driver.owner);
    res.json({ driver: isOwner ? await Driver.findById(updated._id) : updated });
  } catch (err) {
    logger.error("updateDriver:", err);
    if (err.name === "ValidationError") {
      return res.status(400).json({ message: "Données invalides : " + err.message });
    }
    res.status(500).json({ message: "Erreur mise à jour." });
  }
};

// ── Transférer un profil chauffeur vers un autre compte/entreprise/ville/pays
// (admin uniquement) ─────────────────────────────────────────────────────────
// Un partenaire ne peut déplacer ses propres chauffeurs qu'entre SES entreprises
// (voir updateDriver ci-dessus, businessId) — changer le compte propriétaire
// (owner) reste un outil de support réservé à l'admin (annonce mal rattachée à
// la création, transfert de portefeuille entre partenaires...).
export const transferDriver = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ message: "Chauffeur introuvable." });

    const { ownerId, businessId, country, ville } = req.body;
    const before = { owner: driver.owner, business: driver.business, country: driver.country, ville: driver.ville };
    const update = {};

    let resolvedOwnerId = driver.owner;
    if (ownerId !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(ownerId)) {
        return res.status(400).json({ message: "Compte propriétaire invalide." });
      }
      const newOwner = await User.findById(ownerId).select("role").lean();
      if (!newOwner || !["partenaire", "admin"].includes(newOwner.role)) {
        return res.status(400).json({ message: "Le compte destinataire doit être un partenaire." });
      }
      resolvedOwnerId = ownerId;
      update.owner = ownerId;
    }

    if (businessId !== undefined) {
      // Un businessId malformé ferait lever un CastError à findOne (→ 500) au
      // lieu d'un simple refus de saisie.
      if (businessId !== null && !mongoose.Types.ObjectId.isValid(businessId)) {
        return res.status(400).json({ message: "Entreprise invalide." });
      }
      if (businessId === null) {
        update.business = null;
      } else {
        const business = await PartnerBusiness.findOne({ _id: businessId, owner: resolvedOwnerId }).lean();
        if (!business) return res.status(400).json({ message: "Entreprise introuvable pour ce propriétaire." });
        update.business = business._id;
        // Une entreprise choisie fait autorité sur le pays, sauf si un pays est
        // explicitement fourni par ailleurs dans la même requête.
        if (country === undefined) update.country = business.country;
      }
    }
    if (country !== undefined) update.country = country ? String(country).toUpperCase() : null;
    if (ville   !== undefined) update.ville   = ville || undefined;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "Aucun changement fourni (ownerId, businessId, country ou ville)." });
    }

    const updated = await Driver.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    await logAction(req, "driver.admin_transfer", "Driver", req.params.id, { before, after: update });

    res.json({ driver: updated });
  } catch (err) {
    logger.error("transferDriver:", err);
    res.status(500).json({ message: "Erreur lors du transfert." });
  }
};
