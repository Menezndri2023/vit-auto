import mongoose from "mongoose";
import DemandeLogistique from "../models/DemandeLogistique.js";
import Prestataire from "../models/Prestataire.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { sendEmail } from "../config/email.js";
import { logistiqueNotificationTemplate } from "../services/communication/templates/email/Logistique.js";
import Booking from "../models/Booking.js";
import IETransaction from "../models/IETransaction.js";
import SparePart from "../models/SparePart.js";
import { libelleIncoterm } from "../services/incotermService.js";
import { getConfig } from "../services/pricingEngine.js";
import CommissionLedger from "../models/CommissionLedger.js";
import logger from "../utils/logger.js";
import { notifyAdmins } from "../utils/notifyAdmins.js";
import { prochainNumero, formatReference } from "../utils/sequence.js";
import { validateDocumentDataUri } from "../utils/imageValidation.js";
import { deposerPiece } from "../utils/deposerPiece.js";
import { FOLDERS, isImageKitConfigured } from "../config/imagekit.js";
import { isValidCountryCode } from "../utils/countries.js";
import { csvRow } from "../utils/csv.js";
import { logAction } from "../middleware/auditLog.js";
import {
  STATUTS, TYPES_BESOIN, MODES_TRANSPORT, LIBELLES_STATUT, JALONS, STATUTS_TERMINAUX,
  ANNULABLE_PAR_CLIENT, LITIGE_OUVRABLE, ETAPES_PRESTATAIRE, DEVIS_OUVERTS,
  TYPES_PRESTATAIRE_LOGISTIQUE, MODELE_ECONOMIQUE, EVENEMENTS_DECLENCHEURS_POTENTIELS,
  DONNEURS_ORDRE, PAYEURS, POSTES_COUT, NATURES_DEVIS, DOCUMENTS_PAR_ROLE,
} from "../constants/logistique.js";

// ═══════════════════════════════════════════════════════════════════════════
// VIT-AUTO LOGISTIQUE — mise en relation gratuite (exploitant, 2026-10-27)
// ═══════════════════════════════════════════════════════════════════════════
// Parcours : demande du client → qualification par l'admin → sollicitation
// des prestataires compatibles → devis → acceptation par le client →
// exécution déclarée par le prestataire retenu → confirmation de réception
// par le client (opération conclue).
//
// Aucune commission, aucun frais, aucun paiement intégré : ce module ne
// calcule ni ne facture rien. Le prix du transport se règle entre les
// parties. Les indicateurs ne lisent que des événements enregistrés.

const MAX_DOC_BYTES = 8 * 1024 * 1024;
const RETARD_SANS_REPONSE_MS = 48 * 60 * 60 * 1000;

const txt = (v, max) => String(v ?? "").trim().slice(0, max);
const num = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const idEgal = (a, b) => a && b && String(a._id || a) === String(b._id || b);

// Notification dans l'application + e-mail (2026-10-28). L'e-mail respecte la
// préférence « confirmations » du profil (notif_bookingConfirmations), ignore
// les comptes inactifs et passe par le service central, qui écarte les
// adresses ayant rebondi et n'envoie rien sans fournisseur configuré (tests).
async function envoyerEmailLogistique(userId, titre, message, lien) {
  try {
    const u = await User.findById(userId).select("email firstName country isActive notif_bookingConfirmations").lean();
    if (!u?.email || u.isActive === false || u.notif_bookingConfirmations === false) return;
    await sendEmail({
      to: u.email,
      subject: `VIT-AUTO Logistique — ${titre}`,
      html: logistiqueNotificationTemplate({ firstName: u.firstName, titre, message, lien, country: u.country }),
      template: "logistique_notification",
      userId: u._id,
    });
  } catch (err) {
    logger.error("logistique e-mail (non bloquant) :", err.message);
  }
}

async function notifier(userId, titre, message, lien, { email = true } = {}) {
  if (!userId) return;
  if (email) envoyerEmailLogistique(userId, titre, message, lien);
  const notif = await Notification.create({ user: userId, type: "logistique", titre, message, lien }).catch((err) => {
    logger.error("logistique notifier (non bloquant) :", err.message);
    return null;
  });
  if (notif && global._io) {
    global._io.to(`user_${userId}`).emit("notification_new", {
      _id: notif._id, type: "logistique", titre, message, lien, lu: false, createdAt: notif.createdAt,
    });
  }
}

// Change le statut, pose le jalon la première fois, trace l'événement.
function changerStatut(demande, statut, { par = null, role = "systeme", note = "", reference = null, visibleClient = true } = {}) {
  demande.statut = statut;
  const jalon = JALONS[statut];
  if (jalon && !demande.jalons[jalon]) demande.jalons[jalon] = new Date();
  demande.evenements.push({ statut, type: "statut", note: txt(note, 1000), reference: reference ? txt(reference, 120) : null, par, role, visibleClient });
}

// Un devis « proposé » dont la validité est passée n'est plus acceptable.
function marquerDevisExpires(demande, now = new Date()) {
  for (const d of demande.devis) {
    if (d.statut === "propose" && d.valideJusquau && new Date(d.valideJusquau) < now) d.statut = "expire";
  }
}

function lireDemandeSaisie(body = {}) {
  const typeBesoin = TYPES_BESOIN.includes(body.typeBesoin) ? body.typeBesoin : null;
  const m = body.marchandise || {};
  const v = m.vehicule || {};
  return {
    typeBesoin,
    depart:  { pays: txt(body.depart?.pays, 2).toUpperCase(),  ville: txt(body.depart?.ville, 120) },
    arrivee: { pays: txt(body.arrivee?.pays, 2).toUpperCase(), ville: txt(body.arrivee?.ville, 120) },
    modeSouhaite: MODES_TRANSPORT.includes(body.modeSouhaite) ? body.modeSouhaite : "indifferent",
    marchandise: {
      description: txt(m.description, 2000),
      quantite:    Math.max(1, Math.floor(num(m.quantite) || 1)),
      poidsKg:     num(m.poidsKg),
      longueurCm:  num(m.longueurCm),
      largeurCm:   num(m.largeurCm),
      hauteurCm:   num(m.hauteurCm),
      contraintes: txt(m.contraintes, 1000),
      vehicule: typeBesoin === "vehicule" ? {
        marque: txt(v.marque, 60), modele: txt(v.modele, 60), annee: num(v.annee),
        roulant: typeof v.roulant === "boolean" ? v.roulant : null,
      } : undefined,
    },
    dateSouhaitee: body.dateSouhaitee && !Number.isNaN(Date.parse(body.dateSouhaitee)) ? new Date(body.dateSouhaitee) : null,
    documentsDisponibles: txt(body.documentsDisponibles, 1000),
    contact: {
      nom:       txt(body.contact?.nom, 120),
      telephone: txt(body.contact?.telephone, 40),
      email:     txt(body.contact?.email, 160).toLowerCase(),
    },
  };
}

// Champs exigés selon le besoin — rien d'inutile : poids et dimensions ne
// sont demandés que pour des pièces ou « autre », la marque et le modèle
// seulement pour un véhicule.
async function champsManquants(d) {
  const manque = [];
  if (!d.typeBesoin) manque.push("typeBesoin");
  if (!d.depart.pays || !(await isValidCountryCode(d.depart.pays))) manque.push("depart.pays");
  if (!d.depart.ville) manque.push("depart.ville");
  if (!d.arrivee.pays || !(await isValidCountryCode(d.arrivee.pays))) manque.push("arrivee.pays");
  if (!d.arrivee.ville) manque.push("arrivee.ville");
  if (d.typeBesoin === "vehicule") {
    if (!d.marchandise.vehicule?.marque) manque.push("marchandise.vehicule.marque");
    if (!d.marchandise.vehicule?.modele) manque.push("marchandise.vehicule.modele");
  } else if (d.typeBesoin) {
    if (!d.marchandise.description) manque.push("marchandise.description");
  }
  if (!d.contact.telephone && !d.contact.email) manque.push("contact");
  return manque;
}

// ── Vues filtrées ───────────────────────────────────────────────────────────
// Le client ne voit ni la note admin, ni les sollicitations internes, ni les
// versions remplacées ou retirées des devis.
// L'acheteur de la commande liée qui n'a pas créé le dossier le suit en
// lecture ; seul le demandeur décide (devis, rôles, annulation).
const incotermAffiche = (i) => (i?.regle ? { ...i, libelle: libelleIncoterm(i) } : null);

function vueClient(demande, userId = null) {
  const d = demande.toObject ? demande.toObject() : demande;
  return {
    ...d,
    estDemandeur: userId ? idEgal(d.client, userId) : true,
    cleIdempotence: undefined,
    incotermCommande: incotermAffiche(d.incotermCommande),
    noteAdmin: undefined,
    sollicitations: undefined,
    nbPrestatairesSollicites: (d.sollicitations || []).length,
    devis: (d.devis || []).filter((x) => !["remplace", "retire"].includes(x.statut)),
    evenements: (d.evenements || []).filter((e) => e.visibleClient),
    libelleStatut: LIBELLES_STATUT[d.statut],
    commandeLiee: commandeLiee(d),
  };
}

// Résumé non sensible de la commande rattachée (type + référence), à partir
// des liens peuplés ou bruts.
function commandeLiee(d) {
  if (d.liens?.booking) {
    const b = d.liens.booking;
    return { type: "booking", id: String(b._id || b), reference: b.reference || null, libelle: "Commande de pièces détachées" };
  }
  if (d.liens?.transaction) {
    const t = d.liens.transaction;
    return { type: "transaction", id: String(t._id || t), reference: `TXN-${String(t._id || t).slice(-8).toUpperCase()}`, libelle: "Transaction VIT-AUTO Trade" };
  }
  return null;
}

// Le prestataire sollicité voit le besoin, jamais l'identité ni les
// coordonnées du client — sauf s'il est le prestataire retenu.
function vuePrestataire(demande, prestataireId) {
  const d = demande.toObject ? demande.toObject() : demande;
  const retenu = idEgal(d.devisAccepte?.prestataire, prestataireId);
  return {
    _id: d._id, reference: d.reference, typeBesoin: d.typeBesoin, depart: d.depart, arrivee: d.arrivee,
    modeSouhaite: d.modeSouhaite, marchandise: d.marchandise, dateSouhaitee: d.dateSouhaitee,
    documentsDisponibles: d.documentsDisponibles, statut: d.statut, libelleStatut: LIBELLES_STATUT[d.statut],
    createdAt: d.createdAt,
    // Seulement la NATURE de la commande liée : ni montant, ni vendeur, ni
    // identifiant exploitable.
    commandeLiee: commandeLiee(d) ? { libelle: commandeLiee(d).libelle } : null,
    // Conditions et déclarations utiles à l'intervention — jamais le nom des
    // parties ni les montants de la commande.
    incotermCommande: incotermAffiche(d.incotermCommande),
    donneurOrdre: d.donneurOrdre, payeur: d.payeur, precisionRoles: d.precisionRoles,
    enlevement: d.enlevement,
    documents: retenu ? d.documents : undefined,
    retenu,
    contact: retenu ? d.contact : undefined,
    sollicitation: (d.sollicitations || []).find((s) => idEgal(s.prestataire, prestataireId)) || null,
    mesDevis: (d.devis || []).filter((x) => idEgal(x.prestataire, prestataireId)),
    devisAccepte: retenu ? d.devisAccepte : undefined,
    preuveLivraison: retenu ? d.preuveLivraison : undefined,
    // Sans les événements de devis : ils portent les montants des CONCURRENTS.
    // Ses propres devis sont dans `mesDevis`.
    evenements: (d.evenements || []).filter((e) => e.visibleClient && !String(e.type).startsWith("devis_")),
  };
}

// Le vendeur/exportateur d'une commande liée : ce qu'il faut pour préparer
// l'enlèvement. Ni devis (montants), ni coordonnées du client.
function vueVendeur(demande) {
  const d = demande.toObject ? demande.toObject() : demande;
  const prest = d.devisAccepte?.prestataire;
  return {
    _id: d._id, reference: d.reference, typeBesoin: d.typeBesoin, depart: d.depart, arrivee: d.arrivee,
    modeSouhaite: d.modeSouhaite, marchandise: d.marchandise, dateSouhaitee: d.dateSouhaitee,
    statut: d.statut, libelleStatut: LIBELLES_STATUT[d.statut], createdAt: d.createdAt, updatedAt: d.updatedAt,
    commandeLiee: commandeLiee(d),
    incotermCommande: incotermAffiche(d.incotermCommande),
    donneurOrdre: d.donneurOrdre, payeur: d.payeur, precisionRoles: d.precisionRoles,
    enlevement: d.enlevement,
    documents: d.documents,
    prestataireRetenu: prest?.raisonSociale ? { raisonSociale: prest.raisonSociale } : (prest ? { raisonSociale: "Prestataire retenu" } : null),
    // Les événements de devis portent le montant proposé : exclus de la vue
    // du vendeur, qui ne voit pas les prix du transport.
    evenements: (d.evenements || []).filter((e) => e.visibleClient && !String(e.type).startsWith("devis_")),
  };
}

async function genererReference() {
  const annee = new Date().getFullYear();
  const n = await prochainNumero(`logistique:${annee}`, () =>
    DemandeLogistique.countDocuments({ reference: { $regex: new RegExp(`^VA-LOG-${annee}-`) } }));
  return formatReference("VA-LOG", annee, n);
}

const charger = async (id, res) => {
  if (!mongoose.isValidObjectId(id)) { res.status(400).json({ message: "Identifiant invalide." }); return null; }
  const demande = await DemandeLogistique.findById(id);
  if (!demande) { res.status(404).json({ message: "Demande introuvable." }); return null; }
  return demande;
};

const echec = (res, nom) => (err) => {
  logger.error(`logistique.${nom}:`, err);
  if (!res.headersSent) res.status(500).json({ message: "Erreur serveur." });
};

// ── Rattachement à une commande Parts ou Trade ─────────────────────────────
// Une demande logistique peut référencer UNE commande du client : une
// commande de pièces (Booking type "piece") ou une transaction VIT-AUTO Trade
// (IETransaction). Seule la référence est stockée — les données de la
// commande ne sont pas recopiées, le formulaire ne fait que préremplir.
// Le rattachement ne déclenche ni paiement ni commission.
const STATUTS_COMMANDE_EXCLUS = { booking: ["cancelled", "rejected"], transaction: ["cancelled"] };
const STATUTS_DEMANDE_INACTIFS = ["annulee"];
const codePays = (v) => (typeof v === "string" && /^[A-Za-z]{2}$/.test(v.trim()) ? v.trim().toUpperCase() : "");


function resumeCommandePiece(b) {
  const titre = b.part?.title || "Pièces détachées";
  const qte = b.piece?.quantity || 1;
  return {
    type: "booking", id: String(b._id), reference: b.reference || null, libelle: `Pièces — ${qte} × ${titre}`,
    prefill: {
      typeBesoin: "pieces",
      depart:  { pays: codePays(b.part?.country), ville: b.part?.ville || "" },
      arrivee: { pays: codePays(b.piece?.delivery?.country), ville: b.piece?.delivery?.ville || "" },
      marchandise: { description: `${qte} × ${titre}`, quantite: qte },
    },
  };
}

function resumeTransactionTrade(t) {
  const l = t.listing || {};
  return {
    type: "transaction", id: String(t._id), reference: `TXN-${String(t._id).slice(-8).toUpperCase()}`,
    libelle: `Véhicule — ${l.title || [l.make, l.model, l.year].filter(Boolean).join(" ") || "VIT-AUTO Trade"}`,
    prefill: {
      typeBesoin: "vehicule",
      // sourceCountry est parfois un NOM (« Émirats Arabes Unis ») : on ne
      // prérempli le pays que s'il s'agit d'un code ISO, sans deviner.
      depart:  { pays: codePays(l.sourceCountry), ville: l.sourceCity || "" },
      arrivee: { pays: codePays(t.destCountry), ville: t.destCity || "" },
      marchandise: { vehicule: { marque: l.make || "", modele: l.model || "", annee: l.year || null } },
    },
  };
}

// Vérifie qu'une commande existe, que l'utilisateur en est l'ACHETEUR ou le
// VENDEUR, et qu'elle n'est pas annulée. Renvoie les parties telles que la
// commande les connaît — jamais telles que le navigateur les annonce — et
// ses conditions Incoterms® pour la copie informative du dossier.
async function verifierLien(userId, lien) {
  if (!lien || !["booking", "transaction"].includes(lien.type) || !mongoose.isValidObjectId(lien.id)) return { erreur: [400, "Commande à rattacher invalide."] };
  let acheteur; let vendeur; let statut; let conditions;
  if (lien.type === "booking") {
    const b = await Booking.findById(lien.id).select("client type status part conditionsIncoterm").populate("part", "owner").lean();
    if (!b || b.type !== "piece") return { erreur: [404, "Commande introuvable."] };
    ({ client: acheteur, status: statut, conditionsIncoterm: conditions } = b);
    vendeur = b.part?.owner || null;
  } else {
    const t = await IETransaction.findById(lien.id).select("client partner status conditionsIncoterm").lean();
    if (!t) return { erreur: [404, "Commande introuvable."] };
    ({ client: acheteur, partner: vendeur, status: statut, conditionsIncoterm: conditions } = t);
  }
  const role = idEgal(acheteur, userId) ? "acheteur" : idEgal(vendeur, userId) ? "vendeur" : null;
  if (!role) return { erreur: [404, "Commande introuvable."] };
  if (STATUTS_COMMANDE_EXCLUS[lien.type].includes(statut)) return { erreur: [409, lien.type === "booking" ? "Cette commande est annulée." : "Cette transaction est annulée."] };
  return { ok: true, role, parties: { acheteur: acheteur || null, vendeur: vendeur || null }, conditions: conditions || null };
}

const copieIncoterm = (c) => (c?.regle ? { regle: c.regle, lieuNomme: c.lieuNomme || null, version: c.version || "2020", statut: c.statut || null } : { regle: null, lieuNomme: null, version: null, statut: null });

// Commandes où l'utilisateur est ACHETEUR (il fait venir) ou VENDEUR (il
// expédie). Une commande peut porter plusieurs dossiers (expéditions
// partielles) : on signale ceux déjà ouverts, sans bloquer.
export const commandesRattachables = async (req, res) => {
  try {
    const mesPieces = await SparePart.find({ owner: req.user._id }).select("_id").lean();
    const selPiece = "reference piece part status createdAt client conditionsIncoterm";
    const selTrade = "listing destCountry destCity status createdAt client partner conditionsIncoterm";
    const [piecesAchat, piecesVente, tradesAchat, tradesVente] = await Promise.all([
      Booking.find({ client: req.user._id, type: "piece", status: { $nin: STATUTS_COMMANDE_EXCLUS.booking } }).select(selPiece).populate("part", "title country ville").sort({ createdAt: -1 }).limit(50).lean(),
      mesPieces.length ? Booking.find({ part: { $in: mesPieces.map((x) => x._id) }, type: "piece", status: { $nin: STATUTS_COMMANDE_EXCLUS.booking } }).select(selPiece).populate("part", "title country ville").sort({ createdAt: -1 }).limit(50).lean() : [],
      IETransaction.find({ client: req.user._id, status: { $nin: STATUTS_COMMANDE_EXCLUS.transaction } }).select(selTrade).populate("listing", "title make model year sourceCountry sourceCity").sort({ createdAt: -1 }).limit(50).lean(),
      IETransaction.find({ partner: req.user._id, status: { $nin: STATUTS_COMMANDE_EXCLUS.transaction } }).select(selTrade).populate("listing", "title make model year sourceCountry sourceCity").sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    const avecRole = (role, conv) => (x) => ({ ...conv(x), role, incoterm: x.conditionsIncoterm?.regle ? { ...copieIncoterm(x.conditionsIncoterm), libelle: libelleIncoterm(x.conditionsIncoterm) } : null });
    const commandes = [
      ...piecesAchat.map(avecRole("acheteur", resumeCommandePiece)), ...piecesVente.map(avecRole("vendeur", resumeCommandePiece)),
      ...tradesAchat.map(avecRole("acheteur", resumeTransactionTrade)), ...tradesVente.map(avecRole("vendeur", resumeTransactionTrade)),
    ];
    const ids = commandes.map((c) => c.id);
    const liees = ids.length ? await DemandeLogistique.find({
      statut: { $nin: STATUTS_DEMANDE_INACTIFS },
      $or: [{ "liens.booking": { $in: ids } }, { "liens.transaction": { $in: ids } }],
    }).select("_id reference statut liens").lean() : [];
    const parId = new Map();
    for (const d of liees) {
      const cle = String(d.liens?.booking || d.liens?.transaction);
      parId.set(cle, [...(parId.get(cle) || []), { _id: d._id, reference: d.reference, statut: d.statut }]);
    }
    res.json({ commandes: commandes.map((c) => ({ ...c, dossiersLogistiques: parId.get(c.id) || [] })) });
  } catch (err) { echec(res, "commandesRattachables")(err); }
};

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════════════════════════════
export const creerDemande = async (req, res) => {
  try {
    const saisie = lireDemandeSaisie(req.body);
    const brouillon = req.body.brouillon === true;
    // Contact par défaut : celui du compte, modifiable.
    saisie.contact = {
      nom: saisie.contact.nom || `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim(),
      telephone: saisie.contact.telephone || req.user.phone || "",
      email: saisie.contact.email || req.user.email || "",
    };
    const manque = await champsManquants(saisie);
    if (!brouillon && manque.length) {
      return res.status(400).json({ message: "Informations manquantes pour traiter la demande.", code: "CHAMPS_MANQUANTS", champs: manque });
    }
    if (!saisie.typeBesoin || !saisie.depart.pays || !saisie.arrivee.pays || !saisie.depart.ville || !saisie.arrivee.ville) {
      return res.status(400).json({ message: "Type de besoin, départ et arrivée requis, même pour un brouillon.", code: "CHAMPS_MANQUANTS", champs: manque });
    }

    // Requête rejouée (double clic, réseau instable) : même clé, même dossier.
    const cleIdempotence = txt(req.body.cleIdempotence, 80) || null;
    if (cleIdempotence) {
      const deja = await DemandeLogistique.findOne({ client: req.user._id, cleIdempotence });
      if (deja) return res.status(200).json({ demande: vueClient(deja, req.user._id), rejouee: true });
    }

    // Rattachement facultatif : vérifié côté serveur, jamais cru sur parole.
    // Plusieurs dossiers par commande sont permis (expéditions partielles).
    const liens = { booking: null, transaction: null };
    let parties = { acheteur: null, vendeur: null };
    let roleDemandeur = "independant";
    let incotermCommande = copieIncoterm(null);
    if (req.body.lien) {
      const v = await verifierLien(req.user._id, req.body.lien);
      if (v.erreur) return res.status(v.erreur[0]).json({ message: v.erreur[1], code: "LIEN_INVALIDE" });
      liens[req.body.lien.type] = req.body.lien.id;
      ({ parties } = v);
      roleDemandeur = v.role;
      incotermCommande = copieIncoterm(v.conditions);
    }

    const demande = new DemandeLogistique({
      ...saisie,
      liens, parties, roleDemandeur, incotermCommande, cleIdempotence,
      donneurOrdre: DONNEURS_ORDRE.includes(req.body.donneurOrdre) ? req.body.donneurOrdre : "a_confirmer",
      payeur: PAYEURS.includes(req.body.payeur) ? req.body.payeur : "a_confirmer",
      precisionRoles: txt(req.body.precisionRoles, 300),
      reference: await genererReference(),
      client: req.user._id,
      statut: brouillon ? "brouillon" : "recue",
      evenements: [{ type: "creation", statut: brouillon ? "brouillon" : "recue", par: req.user._id, role: "client" }],
    });
    if (!brouillon) demande.jalons.recueLe = new Date();
    try {
      await demande.save();
    } catch (e) {
      // Deux envois simultanés de la même clé : le second retrouve le premier.
      if (e?.code === 11000 && cleIdempotence) {
        const deja = await DemandeLogistique.findOne({ client: req.user._id, cleIdempotence });
        if (deja) return res.status(200).json({ demande: vueClient(deja, req.user._id), rejouee: true });
      }
      throw e;
    }
    const autrePartie = roleDemandeur === "acheteur" ? parties.vendeur : roleDemandeur === "vendeur" ? parties.acheteur : null;
    if (!brouillon && autrePartie) {
      notifier(autrePartie, "Transport organisé pour votre commande", `${demande.reference} — ${demande.depart.ville} → ${demande.arrivee.ville}`,
        roleDemandeur === "acheteur" ? `/logistique/vendeur/${demande._id}` : `/logistique/demandes/${demande._id}`);
    }

    if (!brouillon) {
      notifier(req.user._id, "Demande de transport reçue", `${demande.reference} — ${demande.depart.ville} → ${demande.arrivee.ville}. VIT AUTO l'examine et consultera des prestataires adaptés.`, `/logistique/demandes/${demande._id}`);
      notifyAdmins("logistique", "Nouvelle demande logistique",
        `${demande.reference} — ${demande.depart.ville} (${demande.depart.pays}) → ${demande.arrivee.ville} (${demande.arrivee.pays})`,
        "/admin?tab=logistique").catch(() => {});
    }
    res.status(201).json({ demande: vueClient(demande, req.user._id) });
  } catch (err) { echec(res, "creerDemande")(err); }
};

export const mesDemandes = async (req, res) => {
  try {
    // Dossiers créés par l'utilisateur, ET ceux d'une commande dont il est
    // l'acheteur (même si le vendeur a organisé le transport).
    const demandes = await DemandeLogistique.find({ $or: [{ client: req.user._id }, { "parties.acheteur": req.user._id }] }).sort({ createdAt: -1 }).limit(100);
    res.json({ demandes: demandes.map((d) => vueClient(d, req.user._id)) });
  } catch (err) { echec(res, "mesDemandes")(err); }
};

const chargerPourClient = async (req, res, { demandeurSeul = false } = {}) => {
  const demande = await charger(req.params.id, res);
  if (!demande) return null;
  const estDemandeur = idEgal(demande.client, req.user._id);
  const estAcheteur = idEgal(demande.parties?.acheteur, req.user._id);
  if (!estDemandeur && !estAcheteur) { res.status(404).json({ message: "Demande introuvable." }); return null; }
  if (demandeurSeul && !estDemandeur) { res.status(403).json({ message: "Seul le demandeur du transport peut effectuer cette action." }); return null; }
  return demande;
};

export const lireDemandeClient = async (req, res) => {
  try {
    const demande = await chargerPourClient(req, res);
    if (!demande) return;
    marquerDevisExpires(demande);
    if (demande.isModified()) await demande.save();
    await demande.populate([
      { path: "devis.prestataire", select: "raisonSociale types pays" },
      { path: "liens.booking", select: "reference" },
    ]);
    res.json({ demande: vueClient(demande, req.user._id) });
  } catch (err) { echec(res, "lireDemandeClient")(err); }
};

// Compléter un brouillon ou répondre à « informations requises ».
export const completerDemande = async (req, res) => {
  try {
    const demande = await chargerPourClient(req, res, { demandeurSeul: true });
    if (!demande) return;
    if (!["brouillon", "infos_requises"].includes(demande.statut)) {
      return res.status(409).json({ message: "La demande n'est plus modifiable.", code: "STATUT" });
    }
    const saisie = lireDemandeSaisie({ ...demande.toObject(), ...req.body, contact: { ...demande.contact?.toObject?.(), ...(req.body.contact || {}) } });
    const manque = await champsManquants(saisie);
    Object.assign(demande, saisie);
    const soumettre = req.body.soumettre === true || demande.statut === "infos_requises";
    if (soumettre) {
      if (manque.length) return res.status(400).json({ message: "Informations manquantes.", code: "CHAMPS_MANQUANTS", champs: manque });
      changerStatut(demande, "recue", { par: req.user._id, role: "client", note: txt(req.body.note, 1000) });
      notifyAdmins("logistique", "Demande logistique complétée", `${demande.reference} est prête à être qualifiée.`, "/admin?tab=logistique").catch(() => {});
    }
    await demande.save();
    res.json({ demande: vueClient(demande, req.user._id) });
  } catch (err) { echec(res, "completerDemande")(err); }
};

export const accepterDevis = async (req, res) => {
  try {
    const demande = await chargerPourClient(req, res, { demandeurSeul: true });
    if (!demande) return;
    if (demande.statut !== "devis_recus") return res.status(409).json({ message: "Aucun devis ne peut être accepté à ce stade.", code: "STATUT" });
    marquerDevisExpires(demande);
    const devis = demande.devis.id(req.params.devisId);
    if (!devis) return res.status(404).json({ message: "Devis introuvable." });
    if (devis.statut === "expire") { await demande.save(); return res.status(409).json({ message: "Ce devis a expiré.", code: "DEVIS_EXPIRE" }); }
    if (devis.statut !== "propose") return res.status(409).json({ message: "Ce devis n'est plus disponible.", code: "DEVIS_INDISPONIBLE" });

    devis.statut = "accepte";
    for (const autre of demande.devis) {
      if (!idEgal(autre._id, devis._id) && autre.statut === "propose") autre.statut = "non_retenu";
    }
    // Acceptation tracée : devis exact, version, auteur, partie contractante et
    // payeur DÉCLARÉS. Ce n'est pas une preuve de paiement.
    demande.devisAccepte = {
      devisId: devis._id, prestataire: devis.prestataire, copie: devis.toObject(), version: devis.version,
      accepteLe: new Date(), acceptePar: req.user._id,
      partieContractante: demande.donneurOrdre, payeur: demande.payeur,
    };
    changerStatut(demande, "devis_accepte", { par: req.user._id, role: "client", note: "Devis accepté par le client." });
    await demande.save();

    const prest = await Prestataire.findById(devis.prestataire).select("user").lean();
    notifier(prest?.user, "Votre devis a été accepté", `${demande.reference} : confirmez la commande depuis votre espace.`, `/transit/logistique/${demande._id}`);
    notifyAdmins("logistique", "Devis logistique accepté", `${demande.reference}`, "/admin?tab=logistique").catch(() => {});
    res.json({ demande: vueClient(demande, req.user._id) });
  } catch (err) { echec(res, "accepterDevis")(err); }
};

export const refuserDevis = async (req, res) => {
  try {
    const demande = await chargerPourClient(req, res, { demandeurSeul: true });
    if (!demande) return;
    const devis = demande.devis.id(req.params.devisId);
    if (!devis) return res.status(404).json({ message: "Devis introuvable." });
    if (devis.statut !== "propose") return res.status(409).json({ message: "Ce devis n'est plus disponible.", code: "DEVIS_INDISPONIBLE" });
    devis.statut = "refuse";
    demande.evenements.push({ type: "devis_refuse", note: txt(req.body?.motif, 500), par: req.user._id, role: "client", visibleClient: true });
    await demande.save();
    res.json({ demande: vueClient(demande, req.user._id) });
  } catch (err) { echec(res, "refuserDevis")(err); }
};

export const annulerDemande = async (req, res) => {
  try {
    const demande = await chargerPourClient(req, res, { demandeurSeul: true });
    if (!demande) return;
    if (!ANNULABLE_PAR_CLIENT.includes(demande.statut)) {
      return res.status(409).json({ message: "Le transport a commencé : signalez plutôt un problème.", code: "STATUT" });
    }
    demande.motifAnnulation = txt(req.body?.motif, 500);
    changerStatut(demande, "annulee", { par: req.user._id, role: "client", note: demande.motifAnnulation });
    await demande.save();
    if (demande.devisAccepte?.prestataire) {
      const prest = await Prestataire.findById(demande.devisAccepte.prestataire).select("user").lean();
      notifier(prest?.user, "Demande annulée par le client", `${demande.reference}`, `/transit/logistique/${demande._id}`);
    }
    res.json({ demande: vueClient(demande, req.user._id) });
  } catch (err) { echec(res, "annulerDemande")(err); }
};

// Réception confirmée par le client = opération conclue.
export const confirmerLivraison = async (req, res) => {
  try {
    const demande = await chargerPourClient(req, res);
    if (!demande) return;
    if (demande.statut !== "livraison_declaree") {
      return res.status(409).json({ message: "La livraison n'a pas encore été déclarée par le prestataire.", code: "STATUT" });
    }
    changerStatut(demande, "cloturee", { par: req.user._id, role: "client", note: txt(req.body?.note, 500) || "Réception confirmée par le client." });
    await demande.save();
    const prest = await Prestataire.findById(demande.devisAccepte.prestataire).select("user").lean();
    notifier(prest?.user, "Réception confirmée", `${demande.reference} est clôturée.`, `/transit/logistique/${demande._id}`);
    res.json({ demande: vueClient(demande, req.user._id) });
  } catch (err) { echec(res, "confirmerLivraison")(err); }
};

export const ouvrirLitige = async (req, res) => {
  try {
    const demande = await chargerPourClient(req, res);
    if (!demande) return;
    if (!LITIGE_OUVRABLE.includes(demande.statut)) return res.status(409).json({ message: "Aucune prestation engagée sur cette demande.", code: "STATUT" });
    const motif = txt(req.body?.motif, 1000);
    if (!motif) return res.status(400).json({ message: "Décrivez le problème rencontré." });
    demande.litige = { motif, resolution: "", resoluLe: null };
    changerStatut(demande, "litige", { par: req.user._id, role: "client", note: motif });
    await demande.save();
    notifyAdmins("logistique", "Litige logistique", `${demande.reference} : ${motif.slice(0, 120)}`, "/admin?tab=logistique").catch(() => {});
    res.json({ demande: vueClient(demande, req.user._id) });
  } catch (err) { echec(res, "ouvrirLitige")(err); }
};

// ═══════════════════════════════════════════════════════════════════════════
// PRESTATAIRE
// ═══════════════════════════════════════════════════════════════════════════
async function prestataireCourant(req, res) {
  const prest = await Prestataire.findOne({ user: req.user._id }).lean();
  if (!prest || prest.statut !== "actif") { res.status(403).json({ message: "Compte prestataire inactif." }); return null; }
  return prest;
}

async function chargerPourPrestataire(req, res) {
  const prest = await prestataireCourant(req, res);
  if (!prest) return {};
  const demande = await charger(req.params.id, res);
  if (!demande) return {};
  // Seul un prestataire SOLLICITÉ voit la demande — jamais toutes les demandes.
  if (!demande.sollicitations.some((s) => idEgal(s.prestataire, prest._id))) {
    res.status(404).json({ message: "Demande introuvable." });
    return {};
  }
  return { prest, demande };
}

export const demandesPrestataire = async (req, res) => {
  try {
    const prest = await prestataireCourant(req, res);
    if (!prest) return;
    const demandes = await DemandeLogistique.find({ "sollicitations.prestataire": prest._id }).sort({ updatedAt: -1 }).limit(200);
    res.json({ demandes: demandes.map((d) => vuePrestataire(d, prest._id)) });
  } catch (err) { echec(res, "demandesPrestataire")(err); }
};

export const lireDemandePrestataire = async (req, res) => {
  try {
    const { prest, demande } = await chargerPourPrestataire(req, res);
    if (!demande) return;
    res.json({ demande: vuePrestataire(demande, prest._id) });
  } catch (err) { echec(res, "lireDemandePrestataire")(err); }
};

export const repondreSollicitation = async (req, res) => {
  try {
    const { prest, demande } = await chargerPourPrestataire(req, res);
    if (!demande) return;
    if (STATUTS_TERMINAUX.includes(demande.statut)) return res.status(409).json({ message: "Demande clôturée.", code: "STATUT" });
    const reponse = ["interesse", "decline", "precisions_demandees"].includes(req.body?.reponse) ? req.body.reponse : null;
    if (!reponse) return res.status(400).json({ message: "Réponse attendue : interesse, decline ou precisions_demandees." });
    const s = demande.sollicitations.find((x) => idEgal(x.prestataire, prest._id));
    s.reponse = reponse;
    s.message = txt(req.body?.message, 1000);
    s.repondueLe = new Date();
    if (!demande.jalons.premiereReponseLe) demande.jalons.premiereReponseLe = s.repondueLe;
    demande.evenements.push({ type: `reponse_${reponse}`, note: s.message, par: req.user._id, role: "prestataire", visibleClient: false });
    await demande.save();
    if (reponse === "precisions_demandees") {
      notifyAdmins("logistique", "Précisions demandées par un prestataire", `${demande.reference} — ${prest.raisonSociale} : ${s.message.slice(0, 120)}`, "/admin?tab=logistique").catch(() => {});
    }
    res.json({ demande: vuePrestataire(demande, prest._id) });
  } catch (err) { echec(res, "repondreSollicitation")(err); }
};

function lireDevisSaisie(body = {}) {
  const montant = num(body.montant);
  const devise = txt(body.devise, 3).toUpperCase();
  const valide = body.valideJusquau && !Number.isNaN(Date.parse(body.valideJusquau)) ? new Date(body.valideJusquau) : null;
  const erreurs = [];
  if (montant == null || montant < 0) erreurs.push("montant");
  if (!/^[A-Z]{3}$/.test(devise)) erreurs.push("devise");
  if (!valide || valide < new Date()) erreurs.push("valideJusquau");
  const min = num(body.delaiJoursMin);
  const max = num(body.delaiJoursMax);
  if (min != null && max != null && max < min) erreurs.push("delaiJours");
  // Postes facultatifs. Si des postes INCLUS sont chiffrés, leur somme doit
  // égaler le montant : un frais n'est jamais compté deux fois, et un poste
  // non inclus n'est jamais ajouté en douce au total.
  const postes = (Array.isArray(body.postes) ? body.postes : []).slice(0, 12)
    .filter((p) => POSTES_COUT.includes(p?.categorie))
    .map((p) => ({ categorie: p.categorie, montant: num(p.montant), inclus: p.inclus !== false, note: txt(p.note, 300) }));
  if (postes.some((p) => p.montant != null && p.montant < 0)) erreurs.push("postes");
  const inclusChiffres = postes.filter((p) => p.inclus && p.montant != null);
  if (montant != null && inclusChiffres.length && inclusChiffres.length === postes.filter((p) => p.inclus).length) {
    const somme = Math.round(inclusChiffres.reduce((t, p) => t + p.montant, 0) * 100) / 100;
    if (Math.abs(somme - montant) > 0.01) erreurs.push("postes_total");
  }
  if (new Set(postes.map((p) => p.categorie)).size !== postes.length) erreurs.push("postes_doublon");
  return {
    erreurs,
    valeurs: {
      montant, devise, valideJusquau: valide, delaiJoursMin: min, delaiJoursMax: max,
      postes,
      nature: NATURES_DEVIS.includes(body.nature) ? body.nature : "estimatif",
      trajet: txt(body.trajet, 300),
      modeTransport: MODES_TRANSPORT.includes(body.modeTransport) && body.modeTransport !== "indifferent" ? body.modeTransport : null,
      inclus: txt(body.inclus, 2000), exclus: txt(body.exclus, 2000),
      fraisAdditionnels: txt(body.fraisAdditionnels, 1000), modalitesPaiement: txt(body.modalitesPaiement, 1000),
      conditionsAnnulation: txt(body.conditionsAnnulation, 1000),
    },
  };
}

// Proposer — ou actualiser — un devis. Une actualisation crée une NOUVELLE
// version ; la précédente reste dans l'historique, marquée « remplacée ».
export const soumettreDevis = async (req, res) => {
  try {
    const { prest, demande } = await chargerPourPrestataire(req, res);
    if (!demande) return;
    if (!DEVIS_OUVERTS.includes(demande.statut)) return res.status(409).json({ message: "Cette demande n'accepte plus de devis.", code: "STATUT" });
    const { erreurs, valeurs } = lireDevisSaisie(req.body);
    if (erreurs.length) {
      return res.status(400).json({
        message: erreurs.includes("postes_total") ? "La somme des postes inclus doit égaler le montant du devis." : "Devis incomplet.",
        code: "DEVIS_INVALIDE", champs: erreurs,
      });
    }

    const precedent = [...demande.devis].reverse().find((d) => idEgal(d.prestataire, prest._id) && d.statut === "propose");
    if (precedent) { precedent.statut = "remplace"; precedent.modifieLe = new Date(); }
    const versions = demande.devis.filter((d) => idEgal(d.prestataire, prest._id)).length;
    demande.devis.push({ ...valeurs, prestataire: prest._id, version: versions + 1, remplace: precedent?._id || null });

    const s = demande.sollicitations.find((x) => idEgal(x.prestataire, prest._id));
    if (s.reponse === "en_attente") { s.reponse = "interesse"; s.repondueLe = new Date(); }
    if (!demande.jalons.premiereReponseLe) demande.jalons.premiereReponseLe = new Date();
    if (demande.statut !== "devis_recus") {
      changerStatut(demande, "devis_recus", { par: req.user._id, role: "prestataire", note: "Premier devis reçu." });
    }
    demande.evenements.push({ type: precedent ? "devis_actualise" : "devis_propose", par: req.user._id, role: "prestataire", visibleClient: true,
      note: `${prest.raisonSociale} — ${valeurs.montant} ${valeurs.devise}` });
    await demande.save();

    notifier(demande.client, precedent ? "Un devis a été actualisé" : "Nouveau devis logistique",
      `${demande.reference} : ${prest.raisonSociale} propose ${valeurs.montant} ${valeurs.devise}.`, `/logistique/demandes/${demande._id}`);
    res.status(201).json({ demande: vuePrestataire(demande, prest._id) });
  } catch (err) { echec(res, "soumettreDevis")(err); }
};

export const retirerDevis = async (req, res) => {
  try {
    const { prest, demande } = await chargerPourPrestataire(req, res);
    if (!demande) return;
    const devis = demande.devis.id(req.params.devisId);
    if (!devis || !idEgal(devis.prestataire, prest._id)) return res.status(404).json({ message: "Devis introuvable." });
    if (devis.statut !== "propose") return res.status(409).json({ message: "Ce devis ne peut plus être retiré.", code: "DEVIS_INDISPONIBLE" });
    devis.statut = "retire";
    devis.modifieLe = new Date();
    demande.evenements.push({ type: "devis_retire", par: req.user._id, role: "prestataire", visibleClient: false });
    await demande.save();
    res.json({ demande: vuePrestataire(demande, prest._id) });
  } catch (err) { echec(res, "retirerDevis")(err); }
};

// Étapes d'exécution — seul le prestataire RETENU, et seulement dans l'ordre.
export const avancerEtape = async (req, res) => {
  try {
    const { prest, demande } = await chargerPourPrestataire(req, res);
    if (!demande) return;
    if (!idEgal(demande.devisAccepte?.prestataire, prest._id)) return res.status(403).json({ message: "Seul le prestataire retenu fait avancer l'opération." });
    const suivant = ETAPES_PRESTATAIRE[demande.statut];
    if (!suivant || req.body?.statut !== suivant) {
      return res.status(409).json({ message: `Étape suivante attendue : ${suivant ? LIBELLES_STATUT[suivant] : "aucune"}.`, code: "TRANSITION", attendu: suivant || null });
    }
    changerStatut(demande, suivant, { par: req.user._id, role: "prestataire", note: txt(req.body?.note, 1000), reference: req.body?.referenceSuivi });
    await demande.save();
    notifier(demande.client, `Votre transport : ${LIBELLES_STATUT[suivant]}`, `${demande.reference}`, `/logistique/demandes/${demande._id}`);
    res.json({ demande: vuePrestataire(demande, prest._id) });
  } catch (err) { echec(res, "avancerEtape")(err); }
};

export const deposerPreuveLivraison = async (req, res) => {
  try {
    const { prest, demande } = await chargerPourPrestataire(req, res);
    if (!demande) return;
    if (!idEgal(demande.devisAccepte?.prestataire, prest._id)) return res.status(403).json({ message: "Seul le prestataire retenu dépose la preuve de livraison." });
    if (!["en_transport", "livraison_declaree", "litige"].includes(demande.statut)) return res.status(409).json({ message: "La preuve de livraison suit le transport.", code: "STATUT" });
    const { fichier } = req.body || {};
    if (!fichier) return res.status(400).json({ message: "Joignez la preuve de livraison (photo ou PDF)." });
    const verif = validateDocumentDataUri(fichier, MAX_DOC_BYTES);
    if (!verif.ok) return res.status(400).json({ message: verif.message || "Document invalide." });
    const url = await deposerPiece(fichier, FOLDERS.docs, `logistique-${demande.reference}-preuve`);
    demande.preuveLivraison = { url, note: txt(req.body?.note, 500), deposeLe: new Date() };
    demande.evenements.push({ type: "preuve_livraison", par: req.user._id, role: "prestataire", visibleClient: true, note: "Preuve de livraison déposée." });
    await demande.save();
    res.json({ demande: vuePrestataire(demande, prest._id) });
  } catch (err) { echec(res, "deposerPreuveLivraison")(err); }
};

// ═══════════════════════════════════════════════════════════════════════════
// RÔLES DÉCLARÉS — donneur d'ordre et payeur
// ═══════════════════════════════════════════════════════════════════════════
// Déclarés par le demandeur, jamais déduits de l'Incoterm. Figés à
// l'acceptation d'un devis (devisAccepte.partieContractante / payeur).
const ROLES_MODIFIABLES = ["brouillon", "recue", "infos_requises", "validee", "recherche_prestataires", "devis_recus"];
export const definirRoles = async (req, res) => {
  try {
    const demande = await chargerPourClient(req, res, { demandeurSeul: true });
    if (!demande) return;
    if (!ROLES_MODIFIABLES.includes(demande.statut)) return res.status(409).json({ message: "Un devis a été accepté : les rôles sont figés.", code: "STATUT" });
    const { donneurOrdre, payeur } = req.body || {};
    if (donneurOrdre !== undefined && !DONNEURS_ORDRE.includes(donneurOrdre)) return res.status(400).json({ message: "Donneur d'ordre invalide." });
    if (payeur !== undefined && !PAYEURS.includes(payeur)) return res.status(400).json({ message: "Payeur invalide." });
    if (donneurOrdre !== undefined) demande.donneurOrdre = donneurOrdre;
    if (payeur !== undefined) demande.payeur = payeur;
    if (req.body?.precisionRoles !== undefined) demande.precisionRoles = txt(req.body.precisionRoles, 300);
    demande.evenements.push({ type: "roles", note: `Donneur d'ordre : ${demande.donneurOrdre} · payeur : ${demande.payeur}`, par: req.user._id, role: "client", visibleClient: true });
    await demande.save();
    res.json({ demande: vueClient(demande, req.user._id) });
  } catch (err) { echec(res, "definirRoles")(err); }
};

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTS DU DOSSIER
// ═══════════════════════════════════════════════════════════════════════════
// Chaque rôle dépose les documents qui relèvent de lui (DOCUMENTS_PAR_ROLE).
// Lecture : demandeur, acheteur, vendeur, prestataire RETENU, admin — jamais
// un prestataire simplement sollicité. Aucun document n'est « vérifié ».
const MAX_DOCUMENTS = 30;
async function ajouterDocument(demande, role, req, res) {
  const { type, fichier, nom, note } = req.body || {};
  if (!DOCUMENTS_PAR_ROLE[role]?.includes(type)) {
    res.status(403).json({ message: "Ce type de document ne relève pas de votre rôle.", code: "TYPE_DOCUMENT", autorises: DOCUMENTS_PAR_ROLE[role] || [] });
    return false;
  }
  if (demande.statut === "annulee") { res.status(409).json({ message: "Dossier annulé.", code: "STATUT" }); return false; }
  if ((demande.documents || []).length >= MAX_DOCUMENTS) { res.status(409).json({ message: "Nombre maximal de documents atteint.", code: "LIMITE" }); return false; }
  if (!fichier) { res.status(400).json({ message: "Joignez le document (image ou PDF)." }); return false; }
  const verif = validateDocumentDataUri(fichier, MAX_DOC_BYTES);
  if (!verif.ok) { res.status(400).json({ message: verif.message || "Document invalide." }); return false; }
  const url = await deposerPiece(fichier, FOLDERS.docs, `logistique-${demande.reference}-${type}`);
  // ImageKit configuré mais dépôt échoué : deposerPiece renvoie le data URI.
  // Trente fichiers de 8 Mo dans un même document dépasseraient la limite de
  // 16 Mo de MongoDB — on refuse plutôt que de rendre le dossier illisible.
  if (isImageKitConfigured() && String(url).startsWith("data:")) {
    res.status(503).json({ message: "Le dépôt du document a échoué, réessayez dans un instant.", code: "DEPOT_INDISPONIBLE" });
    return false;
  }
  demande.documents.push({ type, url, nom: txt(nom, 160), note: txt(note, 300), role, deposePar: req.user._id });
  demande.evenements.push({ type: "document", note: `${type} déposé (${role})`, par: req.user._id, role: role === "prestataire" ? "prestataire" : "client", visibleClient: true });
  await demande.save();
  return true;
}

export const deposerDocumentClient = async (req, res) => {
  try {
    const demande = await chargerPourClient(req, res);
    if (!demande) return;
    // Le demandeur vendeur dépose comme vendeur ; sinon comme acheteur.
    const role = demande.roleDemandeur === "vendeur" && idEgal(demande.client, req.user._id) ? "vendeur" : "acheteur";
    if (await ajouterDocument(demande, role, req, res)) res.status(201).json({ demande: vueClient(demande, req.user._id) });
  } catch (err) { echec(res, "deposerDocumentClient")(err); }
};

export const deposerDocumentPrestataire = async (req, res) => {
  try {
    const { prest, demande } = await chargerPourPrestataire(req, res);
    if (!demande) return;
    if (!idEgal(demande.devisAccepte?.prestataire, prest._id)) return res.status(403).json({ message: "Seul le prestataire retenu dépose des documents." });
    if (await ajouterDocument(demande, "prestataire", req, res)) res.status(201).json({ demande: vuePrestataire(demande, prest._id) });
  } catch (err) { echec(res, "deposerDocumentPrestataire")(err); }
};

// ═══════════════════════════════════════════════════════════════════════════
// VENDEUR / EXPORTATEUR de la commande liée
// ═══════════════════════════════════════════════════════════════════════════
// Il confirme ce qui relève de lui (disponibilité, enlèvement, chargement,
// documents) — il n'est pas pour autant le donneur d'ordre ni le payeur.
async function chargerPourVendeur(req, res) {
  const demande = await charger(req.params.id, res);
  if (!demande) return null;
  if (!idEgal(demande.parties?.vendeur, req.user._id)) { res.status(404).json({ message: "Demande introuvable." }); return null; }
  return demande;
}

export const demandesVendeur = async (req, res) => {
  try {
    const demandes = await DemandeLogistique.find({ "parties.vendeur": req.user._id, statut: { $ne: "brouillon" } })
      .sort({ updatedAt: -1 }).limit(200).populate("devisAccepte.prestataire", "raisonSociale");
    res.json({ demandes: demandes.map(vueVendeur) });
  } catch (err) { echec(res, "demandesVendeur")(err); }
};

export const lireDemandeVendeur = async (req, res) => {
  try {
    const demande = await chargerPourVendeur(req, res);
    if (!demande) return;
    await demande.populate("devisAccepte.prestataire", "raisonSociale");
    res.json({ demande: vueVendeur(demande) });
  } catch (err) { echec(res, "lireDemandeVendeur")(err); }
};

export const confirmerEnlevement = async (req, res) => {
  try {
    const demande = await chargerPourVendeur(req, res);
    if (!demande) return;
    if (STATUTS_TERMINAUX.includes(demande.statut) || ["en_transport", "livraison_declaree", "litige"].includes(demande.statut)) {
      return res.status(409).json({ message: "L'enlèvement n'est plus modifiable à ce stade.", code: "STATUT" });
    }
    const b = req.body || {};
    const date = b.dateDisponibilite && !Number.isNaN(Date.parse(b.dateDisponibilite)) ? new Date(b.dateDisponibilite) : null;
    demande.enlevement = {
      disponible: typeof b.disponible === "boolean" ? b.disponible : null,
      dateDisponibilite: date,
      lieu: txt(b.lieu, 300),
      poidsKg: num(b.poidsKg) != null && num(b.poidsKg) >= 0 ? num(b.poidsKg) : null,
      volumeM3: num(b.volumeM3) != null && num(b.volumeM3) >= 0 ? num(b.volumeM3) : null,
      chargement: txt(b.chargement, 500),
      contraintesManutention: txt(b.contraintesManutention, 500),
      documentsPrevus: txt(b.documentsPrevus, 500),
      confirmeLe: new Date(),
      par: req.user._id,
    };
    if (demande.enlevement.disponible === null || !demande.enlevement.lieu) {
      return res.status(400).json({ message: "Indiquez si la marchandise est disponible et le lieu d'enlèvement.", code: "ENLEVEMENT_INCOMPLET" });
    }
    demande.evenements.push({ type: "enlevement_confirme", note: `Enlèvement : ${demande.enlevement.lieu}${demande.enlevement.disponible ? "" : " (marchandise pas encore disponible)"}`, par: req.user._id, role: "client", visibleClient: true });
    await demande.save();
    notifier(demande.client, "Informations d'enlèvement confirmées", `${demande.reference} — ${demande.enlevement.lieu}`, `/logistique/demandes/${demande._id}`);
    if (demande.devisAccepte?.prestataire) {
      const prest = await Prestataire.findById(demande.devisAccepte.prestataire).select("user").lean();
      notifier(prest?.user, "Enlèvement confirmé par l'exportateur", `${demande.reference} — ${demande.enlevement.lieu}`, `/transit/logistique/${demande._id}`);
    }
    await demande.populate("devisAccepte.prestataire", "raisonSociale");
    res.json({ demande: vueVendeur(demande) });
  } catch (err) { echec(res, "confirmerEnlevement")(err); }
};

export const deposerDocumentVendeur = async (req, res) => {
  try {
    const demande = await chargerPourVendeur(req, res);
    if (!demande) return;
    if (await ajouterDocument(demande, "vendeur", req, res)) {
      await demande.populate("devisAccepte.prestataire", "raisonSociale");
      res.status(201).json({ demande: vueVendeur(demande) });
    }
  } catch (err) { echec(res, "deposerDocumentVendeur")(err); }
};

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════════════════
const enRetard = (d, now = Date.now()) =>
  ["recherche_prestataires", "validee"].includes(d.statut)
  && (d.sollicitations || []).length > 0
  && (d.sollicitations || []).every((s) => s.reponse === "en_attente" && now - new Date(s.solliciteLe).getTime() > RETARD_SANS_REPONSE_MS);

export const listerDemandesAdmin = async (req, res) => {
  try {
    const { statut, depart, arrivee, typeBesoin, q, depuis, jusqua, retard } = req.query;
    const filtre = {};
    if (statut && STATUTS.includes(statut)) filtre.statut = statut;
    if (typeBesoin && TYPES_BESOIN.includes(typeBesoin)) filtre.typeBesoin = typeBesoin;
    if (depart && /^[A-Za-z]{2}$/.test(depart)) filtre["depart.pays"] = depart.toUpperCase();
    if (arrivee && /^[A-Za-z]{2}$/.test(arrivee)) filtre["arrivee.pays"] = arrivee.toUpperCase();
    const periode = {};
    if (depuis && !Number.isNaN(Date.parse(depuis))) periode.$gte = new Date(depuis);
    if (jusqua && !Number.isNaN(Date.parse(jusqua))) periode.$lte = new Date(jusqua);
    if (Object.keys(periode).length) filtre.createdAt = periode;
    if (q) {
      const motif = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 60), "i");
      filtre.$or = [{ reference: motif }, { "depart.ville": motif }, { "arrivee.ville": motif }, { "contact.nom": motif }];
    }
    let demandes = await DemandeLogistique.find(filtre).sort({ createdAt: -1 }).limit(500)
      .populate("client", "firstName lastName email").populate("sollicitations.prestataire", "raisonSociale").lean();
    demandes = demandes.map((d) => ({ ...d, enRetard: enRetard(d), libelleStatut: LIBELLES_STATUT[d.statut] }));
    if (retard === "1") demandes = demandes.filter((d) => d.enRetard);
    res.json({ demandes });
  } catch (err) { echec(res, "listerDemandesAdmin")(err); }
};

export const lireDemandeAdmin = async (req, res) => {
  try {
    const demande = await charger(req.params.id, res);
    if (!demande) return;
    await demande.populate([
      { path: "client", select: "firstName lastName email phone" },
      { path: "sollicitations.prestataire", select: "raisonSociale types pays telephone" },
      { path: "devis.prestataire", select: "raisonSociale" },
      { path: "liens.booking", select: "reference type status montantTotal" },
      { path: "liens.transaction", select: "status destCountry destCity" },
      { path: "parties.acheteur", select: "firstName lastName email" },
      { path: "parties.vendeur", select: "firstName lastName email" },
    ]);
    res.json({ demande: { ...demande.toObject(), libelleStatut: LIBELLES_STATUT[demande.statut], commandeLiee: commandeLiee(demande) } });
  } catch (err) { echec(res, "lireDemandeAdmin")(err); }
};

// Qualification : valider, demander des précisions, ou refuser (annuler).
export const qualifierDemande = async (req, res) => {
  try {
    const demande = await charger(req.params.id, res);
    if (!demande) return;
    const { decision, note } = req.body || {};
    const cible = { valider: "validee", infos: "infos_requises", refuser: "annulee" }[decision];
    if (!cible) return res.status(400).json({ message: "Décision attendue : valider, infos ou refuser." });
    if (!["recue", "infos_requises"].includes(demande.statut)) return res.status(409).json({ message: "Demande déjà qualifiée.", code: "STATUT" });
    if (cible === "infos_requises" && !txt(note, 1000)) return res.status(400).json({ message: "Précisez les informations attendues du client." });
    if (cible === "annulee") demande.motifAnnulation = txt(note, 500) || "Demande non retenue par VIT AUTO.";
    changerStatut(demande, cible, { par: req.user._id, role: "admin", note });
    await demande.save();
    await logAction(req, `logistique.qualifier.${decision}`, "DemandeLogistique", demande._id, { statut: cible });
    notifier(demande.client, `Votre demande logistique : ${LIBELLES_STATUT[cible]}`, `${demande.reference}${note ? ` — ${txt(note, 200)}` : ""}`, `/logistique/demandes/${demande._id}`);
    res.json({ demande });
  } catch (err) { echec(res, "qualifierDemande")(err); }
};

// Prestataires compatibles : types logistiques, actifs, couvrant le pays de
// départ OU d'arrivée. Un prestataire sans pays déclaré n'est pas proposé.
export const prestatairesCompatibles = async (req, res) => {
  try {
    const demande = await charger(req.params.id, res);
    if (!demande) return;
    const pays = [demande.depart.pays, demande.arrivee.pays];
    const prestataires = await Prestataire.find({
      statut: "actif", types: { $in: TYPES_PRESTATAIRE_LOGISTIQUE }, pays: { $in: pays },
    }).select("raisonSociale types pays").lean();
    const deja = new Set(demande.sollicitations.map((s) => String(s.prestataire)));
    res.json({ prestataires: prestataires.map((p) => ({ ...p, dejaSollicite: deja.has(String(p._id)), couvreLesDeux: pays.every((c) => p.pays.includes(c)) })) });
  } catch (err) { echec(res, "prestatairesCompatibles")(err); }
};

export const solliciterPrestataires = async (req, res) => {
  try {
    const demande = await charger(req.params.id, res);
    if (!demande) return;
    if (!["validee", "recherche_prestataires", "devis_recus"].includes(demande.statut)) {
      return res.status(409).json({ message: "Qualifiez la demande avant de solliciter des prestataires.", code: "STATUT" });
    }
    const ids = [...new Set((Array.isArray(req.body?.prestataires) ? req.body.prestataires : []).map(String))].filter((id) => mongoose.isValidObjectId(id));
    if (!ids.length) return res.status(400).json({ message: "Choisissez au moins un prestataire." });
    const prestataires = await Prestataire.find({ _id: { $in: ids }, statut: "actif", types: { $in: TYPES_PRESTATAIRE_LOGISTIQUE } }).select("user raisonSociale").lean();
    const deja = new Set(demande.sollicitations.map((s) => String(s.prestataire)));
    const nouveaux = prestataires.filter((p) => !deja.has(String(p._id)));
    if (!nouveaux.length) return res.status(409).json({ message: "Ces prestataires sont déjà sollicités ou ne sont pas habilités.", code: "AUCUN_NOUVEAU" });

    const now = new Date();
    for (const p of nouveaux) demande.sollicitations.push({ prestataire: p._id, solliciteLe: now, solliciteePar: req.user._id });
    if (!demande.jalons.premiereSollicitationLe) demande.jalons.premiereSollicitationLe = now;
    if (demande.statut === "validee") changerStatut(demande, "recherche_prestataires", { par: req.user._id, role: "admin" });
    demande.evenements.push({ type: "sollicitation", par: req.user._id, role: "admin", visibleClient: false, note: nouveaux.map((p) => p.raisonSociale).join(", ") });
    await demande.save();
    await logAction(req, "logistique.solliciter", "DemandeLogistique", demande._id, { prestataires: nouveaux.map((p) => String(p._id)) });

    for (const p of nouveaux) {
      notifier(p.user, "Nouvelle demande logistique", `${demande.reference} — ${demande.depart.ville} (${demande.depart.pays}) → ${demande.arrivee.ville} (${demande.arrivee.pays})`, `/transit/logistique/${demande._id}`);
    }
    res.json({ demande, sollicites: nouveaux.length });
  } catch (err) { echec(res, "solliciterPrestataires")(err); }
};

// Interventions admin limitées : résoudre un litige, clôturer sur
// justificatif, annuler. Jamais « livrée » ni « en transport » à la place du
// prestataire : l'admin ne fabrique pas d'événement de transport.
const INTERVENTIONS_ADMIN = {
  litige:             ["cloturee", "annulee", "en_transport", "livraison_declaree"],
  livraison_declaree: ["cloturee"],
};
export const interventionAdmin = async (req, res) => {
  try {
    const demande = await charger(req.params.id, res);
    if (!demande) return;
    const { statut, note } = req.body || {};
    const note1 = txt(note, 1000);
    if (!note1) return res.status(400).json({ message: "Une note justifiant l'intervention est obligatoire." });
    const permis = statut === "annulee" ? !STATUTS_TERMINAUX.includes(demande.statut) : (INTERVENTIONS_ADMIN[demande.statut] || []).includes(statut);
    if (!permis) return res.status(409).json({ message: "Transition non autorisée pour l'administration.", code: "TRANSITION" });
    if (demande.statut === "litige") {
      demande.litige.resolution = note1;
      demande.litige.resoluLe = new Date();
    }
    if (statut === "annulee") demande.motifAnnulation = note1;
    changerStatut(demande, statut, { par: req.user._id, role: "admin", note: note1 });
    await demande.save();
    await logAction(req, `logistique.intervention.${statut}`, "DemandeLogistique", demande._id, { note: note1 });
    notifier(demande.client, `Votre demande logistique : ${LIBELLES_STATUT[statut]}`, `${demande.reference}`, `/logistique/demandes/${demande._id}`);
    res.json({ demande });
  } catch (err) { echec(res, "interventionAdmin")(err); }
};

export const noterDemande = async (req, res) => {
  try {
    const demande = await charger(req.params.id, res);
    if (!demande) return;
    demande.noteAdmin = txt(req.body?.note, 1000);
    await demande.save();
    res.json({ demande });
  } catch (err) { echec(res, "noterDemande")(err); }
};

// ── Indicateurs ─────────────────────────────────────────────────────────────
// Calculés sur les seuls événements enregistrés. Un ratio sans dénominateur
// vaut null (« donnée indisponible »), jamais 0. La valeur d'une opération
// logistique n'est PAS un revenu de VIT AUTO : le revenu reste 0.
const moyenneHeures = (paires) => {
  const v = paires.filter(([a, b]) => a && b).map(([a, b]) => (new Date(b) - new Date(a)) / 3600000).filter((h) => h >= 0);
  return v.length ? Math.round((v.reduce((s, h) => s + h, 0) / v.length) * 10) / 10 : null;
};
const ratio = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const ajouterMontant = (acc, devise, montant) => {
  if (!devise || !Number.isFinite(montant)) return;
  acc[devise] = Math.round(((acc[devise] || 0) + montant) * 100) / 100;
};

export async function calculerIndicateurs({ depuis = null, jusqua = null } = {}) {
  const filtre = {};
  if (depuis || jusqua) filtre.createdAt = { ...(depuis ? { $gte: depuis } : {}), ...(jusqua ? { $lte: jusqua } : {}) };
  const demandes = await DemandeLogistique.find(filtre).populate("sollicitations.prestataire devis.prestataire", "raisonSociale").lean();
  const soumises = demandes.filter((d) => d.jalons?.recueLe);

  const sollicites = new Map();
  const zones = new Map();
  const types = {};
  const montants = { devis: {}, commandes: {}, conclues: {} };
  const motifsAnnulation = [];
  const motifsRefusPrestataires = [];

  for (const d of demandes) {
    types[d.typeBesoin] = (types[d.typeBesoin] || 0) + 1;
    const route = `${d.depart?.pays}→${d.arrivee?.pays}`;
    zones.set(route, (zones.get(route) || 0) + 1);
    if (d.motifAnnulation) motifsAnnulation.push(d.motifAnnulation);
    for (const s of d.sollicitations || []) {
      const id = String(s.prestataire?._id || s.prestataire);
      const p = sollicites.get(id) || { prestataire: s.prestataire?.raisonSociale || id, sollicitations: 0, reponses: 0, devis: 0, retenus: 0, conclues: 0, delais: [] };
      p.sollicitations += 1;
      if (s.reponse !== "en_attente") { p.reponses += 1; p.delais.push([s.solliciteLe, s.repondueLe]); }
      if (s.reponse === "decline" && s.message) motifsRefusPrestataires.push(s.message);
      sollicites.set(id, p);
    }
    for (const dv of d.devis || []) {
      const id = String(dv.prestataire?._id || dv.prestataire);
      if (dv.version === 1 && sollicites.has(id)) sollicites.get(id).devis += 1;
      if (!["remplace", "retire"].includes(dv.statut)) ajouterMontant(montants.devis, dv.devise, dv.montant);
    }
    const retenu = d.devisAccepte?.prestataire ? String(d.devisAccepte.prestataire) : null;
    if (retenu && sollicites.has(retenu)) {
      sollicites.get(retenu).retenus += 1;
      if (d.jalons?.clotureeLe) sollicites.get(retenu).conclues += 1;
    }
    const copie = d.devisAccepte?.copie;
    if (copie && d.jalons?.commandeConfirmeeLe) ajouterMontant(montants.commandes, copie.devise, copie.montant);
    if (copie && d.jalons?.clotureeLe) ajouterMontant(montants.conclues, copie.devise, copie.montant);
  }

  // Configuration RÉELLEMENT en vigueur (PricingConfig.logistique, verrouillée
  // sur FREE_REFERRAL) et revenu lu dans le registre des commissions — pas une
  // constante : si une écriture logistique y apparaissait, elle se verrait.
  const config = await getConfig();
  const cfgLog = config.logistique || {};
  const ecrituresLogistiques = await CommissionLedger.find({ transactionType: "logistique" }).select("commissionAmount").lean().catch(() => []);
  const revenuEncaisse = Math.round(ecrituresLogistiques.reduce((t, e) => t + (e.commissionAmount || 0), 0) * 100) / 100;

  const avecDevis = soumises.filter((d) => d.jalons?.premierDevisLe).length;
  const acceptes = soumises.filter((d) => d.jalons?.devisAccepteLe).length;
  const commandes = soumises.filter((d) => d.jalons?.commandeConfirmeeLe).length;
  const conclues = soumises.filter((d) => d.jalons?.clotureeLe).length;
  const valides = soumises.filter((d) => d.jalons?.valideeLe).length;
  const transmises = soumises.filter((d) => (d.sollicitations || []).length > 0).length;

  return {
    periode: { depuis, jusqua },
    modeleEconomique: MODELE_ECONOMIQUE,
    monetisation: {
      active: false,
      modeEconomique: cfgLog.modeEconomique || MODELE_ECONOMIQUE,
      commissionActive: cfgLog.commissionActive === true,
      taux: cfgLog.taux ?? null,
      fraisMiseEnRelationUSD: cfgLog.fraisMiseEnRelationUSD ?? null,
      source: "PricingConfig.logistique (verrouillée par validateurs)",
    },
    demandes: {
      creees: demandes.length,
      soumises: soumises.length,
      valides,
      qualifiees: valides,
      transmises,
      avecDevis,
      devisAcceptes: acceptes,
      commandesConfirmees: commandes,
      operationsConclues: conclues,
      annulations: demandes.filter((d) => d.jalons?.annuleeLe).length,
      litiges: demandes.filter((d) => d.jalons?.litigeOuvertLe).length,
    },
    prestataires: {
      sollicites: sollicites.size,
      ayantRepondu: [...sollicites.values()].filter((p) => p.reponses > 0).length,
      devisRecus: [...sollicites.values()].reduce((s, p) => s + p.devis, 0),
      performance: [...sollicites.values()].map(({ delais, ...p }) => ({ ...p, delaiMoyenReponseH: moyenneHeures(delais) }))
        .sort((a, b) => b.conclues - a.conclues || b.devis - a.devis),
    },
    delais: {
      premiereReponseH: moyenneHeures(soumises.map((d) => [d.jalons?.premiereSollicitationLe, d.jalons?.premiereReponseLe])),
      demandeAuPremierDevisH: moyenneHeures(soumises.map((d) => [d.jalons?.recueLe, d.jalons?.premierDevisLe])),
    },
    conversions: {
      demandeVersDevis: ratio(avecDevis, transmises),
      devisVersCommande: ratio(commandes, avecDevis),
      commandeVersConclue: ratio(conclues, commandes),
    },
    // Montants DÉCLARÉS entre les parties, par devise — jamais additionnés
    // entre devises, jamais un revenu de VIT AUTO.
    montantsDeclares: montants,
    // Valeur des transactions (montantsDeclares) ≠ revenu de VIT AUTO.
    revenusVitAuto: {
      montantUSD: revenuEncaisse,
      ecritures: ecrituresLogistiques.length,
      source: "CommissionLedger (transactionType « logistique »)",
      note: "Mise en relation gratuite (FREE_REFERRAL) : aucune rémunération logistique.",
    },
    // Mesurés pour une décision future ; aucun n'est actif.
    evenementsDeclencheursPotentiels: EVENEMENTS_DECLENCHEURS_POTENTIELS.map((e) => ({
      ...e, actif: false, nombre: soumises.filter((d) => d.jalons?.[e.jalon]).length,
    })),
    zones: [...zones.entries()].map(([route, n]) => ({ route, demandes: n })).sort((a, b) => b.demandes - a.demandes).slice(0, 15),
    types,
    motifs: { annulation: motifsAnnulation.slice(0, 50), refusPrestataires: motifsRefusPrestataires.slice(0, 50) },
  };
}

const lirePeriode = (q) => ({
  depuis: q.depuis && !Number.isNaN(Date.parse(q.depuis)) ? new Date(q.depuis) : null,
  jusqua: q.jusqua && !Number.isNaN(Date.parse(q.jusqua)) ? new Date(q.jusqua) : null,
});

export const indicateurs = async (req, res) => {
  try {
    res.json({ indicateurs: await calculerIndicateurs(lirePeriode(req.query)) });
  } catch (err) { echec(res, "indicateurs")(err); }
};

// Export CSV des indicateurs agrégés — aucune donnée personnelle.
export const exporterIndicateurs = async (req, res) => {
  try {
    const i = await calculerIndicateurs(lirePeriode(req.query));
    const val = (v) => (v == null ? "indisponible" : String(v));
    const lignes = [["indicateur", "valeur"],
      ...Object.entries(i.demandes).map(([k, v]) => [`demandes.${k}`, val(v)]),
      ["prestataires.sollicites", val(i.prestataires.sollicites)],
      ["prestataires.ayantRepondu", val(i.prestataires.ayantRepondu)],
      ["prestataires.devisRecus", val(i.prestataires.devisRecus)],
      ["delais.premiereReponseH", val(i.delais.premiereReponseH)],
      ["delais.demandeAuPremierDevisH", val(i.delais.demandeAuPremierDevisH)],
      ...Object.entries(i.conversions).map(([k, v]) => [`conversion.${k}.pourcent`, val(v)]),
      ...Object.entries(i.montantsDeclares).flatMap(([k, parDevise]) => Object.entries(parDevise).map(([dev, m]) => [`montantDeclare.${k}.${dev}`, String(m)])),
      ["revenusVitAuto.USD", String(i.revenusVitAuto.montantUSD)],
      ["monetisation.active", "non"],
      ["monetisation.modeEconomique", i.monetisation.modeEconomique],
      ...i.evenementsDeclencheursPotentiels.map((e) => [`evenementPotentiel.${e.code}.nombre (inactif)`, String(e.nombre)]),
    ];
    // csvRow neutralise les injections de formule (=, +, -, @) et échappe.
    const csv = lignes.map(csvRow).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="vit-auto-logistique-indicateurs.csv"');
    res.send(`﻿${csv}`);
  } catch (err) { echec(res, "exporterIndicateurs")(err); }
};
