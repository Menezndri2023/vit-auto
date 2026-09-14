// ── Secteurs d'activité d'un compte partenaire ─────────────────────────────
//
// Le compte naît avec le secteur choisi à l'inscription (`partnerActivity`).
// Il en ajoute d'autres par une DEMANDE, que l'administration approuve ou
// refuse — l'ajout d'un secteur engage une charge documentaire (un exportateur
// n'est pas vérifié comme un loueur), ce n'est donc jamais un bouton libre.
// Le plan fixe combien de secteurs se cumulent (planFeatures.PLAN_SECTEURS).
import logger from "../utils/logger.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import PartnerSectorRequest from "../models/PartnerSectorRequest.js";
import { notifyAdmins } from "../utils/notifyAdmins.js";
import { planEffectif } from "../services/planAccess.js";
import { fondateurActif, annoncesActives } from "../services/quotaAnnonces.js";
import { ACTIVITIES, ACTIVITY_LABELS, SECTEUR_LABELS, secteursDuPartenaire } from "../constants/partnerTaxonomy.js";
import { secteursDuPlan, quotaAnnoncesDuPlan, FIN_IMMUNITE_QUOTAS } from "../constants/planFeatures.js";

const LIEN_ADMIN = "/admin?tab=secteurs";

const refusNonPartenaire = (req, res) => {
  if (req.user.role !== "partenaire") {
    res.status(403).json({ message: "Réservé aux partenaires." });
    return true;
  }
  // Un membre d'équipe agit dans le périmètre du titulaire ; élargir ce
  // périmètre est une décision du titulaire.
  if (req.user.teamOf) {
    res.status(403).json({ message: "Seul le titulaire du compte peut demander l'ajout d'un secteur." });
    return true;
  }
  return false;
};

// Vue d'ensemble pour l'espace partenaire : secteurs couverts, ce que le plan
// permet, où en est chaque secteur face à son quota, demandes en cours.
export const mesSecteurs = async (req, res) => {
  try {
    if (refusNonPartenaire(req, res)) return;
    const user = req.user;
    const now = new Date();
    const plan = await planEffectif(user._id);
    const secteurs = secteursDuPartenaire(user);
    const fondateur = await fondateurActif(user._id, now);
    const immunite = now < FIN_IMMUNITE_QUOTAS;
    const quota = quotaAnnoncesDuPlan(plan);

    const occupation = await Promise.all(secteurs.map(async (s) => ({
      secteur: s,
      label: SECTEUR_LABELS[s],
      actives: await annoncesActives(user._id, s),
      // `null` = illimité (plan sans limite, fondateur, ou immunité de lancement).
      quota: immunite || fondateur ? null : quota,
    })));

    const demandes = await PartnerSectorRequest.find({ user: user._id })
      .sort({ createdAt: -1 }).limit(20).lean();

    res.json({
      secteurs: occupation,
      plan,
      maxSecteurs: secteursDuPlan(plan),
      fondateur,
      immuniteJusquau: immunite ? FIN_IMMUNITE_QUOTAS : null,
      demandes,
      secteursDisponibles: ACTIVITIES.filter((a) => !secteurs.includes(a))
        .map((a) => ({ id: a, label: ACTIVITY_LABELS[a] })),
    });
  } catch (err) {
    logger.error("mesSecteurs :", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const demanderSecteur = async (req, res) => {
  try {
    if (refusNonPartenaire(req, res)) return;
    const user = req.user;
    const secteur = String(req.body?.secteur || "");
    const motif = String(req.body?.motif || "").trim().slice(0, 1000);
    if (!ACTIVITIES.includes(secteur)) {
      return res.status(400).json({ message: "Secteur inconnu." });
    }
    const secteurs = secteursDuPartenaire(user);
    if (secteurs.includes(secteur)) {
      return res.status(409).json({ message: `Votre compte couvre déjà le secteur ${SECTEUR_LABELS[secteur]}.` });
    }
    const enAttente = await PartnerSectorRequest.findOne({ user: user._id, secteur, status: "pending" }).lean();
    if (enAttente) {
      return res.status(409).json({ code: "DEMANDE_EN_COURS", message: "Une demande est déjà en cours pour ce secteur." });
    }
    // Un compte historique sans secteur déclaré en déclare un ici : sa
    // première demande ne compte pas comme un cumul.
    const plan = await planEffectif(user._id);
    const max = secteursDuPlan(plan);
    if (max !== null && secteurs.length >= max) {
      return res.status(403).json({
        code: "PLAN_REQUIS",
        feature: "secteurs",
        message: `Votre plan permet ${max} secteur${max > 1 ? "s" : ""} d'activité. Passez à un plan supérieur depuis la page Tarifs pour en cumuler davantage.`,
      });
    }

    const demande = await PartnerSectorRequest.create({ user: user._id, secteur, motif });
    const nom = user.business?.companyName || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
    await notifyAdmins(
      "sector_requested",
      "Demande d'ajout de secteur",
      `${nom} demande le secteur ${SECTEUR_LABELS[secteur]}.`,
      LIEN_ADMIN,
    );
    res.status(201).json({ demande });
  } catch (err) {
    logger.error("demanderSecteur :", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── Administration ─────────────────────────────────────────────────────────
export const adminListerDemandes = async (req, res) => {
  try {
    const { status } = req.query;
    const filtre = ["pending", "approved", "rejected"].includes(status) ? { status } : { status: "pending" };
    const demandes = await PartnerSectorRequest.find(filtre)
      .populate("user", "firstName lastName email business.companyName partnerActivity partnerActivities entityType country certificationBadge kycStatus")
      .populate("reviewedBy", "firstName lastName")
      .sort({ createdAt: 1 })
      .limit(300)
      .lean();
    res.json({ demandes });
  } catch (err) {
    logger.error("adminListerDemandes :", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

export const adminTraiterDemande = async (req, res) => {
  try {
    const { decision } = req.body || {};
    const note = String(req.body?.note || "").trim().slice(0, 1000);
    if (!["approve", "reject"].includes(decision)) {
      return res.status(400).json({ message: "decision doit valoir « approve » ou « reject »." });
    }
    const demande = await PartnerSectorRequest.findById(req.params.id);
    if (!demande) return res.status(404).json({ message: "Demande introuvable." });
    if (demande.status !== "pending") {
      return res.status(409).json({ message: "Cette demande a déjà été traitée." });
    }
    const user = await User.findById(demande.user);
    if (!user) return res.status(404).json({ message: "Compte partenaire introuvable." });

    if (decision === "approve") {
      // Le plan a pu changer depuis la demande : on revérifie la limite ici,
      // sinon l'approbation ouvrirait un secteur que le plan ne couvre plus.
      const secteurs = secteursDuPartenaire(user);
      const plan = await planEffectif(user._id);
      const max = secteursDuPlan(plan);
      if (!secteurs.includes(demande.secteur) && max !== null && secteurs.length >= max) {
        return res.status(409).json({
          code: "PLAN_REQUIS",
          message: `Le plan ${plan} de ce compte permet ${max} secteur${max > 1 ? "s" : ""} ; il en couvre déjà ${secteurs.length}. Le partenaire doit changer de plan avant l'approbation.`,
        });
      }
      // Compte historique sans secteur : le premier secteur accordé devient le
      // secteur principal (via save(), pour que le hook de validation dérive
      // les anciens champs sellerType/partnerCategory comme à l'inscription).
      if (!user.partnerActivity) {
        user.partnerActivity = demande.secteur;
        await user.save();
      } else {
        await User.updateOne({ _id: user._id }, { $addToSet: { partnerActivities: demande.secteur } });
      }
    }

    demande.status = decision === "approve" ? "approved" : "rejected";
    demande.reviewedBy = req.user._id;
    demande.reviewedAt = new Date();
    demande.note = note;
    await demande.save();

    const label = SECTEUR_LABELS[demande.secteur];
    await Notification.create({
      user: user._id,
      type: decision === "approve" ? "sector_approved" : "sector_rejected",
      titre: decision === "approve" ? `Secteur ${label} ouvert` : `Secteur ${label} refusé`,
      message: decision === "approve"
        ? `Votre compte couvre désormais le secteur ${label}. Vous pouvez y publier depuis votre espace partenaire.`
        : `Votre demande pour le secteur ${label} a été refusée${note ? ` : ${note}` : "."}`,
      lien: "/vendor/dashboard",
    }).catch((e) => logger.error("notification secteur (non bloquant) :", e.message));

    res.json({ demande });
  } catch (err) {
    logger.error("adminTraiterDemande :", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
