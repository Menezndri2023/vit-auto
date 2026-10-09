// ════════════════════════════════════════════════════════════════════════════
// VALIDATION D'UN PARTENAIRE — source unique (règle de l'exploitant, 2026-10-09)
// ════════════════════════════════════════════════════════════════════════════
// Les documents exigés dépendent de ce que le partenaire EST :
//  • un chauffeur : son permis de conduire et son CV, rien d'autre ;
//  • un particulier : sa pièce d'identité vérifiée (pièce + selfie) ;
//  • un professionnel : sa pièce d'identité et son registre de commerce ;
//  • une entreprise ou un concessionnaire : le registre de commerce et la
//    pièce d'identité de son représentant.
// Un compte qui exerce plusieurs métiers cumule les exigences.
//
// Dès que ces pièces sont réunies ET que l'e-mail ou le téléphone est
// confirmé, le partenaire est validé automatiquement : il publie sans autre
// vérification, et AUCUNE relance de documents ne lui est plus envoyée.
// L'admin garde la main : une Vérification Partenaire suspendue ou rejetée
// suspend la validation.
//
// Avant cette règle, six statuts coexistaient (KYC, badge de certification,
// Vérification Partenaire, Certification, Founding Partner, fiche chauffeur)
// et cinq relances quotidiennes demandaient des documents d'entreprise à des
// chauffeurs particuliers déjà en règle.
import User from "../models/User.js";
import Driver from "../models/Driver.js";
import Notification from "../models/Notification.js";
import PartnerVerification from "../models/PartnerVerification.js";
import PartnerCertification from "../models/PartnerCertification.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import logger from "../utils/logger.js";
import { cacheClear } from "../utils/catalogCache.js";
import { secteursDuPartenaire } from "../constants/partnerTaxonomy.js";

export const DOCUMENTS_PARTENAIRE = {
  contact:               { libelle: "Adresse e-mail ou numéro de téléphone confirmé", lien: "/profile" },
  permis:                { libelle: "Permis de conduire", lien: "/vendor?type=chauffeur" },
  cv:                    { libelle: "CV", lien: "/vendor?type=chauffeur" },
  identite:              { libelle: "Pièce d'identité et selfie (vérification d'identité)", lien: "/kyc" },
  registre:              { libelle: "Registre de commerce (RCCM, patente ou équivalent)", lien: "/partner-certification" },
  identite_representant: { libelle: "Pièce d'identité du représentant légal", lien: "/partner-certification" },
};

const DOCS_ENTITE = {
  particulier:     ["identite"],
  professionnel:   ["identite", "registre"],
  entreprise:      ["registre", "identite_representant"],
  concessionnaire: ["registre", "identite_representant"],
};

// Documents exigés d'un partenaire, selon ses métiers et son entité.
export function documentsExiges(user) {
  const secteurs = secteursDuPartenaire(user);
  const entite = user?.entityType || user?.sellerType || null;
  const exiges = new Set(["contact"]);
  const chauffeurSeulement = secteurs.length > 0 && secteurs.every((s) => s === "chauffeur");
  if (secteurs.includes("chauffeur")) { exiges.add("permis"); exiges.add("cv"); }
  // Un chauffeur n'a QUE son permis et son CV à fournir, quelle que soit la
  // forme de son activité (décision de l'exploitant).
  if (!chauffeurSeulement) for (const d of DOCS_ENTITE[entite] || ["identite"]) exiges.add(d);
  return [...exiges];
}

const present = (v) => typeof v === "string" ? v.trim().length > 0 : !!v;

// Quelles pièces le partenaire a-t-il réellement fournies ? Lit chacun des
// endroits où un document a pu être déposé au fil des versions du site.
async function piecesFournies(user) {
  const id = user._id;
  const [chauffeurs, verif, certif, onboardings] = await Promise.all([
    Driver.find({ owner: id, status: { $ne: "archived" } }).select("cv licenseDocument.frontImage status").lean(),
    PartnerVerification.findOne({ userId: id }).select("status documents").lean(),
    PartnerCertification.findOne({ userId: id }).select("level1.registrationDoc.data level2.idFrontDoc.data level2.selfieDoc.data").lean(),
    PartnerOnboarding.find({ userId: id }).select("legalDocs individualDoc").lean(),
  ]);
  const identiteVerifiee = user.kycStatus === "VERIFIE" || user.identity?.status === "verified";
  const legal = (cle) => onboardings.some((o) => present(o.legalDocs?.[cle]));
  return {
    verif,
    chauffeurs,
    fournies: {
      contact: !!(user.emailVerified || user.phoneVerified),
      permis: chauffeurs.some((d) => present(d.licenseDocument?.frontImage)) || present(user.driverLicenseOcr?.frontImage),
      cv: chauffeurs.some((d) => present(d.cv)),
      identite: identiteVerifiee,
      registre: present(certif?.level1?.registrationDoc?.data) || present(verif?.documents?.rccmDoc)
        || legal("businessRegistration") || legal("businessLicense"),
      identite_representant: identiteVerifiee || present(verif?.documents?.repIdDoc)
        || (present(certif?.level2?.idFrontDoc?.data) && present(certif?.level2?.selfieDoc?.data)),
    },
  };
}

// Évalue un partenaire, enregistre le résultat sur son compte et en tire les
// conséquences au moment où il devient validé (fiches chauffeur publiées,
// message de bienvenue). Ne lève jamais : renvoie null en cas d'échec.
export async function evaluerPartenaire(userOuId) {
  try {
    const user = userOuId?._id && userOuId.role
      ? userOuId
      : await User.findById(userOuId?._id || userOuId).select("role isFounder entityType sellerType partnerActivity partnerActivities kycStatus identity.status emailVerified phoneVerified driverLicenseOcr.frontImage validationPartenaire firstName").lean();
    if (!user || user.role !== "partenaire") return null;

    const exiges = documentsExiges(user);
    const { verif, chauffeurs, fournies } = await piecesFournies(user);
    const manquants = exiges.filter((d) => !fournies[d]);
    let statut;
    let mode = null;
    if (["suspendu", "rejete"].includes(verif?.status)) statut = "suspendu";
    else if (user.isFounder) { statut = "valide"; mode = "fondateur"; }
    else if (!manquants.length) { statut = "valide"; mode = "auto"; }
    else statut = "a_completer";

    const avant = user.validationPartenaire?.statut;
    const maj = {
      "validationPartenaire.statut": statut,
      "validationPartenaire.exiges": exiges,
      "validationPartenaire.manquants": statut === "valide" ? [] : manquants,
      "validationPartenaire.evalueLe": new Date(),
    };
    if (statut === "valide" && avant !== "valide") {
      maj["validationPartenaire.valideLe"] = new Date();
      maj["validationPartenaire.mode"] = mode;
    }
    await User.updateOne({ _id: user._id }, { $set: maj });

    if (statut === "valide") {
      // Chauffeur en règle (permis + CV) : sa fiche n'attend plus la
      // modération, elle est publiée. Une fiche rejetée par l'admin le reste.
      const enAttente = chauffeurs.filter((d) => d.status === "pending" && present(d.cv) && present(d.licenseDocument?.frontImage));
      if (enAttente.length) {
        await Driver.updateMany({ _id: { $in: enAttente.map((d) => d._id) }, status: "pending" }, { $set: { status: "approved", rejectionReason: null } });
        cacheClear();
      }
      if (avant !== "valide" && mode === "auto") {
        await Notification.create({
          user: user._id, type: "system", titre: "✅ Compte partenaire validé",
          message: enAttente.length
            ? "Vos documents sont complets : votre compte est validé et votre profil chauffeur est en ligne."
            : "Vos documents sont complets : votre compte partenaire est validé. Vous pouvez publier vos offres.",
          lien: "/vendor/dashboard",
        }).catch(() => {});
      }
    }
    return { statut, exiges, manquants: statut === "valide" ? [] : manquants };
  } catch (err) {
    logger.warn("[validationPartenaire] évaluation non aboutie :", err.message);
    return null;
  }
}

// Version « lancer et oublier » pour les contrôleurs : ne retarde jamais la
// réponse à l'utilisateur.
export const reevaluerPartenaire = (userOuId) => { evaluerPartenaire(userOuId).catch(() => {}); };

// Ce que le tableau de bord du partenaire affiche.
export const vueValidation = (resultat) => resultat && ({
  statut: resultat.statut,
  exiges: resultat.exiges.map((code) => ({ code, ...DOCUMENTS_PARTENAIRE[code] })),
  manquants: resultat.manquants.map((code) => ({ code, ...DOCUMENTS_PARTENAIRE[code] })),
});
