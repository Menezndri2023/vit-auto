// ── Verrou d'exécution des planificateurs, partagé entre instances ──────────
//
// Les six planificateurs du serveur (rappels de réservation, réponse
// partenaire, demandes d'essai, relances partenaires, comptes incomplets,
// rapports mensuels) tournent en mémoire par setInterval — choix assumé pour
// ne pas charger Redis. Ils supposaient UNE seule instance d'API : à deux
// instances (montée en charge sur Render, ou chevauchement pendant un
// redéploiement), chaque cycle s'exécutait deux fois — rappel envoyé en
// double, ou deux fois le même rapport mensuel.
//
// Ce verrou règle le problème sans Redis : un document par planificateur dans
// `schedulerlocks`, pris par un findOneAndUpdate atomique (upsert) qui ne
// réussit que si le verrou est libre ou expiré. Une instance qui meurt en
// plein cycle ne bloque rien : le verrou expire de lui-même (dureeMs).
import mongoose from "mongoose";
import os from "os";
import logger from "./logger.js";
import { nonBloquant } from "./nonBloquant.js";

const schema = new mongoose.Schema({
  _id:        { type: String },            // nom du planificateur
  holder:     { type: String, default: null },
  acquiredAt: { type: Date, default: null },
  expiresAt:  { type: Date, default: null },
}, { versionKey: false });

const SchedulerLock = mongoose.models.SchedulerLock || mongoose.model("SchedulerLock", schema);
const HOLDER = `${os.hostname()}#${process.pid}`;

// Exécute `fn` si le verrou `nom` est libre ; sinon renvoie { skipped: true }.
// `dureeMs` : durée maximale d'un cycle (au-delà, une autre instance peut
// reprendre la main même si celle-ci n'a pas libéré).
export async function avecVerrou(nom, dureeMs, fn) {
  const now = new Date();
  try {
    await SchedulerLock.findOneAndUpdate(
      { _id: nom, $or: [{ expiresAt: null }, { expiresAt: { $lte: now } }] },
      { $set: { holder: HOLDER, acquiredAt: now, expiresAt: new Date(now.getTime() + dureeMs) } },
      { upsert: true, new: true },
    );
  } catch (err) {
    // E11000 : le document existe avec un verrou encore valide (le filtre ne
    // l'a pas sélectionné, l'upsert a tenté un insert) — une autre instance
    // tient le cycle.
    if (err?.code === 11000) return { skipped: true };
    logger.error(`[SchedulerLock] ${nom} : prise de verrou impossible`, { error: err.message });
    return { skipped: true, error: err.message };
  }
  try {
    const result = await fn();
    return { skipped: false, result };
  } finally {
    // Libération : expiration immédiate (le document reste, prêt pour le
    // prochain cycle). Non bloquant si Mongo est indisponible à cet instant.
    await SchedulerLock.updateOne({ _id: nom, holder: HOLDER }, { $set: { expiresAt: new Date() } }).catch(nonBloquant("schedulerLock"));
  }
}

export default SchedulerLock;
