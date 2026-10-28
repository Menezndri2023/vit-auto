import logger from "../utils/logger.js";
import Booking from "../models/Booking.js";
import SalesLead from "../models/SalesLead.js";
import IETransaction from "../models/IETransaction.js";
import CommissionLedger from "../models/CommissionLedger.js";
import Payment from "../models/Payment.js";
import Vehicle from "../models/Vehicle.js";
import Driver from "../models/Driver.js";
import Activity from "../models/Activity.js";
import SparePart from "../models/SparePart.js";
import ImportExportListing from "../models/ImportExportListing.js";
import { idsComptesDeTest } from "../utils/comptesDeTest.js";
import { evaluerActivations, partenairesReels, activationDe } from "../services/activationPartenaire.js";
import { calculerIndicateurs as indicateursLogistique } from "./logistiqueController.js";

// ═══════════════════════════════════════════════════════════════════════════
// TABLEAU DE BORD DE DIRECTION (prompt maître §13, 2026-10-28)
// ═══════════════════════════════════════════════════════════════════════════
// Cinq notions toujours séparées, jamais additionnées entre elles :
//   1. volume d'affaires          — ce que les clients ont réglé aux partenaires ;
//   2. revenu brut de commission  — commissions calculées (registre, hors annulées) ;
//   3. montant encaissé           — commissions au statut « payée » ;
//   4. coûts d'exploitation       — NON MESURÉS (aucune donnée de coûts en base) ;
//   5. résultat économique estimé — indisponible tant que 4 manque.
// Une donnée non mesurée vaut `null` et s'affiche « indisponible », jamais 0.
// Les comptes de test sont exclus partout. Montants groupés PAR DEVISE.

const ratio = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const moyenne = (v) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null);
const parDevise = (lignes, devise, montant) => {
  const acc = {};
  for (const l of lignes) {
    const d = devise(l) || "—";
    const m = Number(montant(l));
    if (!Number.isFinite(m)) continue;
    acc[d] = Math.round(((acc[d] || 0) + m) * 100) / 100;
  }
  return acc;
};
const mois = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; };

export async function calculerDirection({ depuis = null, jusqua = null } = {}) {
  const fin = jusqua || new Date();
  const debut = depuis || new Date(fin.getFullYear(), fin.getMonth() - 11, 1);
  const periode = { $gte: debut, $lte: fin };
  const test = await idsComptesDeTest();
  const horsTestClient = test.length ? { client: { $nin: test } } : {};

  // ── Partenaires : inscrits / vérifiés / activés ───────────────────────────
  const partenaires = await partenairesReels();
  const activations = await evaluerActivations(partenaires);
  const statuts = { inscrit: 0, verifie: 0, active: 0, suspendu: 0 };
  for (const a of activations.values()) statuts[a.statut] = (statuts[a.statut] || 0) + 1;
  const reponses = [...activations.values()].map((a) => a.premieresDemandes.delaiMoyenReponseMin).filter((v) => v != null);

  // ── Offres publiées ET disponibles (hors comptes de test) ─────────────────
  const horsTest = (champ) => (test.length ? { [champ]: { $nin: test } } : {});
  const [vehLoc, vehVente, chauffeurs, activites, pieces, annoncesExport] = await Promise.all([
    Vehicle.countDocuments({ ...horsTest("owner"), status: "approved", available: true, manuallyPaused: { $ne: true }, type: "location" }),
    Vehicle.countDocuments({ ...horsTest("owner"), status: "approved", available: true, manuallyPaused: { $ne: true }, type: "vente" }),
    Driver.countDocuments({ ...horsTest("owner"), status: "approved" }),
    Activity.countDocuments({ ...horsTest("owner"), status: "approved", available: true, manuallyPaused: { $ne: true } }),
    SparePart.countDocuments({ ...horsTest("owner"), status: "approved", available: true, manuallyPaused: { $ne: true } }),
    ImportExportListing.countDocuments({ ...horsTest("partner"), status: "approved" }),
  ]);

  // ── Demandes, conversions, finalisations sur la période ───────────────────
  const [bookings, leads, trades, ledger, paiements] = await Promise.all([
    Booking.find({ ...horsTestClient, createdAt: periode })
      .select("type status montantTotal devise commissionAmount createdAt partnerNotifiedAt auditTrail.actorType auditTrail.timestamp").lean(),
    SalesLead.find({ ...horsTestClient, createdAt: periode }).select("status milestones sla sale commission createdAt").lean(),
    IETransaction.find({ ...horsTestClient, createdAt: periode }).select("status finalOffer createdAt").lean(),
    CommissionLedger.find({ ...(test.length ? { partnerId: { $nin: test } } : {}), createdAt: periode }).select("transactionType status commissionAmount currency").lean(),
    Payment.find({ createdAt: periode, status: { $in: ["refunded", "partially_refunded"] } }).select("refundedAmount devise status").lean(),
  ]);
  const logistique = await indicateursLogistique({ depuis: debut, jusqua: fin });

  const termines = bookings.filter((b) => b.status === "completed");
  const annules = bookings.filter((b) => b.status === "cancelled");
  const parType = {};
  for (const b of bookings) {
    const t = (parType[b.type] ||= { demandes: 0, finalisees: 0, annulees: 0 });
    t.demandes += 1;
    if (b.status === "completed") t.finalisees += 1;
    if (b.status === "cancelled") t.annulees += 1;
  }
  for (const t of Object.values(parType)) t.conversion = ratio(t.finalisees, t.demandes);

  // Délai de réponse : notification du partenaire → sa première action tracée.
  const delaisReservations = bookings.map((b) => {
    if (!b.partnerNotifiedAt) return null;
    const notif = new Date(b.partnerNotifiedAt);
    const premiere = (b.auditTrail || []).filter((a) => a.actorType === "PARTNER" && new Date(a.timestamp) >= notif)
      .map((a) => new Date(a.timestamp)).sort((x, y) => x - y)[0];
    return premiere ? (premiere - notif) / 60000 : null;
  }).filter((v) => v != null);
  const delaisLeads = leads.map((l) => (Number.isFinite(l.sla?.responseTimeMs) ? l.sla.responseTimeMs / 60000 : null)).filter((v) => v != null);

  const leadsQualifies = leads.filter((l) => l.milestones?.sentToPartnerAt).length;
  const leadsVendus = leads.filter((l) => l.status === "SOLD");
  const tradesFinalises = trades.filter((t) => ["completed", "funds_released"].includes(t.status));

  const ledgerActif = ledger.filter((e) => e.status !== "cancelled");
  const ledgerPaye = ledger.filter((e) => e.status === "paid");

  return {
    periode: { depuis: debut, jusqua: fin },
    partenaires: {
      inscrits: partenaires.length,
      verifies: statuts.verifie + statuts.active,
      actives: statuts.active,
      suspendus: statuts.suspendu,
      repartition: statuts,
      delaiMoyenReponseMin: moyenne(reponses),
    },
    offresDisponibles: { location: vehLoc, vente: vehVente, chauffeurs, activites, pieces, trade: annoncesExport, total: vehLoc + vehVente + chauffeurs + activites + pieces + annoncesExport },
    demandes: {
      reservations: bookings.length,
      parType,
      demandesEssai: leads.length,
      demandesEssaiQualifiees: leadsQualifies,
      transactionsTrade: trades.length,
      logistiqueSoumises: logistique.demandes.soumises,
      logistiqueQualifiees: logistique.demandes.qualifiees,
    },
    delaisReponseMin: {
      reservations: moyenne(delaisReservations),
      demandesEssai: moyenne(delaisLeads),
      logistiquePremiereReponseH: logistique.delais.premiereReponseH,
    },
    conversions: {
      reservationVersFinalisee: ratio(termines.length, bookings.length),
      demandeEssaiVersVente: ratio(leadsVendus.length, leads.length),
      tradeVersFinalisee: ratio(tradesFinalises.length, trades.length),
      logistiqueVersConclue: ratio(logistique.demandes.operationsConclues, logistique.demandes.soumises),
    },
    transactionsFinalisees: {
      reservations: termines.length,
      ventes: leadsVendus.length,
      trade: tradesFinalises.length,
      logistique: logistique.demandes.operationsConclues,
    },
    // 1. Volume d'affaires — ce que les clients ont réglé aux partenaires.
    volumeAffaires: {
      reservations: parDevise(termines, (b) => b.devise, (b) => b.montantTotal),
      ventes: parDevise(leadsVendus, () => "USD", (l) => l.sale?.finalPriceUSD),
      trade: parDevise(tradesFinalises, (t) => t.finalOffer?.currency, (t) => t.finalOffer?.totalAmount),
      // Logistique : valeur DÉCLARÉE des opérations conclues, entre les parties.
      logistiqueDeclaree: logistique.montantsDeclares.conclues,
    },
    // 2. Revenu brut de commission — calculé, pas encore forcément encaissé.
    commissionsCalculees: parDevise(ledgerActif, (e) => e.currency, (e) => e.commissionAmount),
    // 3. Montant effectivement encaissé.
    commissionsEncaissees: parDevise(ledgerPaye, (e) => e.currency, (e) => e.commissionAmount),
    commissionsParStatut: ledger.reduce((acc, e) => ({ ...acc, [e.status]: (acc[e.status] || 0) + 1 }), {}),
    revenuLogistique: logistique.revenusVitAuto.montantUSD,
    // 4. et 5. — non mesurés : aucune donnée de dépenses n'existe en base.
    coutsExploitation: null,
    coutAcquisition: null,
    resultatEstime: null,
    nonMesure: [
      "Coûts d'exploitation et coût d'acquisition : aucune dépense (marketing, hébergement, salaires) n'est enregistrée dans la plateforme.",
      "Résultat économique estimé : impossible sans les coûts.",
    ],
    annulations: {
      reservations: annules.length,
      trade: trades.filter((t) => t.status === "cancelled").length,
      logistique: logistique.demandes.annulations,
      litigesLogistique: logistique.demandes.litiges,
    },
    remboursements: { nombre: paiements.length, montants: parDevise(paiements, (p) => p.devise, (p) => p.refundedAmount) },
    activiteParMois: activiteMensuelle(partenaires, activations, bookings, debut, fin),
  };
}

// Nouveaux partenaires par mois, et ceux d'entre eux activés aujourd'hui ;
// réservations créées par mois.
function activiteMensuelle(partenaires, activations, bookings, debut, fin) {
  const cles = [];
  for (let d = new Date(debut.getFullYear(), debut.getMonth(), 1); d <= fin; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) cles.push(mois(d));
  const lignes = Object.fromEntries(cles.map((k) => [k, { mois: k, nouveauxPartenaires: 0, dontActivesAujourdhui: 0, reservations: 0 }]));
  for (const p of partenaires) {
    const k = p.createdAt ? mois(p.createdAt) : null;
    if (!lignes[k]) continue;
    lignes[k].nouveauxPartenaires += 1;
    if (activations.get(String(p._id))?.statut === "active") lignes[k].dontActivesAujourdhui += 1;
  }
  for (const b of bookings) { const k = mois(b.createdAt); if (lignes[k]) lignes[k].reservations += 1; }
  return cles.map((k) => lignes[k]);
}

const lirePeriode = (q) => ({
  depuis: q.depuis && !Number.isNaN(Date.parse(q.depuis)) ? new Date(q.depuis) : null,
  jusqua: q.jusqua && !Number.isNaN(Date.parse(q.jusqua)) ? new Date(q.jusqua) : null,
});

export const tableauDirection = async (req, res) => {
  try {
    res.json({ direction: await calculerDirection(lirePeriode(req.query)) });
  } catch (err) {
    logger.error("tableauDirection:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// Liste de suivi de l'activation, pour l'accompagnement des partenaires.
export const listeActivation = async (req, res) => {
  try {
    const partenaires = await partenairesReels();
    const activations = await evaluerActivations(partenaires);
    const statut = ["inscrit", "verifie", "active", "suspendu"].includes(req.query.statut) ? req.query.statut : null;
    const lignes = partenaires.map((p) => ({
      _id: p._id, nom: `${p.firstName || ""} ${p.lastName || ""}`.trim(), email: p.email, pays: p.country,
      metiers: p.partnerActivities?.length ? p.partnerActivities : (p.partnerActivity ? [p.partnerActivity] : []),
      fondateur: !!p.isFounder,
      ...activations.get(String(p._id)),
    })).filter((l) => !statut || l.statut === statut)
      .sort((a, b) => new Date(b.inscritLe || 0) - new Date(a.inscritLe || 0));
    res.json({ partenaires: lignes });
  } catch (err) {
    logger.error("listeActivation:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// Le partenaire voit SA progression vers l'activation (ce qui lui manque).
export const monActivation = async (req, res) => {
  try {
    if (req.user.role !== "partenaire") return res.status(403).json({ message: "Réservé aux partenaires." });
    res.json({ activation: await activationDe(req.user._id) });
  } catch (err) {
    logger.error("monActivation:", err);
    res.status(500).json({ message: "Erreur serveur." });
  }
};
