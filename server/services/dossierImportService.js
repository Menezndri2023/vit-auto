import DossierImport from "../models/DossierImport.js";
import Notification from "../models/Notification.js";
import logger from "../utils/logger.js";
import { prochainNumero, formatReference } from "../utils/sequence.js";
import { PACKS, codePays, documentsPour, libelleEtape, rangEtape, ETAPES_BLOQUEES_SI_NON_CONFORME } from "../constants/dossierImport.js";

async function genererReference() {
  const annee = new Date().getFullYear();
  const numero = await prochainNumero(`dossierImport:${annee}`, () =>
    DossierImport.countDocuments({ reference: { $regex: new RegExp(`^VA-IMP-${annee}-`) } }));
  return formatReference("VA-IMP", annee, numero);
}

// ── Étape 3 : règles partagées (admin, zone Transit, séquestre) ────────────
export const MESSAGE_NON_CONFORME = "L'inspection a conclu que le véhicule n'est pas conforme : ni paiement ni embarquement tant qu'une nouvelle inspection ne l'a pas validé.";
export const bloqueParInspection = (dossier, etape) =>
  dossier?.inspection?.verdict === "non_conforme" && ETAPES_BLOQUEES_SI_NON_CONFORME.includes(etape);

// Lignes du devis ajoutées par le système (inspection, assurance) : repérées
// par leur clé pour être remplacées, jamais doublées.
export const CLES_DEVIS = ["inspection", "assurance"];
export function poserLigneDevis(dossier, cle, libelle, montant) {
  const lignes = (dossier.devis.lignes || []).filter((l) => l.cle !== cle);
  if (montant != null) lignes.push({ libelle, montant: Math.round(Number(montant) * 100) / 100, cle });
  dossier.devis.lignes = lignes;
  dossier.devis.total = Math.round(lignes.reduce((s, l) => s + (Number(l.montant) || 0), 0) * 100) / 100;
}

const lienDossier = (dossier) => `/mes-importations/${dossier._id}`;

export async function prevenirClient(dossier, titre, message) {
  try {
    const doc = await Notification.create({ user: dossier.client, type: "info", titre, message, lien: lienDossier(dossier) });
    global._io?.to(`user_${dossier.client}`).emit("notification_new", {
      _id: doc._id, type: "info", titre, message, lien: lienDossier(dossier), lu: false, createdAt: doc.createdAt,
    });
  } catch (err) {
    logger.warn("[DossierImport] notification client (non bloquant) :", err.message);
  }
}

// Fait avancer (ou reculer, sur correction de l'admin) un dossier à une étape.
// L'historique garde chaque passage ; le client est prévenu des étapes visibles.
export async function avancerDossier(dossier, etape, { note = "", visibleClient = true, par = null } = {}) {
  dossier.etape = etape;
  dossier.historique.push({ etape, note, visibleClient, par, date: new Date() });
  if (etape === "cloture") dossier.statut = "termine";
  await dossier.save();
  if (visibleClient) {
    await prevenirClient(dossier, `📦 Import ${dossier.reference} : ${libelleEtape(etape)}`,
      note || `Votre dossier d'import est passé à l'étape « ${libelleEtape(etape)} ».`);
  }
  return dossier;
}

// Demande d'accompagnement déposée par un client → dossier ouvert tout de suite,
// pour que le client voie son suivi dès la première minute.
export async function creerDossierDepuisDemande(demande) {
  if (!demande?.userId || demande.serviceType !== "import") return null;
  const existant = await DossierImport.findOne({ "source.demande": demande._id });
  if (existant) return existant;
  const destination = codePays(demande.destCountry);
  const pack = PACKS[demande.pack] ? demande.pack : "Silver";
  const dossier = await DossierImport.create({
    reference: await genererReference(),
    client: demande.userId,
    source: { type: "accompagnement", demande: demande._id },
    origine: { pays: codePays(demande.sourceCountry) },
    destination: { pays: destination },
    vehicule: {
      type: demande.vehicleType || null, marque: demande.vehicleMake || null,
      modele: demande.vehicleModel || null, annee: demande.vehicleYear || null,
      titre: [demande.vehicleMake, demande.vehicleModel, demande.vehicleYear].filter(Boolean).join(" ") || null,
    },
    budget: { montant: demande.budget ?? null, devise: demande.currency || "USD" },
    message: demande.message || "",
    pack: { code: pack, prix: PACKS[pack].prix, devise: PACKS[pack].devise, statut: "a_regler" },
    documents: documentsPour(destination),
    historique: [{ etape: "demande_recue", note: "Demande d'accompagnement reçue. Un conseiller VIT AUTO vous recontacte.", visibleClient: true }],
  });
  await prevenirClient(dossier, `📦 Dossier d'import ${dossier.reference} ouvert`,
    "Votre demande est enregistrée. Suivez chaque étape de votre importation depuis « Mes importations ».");
  return dossier;
}

// Achat ou réservation d'une annonce export → dossier lié à la transaction.
export async function creerDossierDepuisTransaction(tx, annonce) {
  if (!tx?.client) return null;
  const existant = await DossierImport.findOne({ "source.transaction": tx._id });
  if (existant) return existant;
  const destination = codePays(tx.destCountry);
  return DossierImport.create({
    reference: await genererReference(),
    client: tx.client,
    source: { type: "annonce", transaction: tx._id, annonce: annonce?._id || tx.listing || null },
    origine: { pays: codePays(annonce?.sourceCountry) },
    destination: { pays: destination, ville: tx.destCity || null },
    vehicule: {
      titre: annonce?.title || null, marque: annonce?.make || null, modele: annonce?.model || null,
      annee: annonce?.year || null, vin: annonce?.vin || null,
    },
    // Achat sur annonce : les frais de service VIT AUTO sont déjà dans le prix
    // (voir IETransaction.ventilation) — pas de pack à régler en plus.
    pack: { code: null, prix: null, statut: "offert" },
    documents: documentsPour(destination),
    etape: "vehicule_reserve",
    historique: [{ etape: "vehicule_reserve", note: `Véhicule réservé : ${annonce?.title || "annonce export"}.`, visibleClient: true }],
  });
}

// Statut de la transaction export → étape du dossier. On n'avance jamais un
// dossier en arrière depuis la transaction : l'admin garde la main.
const ETAPE_PAR_STATUT_TX = {
  inspection_requested: "inspection",
  inspection_done:      "inspection",
  in_escrow:            "paiement_sequestre",
  preparing:            "preparation_export",
  shipped:              "embarque",
  in_transit:           "en_mer",
  delivered:            "livre",
  // Exportateur payé à l'embarquement : à la livraison, la transaction passe
  // directement à funds_released, sans jamais être enregistrée « delivered ».
  funds_released:       "livre",
  completed:            "livre",
};

export async function synchroniserDepuisTransaction(tx) {
  try {
    const etape = ETAPE_PAR_STATUT_TX[tx?.status];
    if (!etape) return;
    const dossier = await DossierImport.findOne({ "source.transaction": tx._id });
    if (!dossier || dossier.statut !== "en_cours") return;
    if (rangEtape(etape) <= rangEtape(dossier.etape)) return;
    await avancerDossier(dossier, etape, { note: "" });
  } catch (err) {
    logger.warn("[DossierImport] synchronisation transaction (non bloquant) :", err.message);
  }
}
