import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";
import Driver from "../models/Driver.js";
import Activity from "../models/Activity.js";
import SparePart from "../models/SparePart.js";
import ImportExportListing from "../models/ImportExportListing.js";
import Booking from "../models/Booking.js";
import SalesLead from "../models/SalesLead.js";
import IETransaction from "../models/IETransaction.js";
import { CLAUSE_COMPTE_DE_TEST } from "../utils/comptesDeTest.js";

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVATION DES PARTENAIRES (prompt maître §6 et §12.2, 2026-10-28)
// ═══════════════════════════════════════════════════════════════════════════
// Trois étapes distinctes, jamais confondues :
//   inscrit  — un compte partenaire existe ;
//   vérifié  — ses documents sont en règle POUR SON MÉTIER
//              (services/validationPartenaire.js, validationPartenaire.statut) ;
//   activé   — il peut réellement servir un client : profil complet, vérifié,
//              au moins une offre exploitable (approuvée, disponible, avec un
//              prix), et joignable (e-mail ou téléphone vérifié).
// Créer un compte n'active pas un partenaire. L'activation est CALCULÉE à la
// lecture, jamais stockée : elle ne peut pas rester vraie après le retrait de
// la dernière offre.
//
// En plus, le suivi des PREMIÈRES DEMANDES (reçues, auxquelles il a répondu)
// sert l'accompagnement au lancement — sans entrer dans l'activation, qu'un
// nouveau partenaire ne pourrait sinon jamais atteindre.

export const CRITERES_ACTIVATION = ["profilComplet", "verifie", "offresExploitables", "joignable"];

const LIBELLES_CRITERES = {
  profilComplet:      "Profil complet (nom, prénom, pays, téléphone)",
  verifie:            "Documents vérifiés pour votre métier",
  offresExploitables: "Au moins une offre approuvée, disponible et chiffrée",
  joignable:          "E-mail ou téléphone vérifié, pour recevoir les demandes",
};

const idStr = (x) => String(x?._id || x);

// Offres exploitables par propriétaire — une requête par catalogue, quel que
// soit le nombre de partenaires.
async function offresExploitables(ids) {
  const filtreProprio = (champ) => ({ [champ]: { $in: ids } });
  const [vehicules, chauffeurs, activites, pieces, annoncesExport] = await Promise.all([
    Vehicle.find({ ...filtreProprio("owner"), status: "approved", available: true, manuallyPaused: { $ne: true },
      $or: [{ pricePerDay: { $gt: 0 } }, { priceForSale: { $gt: 0 } }] }).select("_id owner").lean(),
    Driver.find({ ...filtreProprio("owner"), status: "approved" }).select("_id owner").lean(),
    Activity.find({ ...filtreProprio("owner"), status: "approved", available: true, manuallyPaused: { $ne: true }, price: { $gt: 0 } }).select("_id owner").lean(),
    SparePart.find({ ...filtreProprio("owner"), status: "approved", available: true, manuallyPaused: { $ne: true }, price: { $gt: 0 }, stock: { $ne: 0 } }).select("_id owner").lean(),
    ImportExportListing.find({ ...filtreProprio("partner"), status: "approved", price: { $gt: 0 } }).select("_id partner").lean(),
  ]);
  const parProprio = new Map();
  const ajouter = (proprio, cle, id) => {
    const k = idStr(proprio);
    const o = parProprio.get(k) || { vehicules: 0, chauffeurs: 0, activites: 0, pieces: 0, annoncesExport: 0, total: 0, ids: [] };
    o[cle] += 1; o.total += 1; o.ids.push(id);
    parProprio.set(k, o);
  };
  vehicules.forEach((v) => ajouter(v.owner, "vehicules", v._id));
  chauffeurs.forEach((d) => ajouter(d.owner, "chauffeurs", d._id));
  activites.forEach((a) => ajouter(a.owner, "activites", a._id));
  pieces.forEach((p) => ajouter(p.owner, "pieces", p._id));
  annoncesExport.forEach((l) => ajouter(l.partner, "annoncesExport", l._id));
  return parProprio;
}

// Premières demandes : réservations sur SES annonces (toutes, publiées ou
// non), demandes d'essai, transactions Trade. « Répondu » = première action
// du partenaire tracée après la notification.
async function premieresDemandes(ids) {
  const [veh, drv, act, prt] = await Promise.all([
    Vehicle.find({ owner: { $in: ids } }).select("_id owner").lean(),
    Driver.find({ owner: { $in: ids } }).select("_id owner").lean(),
    Activity.find({ owner: { $in: ids } }).select("_id owner").lean(),
    SparePart.find({ owner: { $in: ids } }).select("_id owner").lean(),
  ]);
  const proprioDe = new Map([...veh, ...drv, ...act, ...prt].map((x) => [idStr(x._id), idStr(x.owner)]));
  const offres = [...proprioDe.keys()];
  const [bookings, leads, trades] = await Promise.all([
    offres.length ? Booking.find({ $or: [{ vehicle: { $in: offres } }, { driver: { $in: offres } }, { activity: { $in: offres } }, { part: { $in: offres } }] })
      .select("vehicle driver activity part createdAt partnerNotifiedAt auditTrail.actorType auditTrail.timestamp status").lean() : [],
    SalesLead.find({ partner: { $in: ids } }).select("partner createdAt sla.responseTimeMs").lean(),
    IETransaction.find({ partner: { $in: ids } }).select("partner createdAt").lean(),
  ]);
  const suivi = new Map();
  const entree = (k) => {
    if (!suivi.has(k)) suivi.set(k, { recues: 0, repondues: 0, premiereLe: null, delais: [] });
    return suivi.get(k);
  };
  const noter = (s, date) => { s.recues += 1; if (!s.premiereLe || new Date(date) < new Date(s.premiereLe)) s.premiereLe = date; };
  for (const b of bookings) {
    const k = proprioDe.get(idStr(b.vehicle || b.driver || b.activity || b.part));
    if (!k) continue;
    const s = entree(k);
    noter(s, b.createdAt);
    const premiere = (b.auditTrail || []).filter((a) => a.actorType === "PARTNER").map((a) => new Date(a.timestamp)).sort((x, y) => x - y)[0];
    if (premiere) {
      s.repondues += 1;
      if (b.partnerNotifiedAt && premiere >= new Date(b.partnerNotifiedAt)) s.delais.push((premiere - new Date(b.partnerNotifiedAt)) / 60000);
    }
  }
  for (const l of leads) {
    const s = entree(idStr(l.partner));
    noter(s, l.createdAt);
    if (Number.isFinite(l.sla?.responseTimeMs)) { s.repondues += 1; s.delais.push(l.sla.responseTimeMs / 60000); }
  }
  for (const t of trades) noter(entree(idStr(t.partner)), t.createdAt);
  return suivi;
}

const moyenne = (v) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null);

function statutDe(criteres, validation) {
  if (validation === "suspendu") return "suspendu";
  if (CRITERES_ACTIVATION.every((c) => criteres[c])) return "active";
  if (criteres.verifie) return "verifie";
  return "inscrit";
}

/**
 * Évalue l'activation d'une liste de partenaires (documents User .lean()).
 * @returns {Map<string, object>}
 */
export async function evaluerActivations(users) {
  const ids = users.map((u) => u._id);
  if (!ids.length) return new Map();
  const [offres, demandes] = await Promise.all([offresExploitables(ids), premieresDemandes(ids)]);
  const resultat = new Map();
  for (const u of users) {
    const k = idStr(u._id);
    const o = offres.get(k) || { vehicules: 0, chauffeurs: 0, activites: 0, pieces: 0, annoncesExport: 0, total: 0 };
    const d = demandes.get(k) || { recues: 0, repondues: 0, premiereLe: null, delais: [] };
    const criteres = {
      profilComplet: !!(u.firstName && u.lastName && u.country && u.phone),
      verifie: u.validationPartenaire?.statut === "valide",
      offresExploitables: o.total > 0,
      joignable: !!(u.emailVerified || u.phoneVerified),
    };
    resultat.set(k, {
      statut: statutDe(criteres, u.validationPartenaire?.statut),
      criteres,
      manquants: CRITERES_ACTIVATION.filter((c) => !criteres[c]).map((c) => ({ code: c, libelle: LIBELLES_CRITERES[c] })),
      offres: { vehicules: o.vehicules, chauffeurs: o.chauffeurs, activites: o.activites, pieces: o.pieces, annoncesExport: o.annoncesExport, total: o.total },
      premieresDemandes: { recues: d.recues, repondues: d.repondues, premiereLe: d.premiereLe, delaiMoyenReponseMin: moyenne(d.delais) },
      inscritLe: u.createdAt || null,
    });
  }
  return resultat;
}

export const CHAMPS_PARTENAIRE = "firstName lastName email phone country emailVerified phoneVerified validationPartenaire partnerActivity partnerActivities createdAt isFounder";

export async function partenairesReels(filtre = {}) {
  return User.find({ role: "partenaire", $nor: [CLAUSE_COMPTE_DE_TEST], ...filtre }).select(CHAMPS_PARTENAIRE).limit(0).lean();
}

export async function activationDe(userId) {
  const u = await User.findById(userId).select(`${CHAMPS_PARTENAIRE} role`).lean();
  if (!u || u.role !== "partenaire") return null;
  return (await evaluerActivations([u])).get(idStr(u._id));
}
