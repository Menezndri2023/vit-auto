import mongoose from "mongoose";
import IETransaction from "../models/IETransaction.js";
import Booking from "../models/Booking.js";
import logger from "../utils/logger.js";
import { logAction } from "../middleware/auditLog.js";
import { INCOTERMS, INCOTERM_STAGES } from "../constants/incoterms.js";
import { validerConditions, recommanderIncoterms, libelleIncoterm, avertissementsCompatibilite, AVERTISSEMENT_AIDE } from "../services/incotermService.js";

// ═══════════════════════════════════════════════════════════════════════════
// Conditions Incoterms® 2020 d'une commande (exploitant, 2026-10-28)
// ═══════════════════════════════════════════════════════════════════════════
// Commandes concernées : transaction VIT-AUTO Trade (IETransaction) et
// commande VIT-AUTO Parts (Booking type "piece"). L'acheteur et le vendeur
// sont lus sur la commande, jamais reçus du client. Un accord exige la
// validation des deux ; toute modification ultérieure est motivée et tracée.

const idEgal = (a, b) => a && b && String(a._id || a) === String(b._id || b);

async function chargerCommande(type, id) {
  if (!mongoose.isValidObjectId(id)) return null;
  if (type === "transaction") {
    const tx = await IETransaction.findById(id);
    if (!tx) return null;
    return { doc: tx, acheteur: tx.client, vendeur: tx.partner, regleOrigine: tx.incoterm || null, modeOrigine: null };
  }
  if (type === "booking") {
    const b = await Booking.findById(id).populate("part", "owner");
    if (!b || b.type !== "piece") return null;
    return { doc: b, acheteur: b.client, vendeur: b.part?.owner || null, regleOrigine: null, modeOrigine: null };
  }
  return null;
}

function roleDe(user, cmd) {
  if (idEgal(cmd.acheteur, user._id)) return "acheteur";
  if (idEgal(cmd.vendeur, user._id)) return "vendeur";
  if (user.role === "admin") return "admin";
  return null;
}

function vue(cmd, role) {
  const c = cmd.doc.conditionsIncoterm?.toObject ? cmd.doc.conditionsIncoterm.toObject() : cmd.doc.conditionsIncoterm;
  return {
    role,
    conditions: c ? {
      ...c,
      libelle: libelleIncoterm(c),
      avertissements: avertissementsCompatibilite(c.regle, c.modeTransport),
    } : null,
    // Règle d'origine de l'annonce, sans lieu : une suggestion à compléter,
    // jamais un accord.
    suggestion: !c && cmd.regleOrigine ? { regle: cmd.regleOrigine } : null,
    peutModifier: role === "acheteur" || role === "vendeur",
    peutValider: (role === "acheteur" && c?.regle && !c?.valideAcheteur?.le) || (role === "vendeur" && c?.regle && !c?.valideVendeur?.le),
  };
}

const charger = async (req, res) => {
  const { type, id } = req.params;
  if (!["transaction", "booking"].includes(type)) { res.status(400).json({ message: "Type de commande invalide." }); return {}; }
  const cmd = await chargerCommande(type, id);
  if (!cmd) { res.status(404).json({ message: "Commande introuvable." }); return {}; }
  const role = roleDe(req.user, cmd);
  if (!role) { res.status(404).json({ message: "Commande introuvable." }); return {}; }
  return { cmd, role };
};

const echec = (res, nom) => (err) => {
  logger.error(`incoterm.${nom}:`, err);
  if (!res.headersSent) res.status(500).json({ message: "Erreur serveur." });
};

export const referentiel = (_req, res) => {
  res.json({ incoterms: INCOTERMS, etapes: INCOTERM_STAGES, version: "2020", avertissementAide: AVERTISSEMENT_AIDE });
};

export const recommandation = (req, res) => {
  res.json(recommanderIncoterms(req.body || {}));
};

export const lireConditions = async (req, res) => {
  try {
    const { cmd, role } = await charger(req, res);
    if (!cmd) return;
    res.json(vue(cmd, role));
  } catch (err) { echec(res, "lireConditions")(err); }
};

// Proposer ou modifier. L'auteur valide de fait sa propre proposition ;
// l'autre partie devra valider à nouveau.
export const proposerConditions = async (req, res) => {
  try {
    const { cmd, role } = await charger(req, res);
    if (!cmd) return;
    if (role !== "acheteur" && role !== "vendeur") return res.status(403).json({ message: "Seuls l'acheteur et le vendeur fixent les conditions." });
    const { erreurs, avertissements, valeurs } = validerConditions(req.body);
    if (erreurs.length) {
      return res.status(400).json({
        message: erreurs.includes("lieuNomme") ? "Précisez le lieu ou le port convenu : un Incoterm sans lieu nommé ne dit pas où la marchandise est livrée." : "Conditions incomplètes.",
        code: "CONDITIONS_INVALIDES", champs: erreurs,
      });
    }
    const avant = cmd.doc.conditionsIncoterm;
    const dejaAcceptees = avant?.statut === "accepte";
    const motif = String(req.body.motif || "").trim().slice(0, 500);
    if (dejaAcceptees && !motif) {
      return res.status(409).json({ message: "Les conditions ont été acceptées par les deux parties : indiquez le motif de la modification.", code: "MOTIF_REQUIS" });
    }
    const maintenant = new Date();
    // Jamais diffuser un sous-document Mongoose tel quel (casse la validation) :
    // on repart d'objets simples.
    const historique = (avant?.historique || []).map((h) => (h.toObject ? h.toObject() : h));
    historique.push({ regle: valeurs.regle, lieuNomme: valeurs.lieuNomme, pays: valeurs.pays, version: valeurs.version, action: avant?.regle ? "modification" : "proposition", role, par: req.user._id, motif });

    cmd.doc.conditionsIncoterm = {
      ...valeurs,
      statut: "propose",
      valideAcheteur: role === "acheteur" ? { par: req.user._id, le: maintenant } : { par: null, le: null },
      valideVendeur:  role === "vendeur"  ? { par: req.user._id, le: maintenant } : { par: null, le: null },
      valideLe: null,
      historique,
    };
    await cmd.doc.save();
    await logAction(req, `incoterm.${avant?.regle ? "modifier" : "proposer"}`, req.params.type === "transaction" ? "IETransaction" : "Booking", cmd.doc._id,
      { avant: avant?.regle ? { regle: avant.regle, lieuNomme: avant.lieuNomme } : null, apres: { regle: valeurs.regle, lieuNomme: valeurs.lieuNomme }, motif });
    res.json({ ...vue(cmd, role), avertissements });
  } catch (err) { echec(res, "proposerConditions")(err); }
};

export const validerConditionsCommande = async (req, res) => {
  try {
    const { cmd, role } = await charger(req, res);
    if (!cmd) return;
    if (role !== "acheteur" && role !== "vendeur") return res.status(403).json({ message: "Seuls l'acheteur et le vendeur valident les conditions." });
    const c = cmd.doc.conditionsIncoterm;
    if (!c?.regle || !c?.lieuNomme) return res.status(409).json({ message: "Aucune condition complète à valider.", code: "RIEN_A_VALIDER" });
    const champ = role === "acheteur" ? "valideAcheteur" : "valideVendeur";
    if (c[champ]?.le) return res.status(409).json({ message: "Vous avez déjà validé ces conditions.", code: "DEJA_VALIDE" });
    c[champ] = { par: req.user._id, le: new Date() };
    c.historique.push({ regle: c.regle, lieuNomme: c.lieuNomme, pays: c.pays, version: c.version, action: "validation", role, par: req.user._id });
    if (c.valideAcheteur?.le && c.valideVendeur?.le) {
      c.statut = "accepte";
      c.valideLe = new Date();
      // L'estimateur de coûts lit encore le code seul.
      if (req.params.type === "transaction") cmd.doc.incoterm = c.regle;
    }
    cmd.doc.markModified("conditionsIncoterm");
    await cmd.doc.save();
    await logAction(req, "incoterm.valider", req.params.type === "transaction" ? "IETransaction" : "Booking", cmd.doc._id, { role, regle: c.regle, lieuNomme: c.lieuNomme, accepte: c.statut === "accepte" });
    res.json(vue(cmd, role));
  } catch (err) { echec(res, "validerConditionsCommande")(err); }
};
