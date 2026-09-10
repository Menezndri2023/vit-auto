// ═══════════════════════════════════════════════════════════════════════════
// DEMANDES CLIENTS OUVERTES — accès prioritaire pour les abonnés
// ═══════════════════════════════════════════════════════════════════════════
// Les demandes Import/Export déposées par les visiteurs n'étaient visibles que
// des administrateurs. Les ouvrir aux partenaires transforme un formulaire de
// contact en flux d'affaires — et donne à l'abonnement un avantage qui se
// compte en chiffre d'affaires, pas en visibilité.
//
// L'avantage est une AVANCE, pas une exclusivité : un abonné voit la demande
// dès son dépôt, les autres après un délai. Réserver les demandes aux seuls
// abonnés assécherait le vivier de partenaires dont la plateforme a besoin
// pour répondre, et laisserait des demandes sans réponse.
import logger from "../utils/logger.js";
import ImportExportRequest from "../models/ImportExportRequest.js";
import { notifyAdmins } from "../utils/notifyAdmins.js";
import { planEffectif, planOuvre } from "../services/planAccess.js";

// Avance accordée aux abonnés. Deux heures : assez pour qu'un partenaire
// réactif prenne l'affaire, trop court pour qu'une demande dorme si aucun
// abonné ne la regarde.
export const AVANCE_ABONNE_MS = 2 * 60 * 60 * 1000;

const STATUTS_OUVERTS = ["pending", "processing"];
const MAX_INTERESSES = 5;

// Vue partenaire. Le besoin, jamais l'identité.
//
// Ni e-mail, ni téléphone, ni nom de famille : le partenaire n'a pas à pouvoir
// contacter le client directement — c'est la politique de contact centralisé du
// site, et la seule protection contre la constitution d'un fichier de
// prospection à partir des demandes d'autrui.
const vuePartenaire = (r, moiId) => ({
  id: String(r._id),
  service: r.serviceType,
  pack: r.pack,
  origine: r.sourceCountry || null,
  destination: r.destCountry || null,
  vehicule: [r.vehicleMake, r.vehicleModel, r.vehicleYear].filter(Boolean).join(" ") || r.vehicleType || null,
  type: r.vehicleType || null,
  budget: r.budget ?? null,
  devise: r.currency || "EUR",
  message: r.message || null,
  // Prénom seul : assez pour personnaliser un devis, insuffisant pour
  // identifier ou recontacter la personne hors plateforme.
  prenom: r.firstName || null,
  deposeeLe: r.createdAt,
  candidats: (r.interestedPartners || []).length,
  jaiRepondu: (r.interestedPartners || []).some((i) => String(i.partner) === String(moiId)),
});

// ── GET /api/partner-requests ──────────────────────────────────────────────
export const listOpenRequests = async (req, res) => {
  try {
    const plan = await planEffectif(req.user.teamOf || req.user._id);
    const prioritaire = planOuvre(plan, "demandesPrioritaires");

    const filtre = { status: { $in: STATUTS_OUVERTS } };
    if (!prioritaire) {
      // Le filtre porte sur la date de dépôt, calculée à l'instant de la
      // requête : aucune tâche planifiée n'a à « libérer » les demandes, et une
      // demande devient visible d'elle-même au bout du délai.
      filtre.createdAt = { $lte: new Date(Date.now() - AVANCE_ABONNE_MS) };
    }

    const demandes = await ImportExportRequest.find(filtre)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // Compte des demandes qu'un non-abonné ne voit PAS encore. C'est le chiffre
    // qui rend l'avantage concret : « 3 demandes déposées dans les 2 dernières
    // heures, réservées aux abonnés » se comprend sans explication.
    const enAvance = prioritaire ? 0 : await ImportExportRequest.countDocuments({
      status: { $in: STATUTS_OUVERTS },
      createdAt: { $gt: new Date(Date.now() - AVANCE_ABONNE_MS) },
    });

    res.json({
      demandes: demandes.map((r) => vuePartenaire(r, req.user._id)),
      prioritaire,
      avanceHeures: AVANCE_ABONNE_MS / 3600000,
      enAttenteDeliberation: enAvance,
    });
  } catch (err) {
    logger.error("listOpenRequests:", err);
    res.status(500).json({ message: "Erreur récupération des demandes.", error: err.message });
  }
};

// ── POST /api/partner-requests/:id/interest ────────────────────────────────
// « Je peux répondre à cette demande » : enregistre l'intérêt et prévient
// l'administration, qui met en relation. Le partenaire n'obtient toujours
// aucune coordonnée.
export const declareInterest = async (req, res) => {
  try {
    const { note } = req.body || {};
    const demande = await ImportExportRequest.findById(req.params.id);
    if (!demande) return res.status(404).json({ message: "Demande introuvable." });
    if (!STATUTS_OUVERTS.includes(demande.status)) {
      return res.status(409).json({ message: "Cette demande n'est plus ouverte." });
    }

    const plan = await planEffectif(req.user.teamOf || req.user._id);
    // Le délai d'avance s'applique aussi à l'ÉCRITURE : sans ce contrôle, un
    // non-abonné devinant un identifiant contournerait l'avance entièrement.
    if (!planOuvre(plan, "demandesPrioritaires")
        && Date.now() - new Date(demande.createdAt).getTime() < AVANCE_ABONNE_MS) {
      return res.status(403).json({
        message: "Cette demande vient d'être déposée et reste quelques heures réservée aux partenaires abonnés.",
        code: "PLAN_REQUIS",
      });
    }

    const moi = String(req.user._id);
    if ((demande.interestedPartners || []).some((i) => String(i.partner) === moi)) {
      return res.status(409).json({ message: "Vous vous êtes déjà positionné sur cette demande." });
    }
    // Au-delà de cinq candidats, le client recevrait autant de propositions
    // qu'un appel d'offres — et l'administration ne pourrait plus arbitrer.
    if ((demande.interestedPartners || []).length >= MAX_INTERESSES) {
      return res.status(409).json({ message: "Cette demande a déjà reçu le nombre maximal de propositions." });
    }

    demande.interestedPartners.push({
      partner: req.user._id,
      note: String(note || "").trim().slice(0, 500),
      plan,
    });
    await demande.save();

    await notifyAdmins(
      "ie_request",
      "Un partenaire se positionne sur une demande",
      `${[req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || req.user.email} (plan ${plan}) peut répondre à la demande ${demande.sourceCountry || "?"} → ${demande.destCountry || "?"}.`,
      "/admin?tab=import_export"
    ).catch(() => {});

    res.status(201).json({ demande: vuePartenaire(demande, req.user._id) });
  } catch (err) {
    logger.error("declareInterest:", err);
    res.status(500).json({ message: "Erreur enregistrement de votre intérêt.", error: err.message });
  }
};
