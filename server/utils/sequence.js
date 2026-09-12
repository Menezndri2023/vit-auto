// ── Numérotation atomique des références (VIT-LOC-2026-000123, VA-LEAD-…) ───
//
// Jusqu'ici : countDocuments({ reference: /^PREFIXE-ANNEE-/ }) + 1 — un scan
// par expression régulière à chaque création, et une course entre deux
// créations simultanées, rattrapée seulement par l'index unique et un
// nouvel essai. Ici : un compteur par clé dans `counters`, incrémenté par
// $inc (atomique côté Mongo), amorcé une seule fois depuis l'existant pour
// ne jamais repartir en dessous des références déjà attribuées.
import mongoose from "mongoose";

const schema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false });
const Counter = mongoose.models.Counter || mongoose.model("Counter", schema);

// `amorcer` : fonction async renvoyant la valeur de départ (ex. nombre de
// références existantes) — appelée uniquement si le compteur n'existe pas.
export async function prochainNumero(cle, amorcer = async () => 0) {
  const existe = await Counter.exists({ _id: cle });
  if (!existe) {
    const depart = Number(await amorcer()) || 0;
    // Deux instances qui amorcent en même temps : $setOnInsert n'écrit qu'une
    // fois, le $inc ci-dessous fait le reste — pas de doublon possible.
    await Counter.updateOne({ _id: cle }, { $setOnInsert: { seq: depart } }, { upsert: true }).catch((err) => {
      if (err?.code !== 11000) throw err;
    });
  }
  const doc = await Counter.findOneAndUpdate({ _id: cle }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return doc.seq;
}

export function formatReference(prefixe, annee, numero) {
  return `${prefixe}-${annee}-${String(numero).padStart(6, "0")}`;
}

export default Counter;
