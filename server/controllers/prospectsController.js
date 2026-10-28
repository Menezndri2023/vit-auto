import mongoose from "mongoose";
import Lead from "../models/Lead.js";
import SalesLead from "../models/SalesLead.js";
import logger from "../utils/logger.js";
import { partnerView, adminView } from "../services/salesLeadService.js";

// ═══════════════════════════════════════════════════════════════════════════
// PROSPECTS — vue unifiée (socle commun, 2026-10-28)
// ═══════════════════════════════════════════════════════════════════════════
// Deux sources, deux responsabilités, AUCUNE fusion des données :
//   • Lead       — le CRM que le PARTENAIRE tient lui-même (PMS) ;
//   • SalesLead  — les demandes d'essai APPORTÉES PAR VIT AUTO, qui portent
//                  l'attribution de 90 jours et donc la commission « vente ».
// Les mélanger dans une collection brouillerait la règle de commission ; on
// les présente ensemble, normalisées, chacune avec son origine. Le masquage
// des coordonnées d'une demande d'essai (avant acceptation) est celui de
// salesLeadService.partnerView — jamais réimplémenté ici.
// (PartnerCrm, le pipeline de RECRUTEMENT des partenaires par VIT AUTO, est un
// troisième usage, distinct : il ne contient pas de clients.)

// Étapes communes, pour lire les deux pipelines d'un seul regard.
const ETAPE_LEAD = {
  nouveau: "nouveau", contacte: "en_cours", en_discussion: "en_cours", devis_envoye: "en_cours",
  negociation: "en_cours", gagne: "gagne", perdu: "perdu", archive: "perdu",
};
const ETAPE_SALES = {
  NEW: "nouveau", QUALIFYING: "nouveau", SENT_TO_PARTNER: "nouveau",
  PARTNER_ACCEPTED: "en_cours", ALTERNATIVE_PROPOSED: "en_cours", CUSTOMER_CONFIRMED: "en_cours",
  TEST_DRIVE_SCHEDULED: "en_cours", TEST_DRIVE_COMPLETED: "en_cours", CUSTOMER_INTERESTED: "en_cours",
  NEGOTIATION: "en_cours", SALE_PENDING: "en_cours",
  SOLD: "gagne", LOST: "perdu", CUSTOMER_NO_SHOW: "perdu", CANCELLED: "perdu",
};
export const ETAPES = ["nouveau", "en_cours", "gagne", "perdu"];

function depuisLead(l) {
  const v = l.vehicle || {};
  return {
    id: String(l._id), source: "partenaire", origine: l.source || "other", reference: null,
    client: { nom: l.buyer?.name || null, telephone: l.buyer?.phone || null, email: l.buyer?.email || null, pays: l.buyer?.country || null },
    objet: [v.make, v.model, v.year].filter(Boolean).join(" ") || null,
    statut: l.status, libelleStatut: l.status, etape: ETAPE_LEAD[l.status] || "en_cours",
    commissionVitAuto: false,
    prochaineRelance: l.nextFollowUpAt || null,
    lien: `/partner-pms?lead=${l._id}`,
    partenaire: l.partnerId, createdAt: l.createdAt,
  };
}

function depuisDemandeEssai(vue) {
  return {
    id: String(vue._id), source: "vit_auto", origine: vue.sourceDetail || "vehicle_page", reference: vue.reference || null,
    client: {
      nom: [vue.client?.firstName, vue.client?.lastName].filter(Boolean).join(" ") || null,
      telephone: vue.client?.phone || null, email: vue.client?.email || null, pays: vue.client?.country || null,
    },
    coordonneesRevelees: vue.contactDisclosed ?? true,
    objet: vue.listingSnapshot?.title || null,
    statut: vue.status, libelleStatut: vue.statusLabel || vue.status, etape: ETAPE_SALES[vue.status] || "en_cours",
    // Apportée par VIT AUTO : une vente conclue dans la fenêtre d'attribution
    // porte la commission « vente ».
    commissionVitAuto: true,
    attributionJusquau: vue.attribution?.expiresAt || null,
    lien: "/vendor/dashboard?tab=leads",
    partenaire: vue.partner, createdAt: vue.createdAt,
  };
}

function filtrer(liste, { etape, source }) {
  return liste
    .filter((p) => !etape || p.etape === etape)
    .filter((p) => !source || p.source === source)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

const synthese = (liste) => ({
  total: liste.length,
  parEtape: Object.fromEntries(ETAPES.map((e) => [e, liste.filter((p) => p.etape === e).length])),
  parSource: { partenaire: liste.filter((p) => p.source === "partenaire").length, vit_auto: liste.filter((p) => p.source === "vit_auto").length },
});

const lireFiltres = (q) => ({
  etape: ETAPES.includes(q.etape) ? q.etape : null,
  source: ["partenaire", "vit_auto"].includes(q.source) ? q.source : null,
});

// GET /api/prospects — les prospects DU partenaire connecté.
export const mesProspects = async (req, res) => {
  try {
    if (req.user.role !== "partenaire") return res.status(403).json({ message: "Réservé aux partenaires." });
    const [leads, essais] = await Promise.all([
      Lead.find({ partnerId: req.user._id }).sort({ createdAt: -1 }).limit(300).lean(),
      SalesLead.find({ partner: req.user._id }).sort({ createdAt: -1 }).limit(300).lean(),
    ]);
    const tous = [...leads.map(depuisLead), ...essais.map((e) => depuisDemandeEssai(partnerView(e)))];
    res.json({ prospects: filtrer(tous, lireFiltres(req.query)), synthese: synthese(tous) });
  } catch (err) {
    logger.error("mesProspects:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/prospects/admin — tous, ou ceux d'un partenaire (?partenaire=id).
export const prospectsAdmin = async (req, res) => {
  try {
    const filtre = req.query.partenaire && mongoose.isValidObjectId(req.query.partenaire) ? req.query.partenaire : null;
    const [leads, essais] = await Promise.all([
      Lead.find(filtre ? { partnerId: filtre } : {}).sort({ createdAt: -1 }).limit(500).lean(),
      SalesLead.find(filtre ? { partner: filtre } : {}).sort({ createdAt: -1 }).limit(500).lean(),
    ]);
    const tous = [...leads.map(depuisLead), ...essais.map((e) => depuisDemandeEssai(adminView(e)))];
    res.json({ prospects: filtrer(tous, lireFiltres(req.query)), synthese: synthese(tous) });
  } catch (err) {
    logger.error("prospectsAdmin:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
