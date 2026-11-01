import ConditionsLiberation, { CIRCUITS } from "../models/ConditionsLiberation.js";
import AcceptationConditions from "../models/AcceptationConditions.js";
import IETransaction from "../models/IETransaction.js";

// ═══════════════════════════════════════════════════════════════════════════
// CONDITIONS DE LIBÉRATION VERSIONNÉES (conception validée le 2026-10-31)
// ═══════════════════════════════════════════════════════════════════════════
// Une version est figée à sa création ; la modifier = proposer la version N+1,
// que les deux parties doivent accepter à nouveau. Montant, devise, parties et
// Incoterm viennent de la transaction en base, jamais du navigateur. En
// règlement direct, ces conditions encadrent livraison, conformité et
// réclamation : elles ne sécurisent ni ne bloquent aucun fonds.

export class ConditionsError extends Error {
  constructor(status, message, code = null) { super(message); this.status = status; this.code = code; }
}

// Statuts où des conditions peuvent être proposées : une offre finale existe et
// la transaction n'est ni annulée ni l'objet de l'ancien litige.
const STATUTS_PROPOSABLES = ["offer_sent", "offer_accepted", "payment_pending", "payment_submitted", "in_escrow", "preparing", "shipped", "in_transit", "delivered"];

export function partieDe(tx, user) {
  const id = String(user?._id || "");
  if (id && String(tx.client?._id || tx.client) === id) return "acheteur";
  if (id && String(tx.partner?._id || tx.partner) === id) return "vendeur";
  if (user?.role === "admin") return "admin";
  return null;
}

const texte = (v, max) => (v == null || v === "" ? null : String(v).trim().slice(0, max));
const jours = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 365) throw new ConditionsError(400, "Délai invalide (nombre entier de jours, 0 à 365).");
  return n;
};
const liste = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim().slice(0, 300)).filter(Boolean).slice(0, 30) : []);

export const referenceTransaction = (tx) => `VIT-IE-${String(tx._id).slice(-8).toUpperCase()}`;

export async function versionCourante(txId) {
  return ConditionsLiberation.findOne({ "transaction.type": "ie", "transaction.id": txId }).sort({ version: -1 });
}

/** Propose une nouvelle version (N+1). Seules les clauses rédactionnelles viennent de la requête. */
export async function proposerConditions(tx, user, champs = {}) {
  const partie = partieDe(tx, user);
  if (!partie) throw new ConditionsError(403, "Accès refusé.");
  return creerVersion(tx, { proposePar: user._id, origine: "partie", champs });
}

/**
 * Version 1 créée par la plateforme quand la transaction devient payable
 * (offre acceptée, achat direct) : montant, parties et Incoterm de la
 * transaction, clauses rédactionnelles vides — chaque partie peut proposer
 * une version 2. Sans effet si une version existe déjà. Renvoie la version créée.
 */
export async function creerConditionsInitiales(tx) {
  if (await versionCourante(tx._id)) return null;
  try {
    return await creerVersion(tx, { proposePar: null, origine: "plateforme", champs: {} });
  } catch (err) {
    if (err instanceof ConditionsError) return null;
    throw err;
  }
}

async function creerVersion(tx, { proposePar, origine, champs }) {
  if (!STATUTS_PROPOSABLES.includes(tx.status)) throw new ConditionsError(409, "Des conditions ne peuvent être proposées qu'après l'offre finale, sur une transaction en cours.");
  if (!(tx.finalOffer?.totalAmount > 0)) throw new ConditionsError(409, "Aucune offre finale chiffrée sur cette transaction.");
  const circuit = champs.circuit || "reglement_direct";
  if (!CIRCUITS.includes(circuit)) throw new ConditionsError(400, "Circuit inconnu.");
  // Le circuit séquestre n'existe pas encore : aucun prestataire validé.
  if (circuit !== "reglement_direct") throw new ConditionsError(409, "Le paiement sécurisé par séquestre n'est pas encore disponible.", "SEQUESTRE_INDISPONIBLE");

  const contenu = {
    parties:   { acheteur: tx.client?._id || tx.client, vendeur: tx.partner?._id || tx.partner },
    reference: referenceTransaction(tx),
    montant:   tx.finalOffer.totalAmount,
    devise:    tx.finalOffer.currency || tx.payment?.currency || "EUR",
    livraison: {
      incoterm:  tx.incoterm || null,
      lieuNomme: texte(champs.livraison?.lieuNomme, 300) ?? tx.conditionsIncoterm?.lieuNomme ?? null,
      modalites: texte(champs.livraison?.modalites, 2000),
    },
    conformite:              texte(champs.conformite, 4000),
    documentsRequis:         liste(champs.documentsRequis),
    evenementsLiberation:    liste(champs.evenementsLiberation),
    delaiValidationJours:    jours(champs.delaiValidationJours),
    delaiReclamationJours:   jours(champs.delaiReclamationJours),
    delaiReponseLitigeJours: jours(champs.delaiReponseLitigeJours),
    remboursement:           texte(champs.remboursement, 4000),
    liberationPartielle:     texte(champs.liberationPartielle, 2000),
    rolePrestataire:         null,
    roleVitAuto: "En règlement direct, VIT AUTO ne reçoit, ne conserve, ne bloque ni ne libère aucun fonds : elle enregistre les déclarations des parties, les documents et les réclamations.",
  };

  // Deux propositions simultanées : l'index unique (transaction, version) en
  // refuse une ; on réessaie avec le numéro suivant.
  for (let essai = 0; essai < 3; essai += 1) {
    const derniere = await versionCourante(tx._id);
    try {
      const creee = await ConditionsLiberation.create({
        transaction: { type: "ie", id: tx._id }, version: (derniere?.version || 0) + 1,
        circuit, contenu, proposePar, origine,
      });
      // Nouvelle version = nouvelles acceptations : un accord donné sur la
      // version précédente ne vaut plus pour déclarer un règlement.
      await IETransaction.updateOne({ _id: tx._id, "reglementDirect.etat": "terms_accepted" }, { $set: { "reglementDirect.etat": "none" } });
      return creee;
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
  throw new ConditionsError(409, "Une autre version vient d'être proposée : rechargez puis réessayez.");
}

/** Accepte la version EN VIGUEUR, identifiée par son numéro et son hash. */
export async function accepterConditions(tx, user, { version, hash } = {}) {
  const partie = partieDe(tx, user);
  if (partie !== "acheteur" && partie !== "vendeur") throw new ConditionsError(403, "Seuls l'acheteur et le vendeur acceptent les conditions.");
  const courante = await versionCourante(tx._id);
  if (!courante) throw new ConditionsError(404, "Aucune condition proposée sur cette transaction.");
  if (Number(version) !== courante.version) throw new ConditionsError(409, `La version en vigueur est la ${courante.version} : relisez-la avant d'accepter.`, "VERSION_PERIMEE");
  if (hash !== courante.hash) throw new ConditionsError(409, "Le contenu accepté ne correspond pas à la version en vigueur.", "HASH_DIFFERENT");
  if (!courante.estIntegre()) throw new ConditionsError(500, "Contenu des conditions altéré : acceptation impossible.", "CONTENU_ALTERE");
  // Contrôle explicite ; l'index unique (conditions, partie) reste le filet contre deux clics simultanés.
  if (await AcceptationConditions.exists({ conditions: courante._id, partie })) throw new ConditionsError(409, "Vous avez déjà accepté cette version.", "DEJA_ACCEPTEE");
  try {
    const acceptation = await AcceptationConditions.create({
      conditions: courante._id, transaction: { type: "ie", id: tx._id },
      version: courante.version, hash: courante.hash, partie, utilisateur: user._id,
    });
    // Les deux parties ont accepté la version en vigueur : première étape du
    // règlement direct franchie (seulement depuis « none » — un règlement déjà
    // déclaré ou confirmé ne revient jamais en arrière).
    if ((await etatConditions(tx._id)).accepteeParLesDeux) {
      await IETransaction.updateOne({ _id: tx._id, "reglementDirect.etat": "none" }, { $set: { "reglementDirect.etat": "terms_accepted" } });
    }
    return acceptation;
  } catch (err) {
    if (err?.code === 11000) throw new ConditionsError(409, "Vous avez déjà accepté cette version.", "DEJA_ACCEPTEE");
    throw err;
  }
}

/** Vue complète : version en vigueur, acceptations, versions antérieures. */
export async function etatConditions(txId) {
  const versions = await ConditionsLiberation.find({ "transaction.type": "ie", "transaction.id": txId }).sort({ version: -1 }).lean();
  const acceptations = await AcceptationConditions.find({ "transaction.type": "ie", "transaction.id": txId }).sort({ le: 1 }).lean();
  const parVersion = (v) => acceptations.filter((a) => a.version === v);
  const courante = versions[0] || null;
  const acc = courante ? parVersion(courante.version) : [];
  const parPartie = (p) => acc.find((a) => a.partie === p) || null;
  return {
    courante,
    acceptations: { acheteur: parPartie("acheteur"), vendeur: parPartie("vendeur") },
    accepteeParLesDeux: !!(parPartie("acheteur") && parPartie("vendeur")),
    versions: versions.map((v) => ({ version: v.version, hash: v.hash, creeLe: v.creeLe, origine: v.origine, proposePar: v.proposePar, acceptations: parVersion(v.version) })),
  };
}
