// ── Plafond global des requêtes find() sans limite ──────────────────────────
//
// 78 find() de contrôleurs renvoyaient une collection entière : invisible à
// 400 véhicules et 32 comptes, mais à quelques milliers d'annonces ce sont
// des réponses de plusieurs Mo et des onglets admin qui ne s'ouvrent plus.
// Plutôt que retoucher chaque site (et en oublier), ce plugin Mongoose pose
// une limite par défaut sur TOUTE requête find() qui n'en fixe pas :
//   - `.limit(n)` explicite : respecté tel quel ;
//   - `.limit(0)` explicite : « tout », pour les traitements qui doivent
//     réellement parcourir la collection (statistiques, migrations) ;
//   - sinon : PLAFOND documents, et un avertissement (journal + Sentry) dès
//     qu'une requête le touche — le signe qu'il faut paginer ce point.
//
// Doit être importé AVANT la compilation des schémas (première ligne
// d'import de server.js et de tests/setup.js) : un plugin global ne
// s'applique qu'aux schémas compilés après son enregistrement.
import mongoose from "mongoose";
import logger from "./logger.js";

export const PLAFOND = 2000;

let _sentry = null;
async function signaler(modele, filtre) {
  logger.warn(`[plafond] ${modele}.find() a atteint ${PLAFOND} documents — paginer ce point`, { filtre: JSON.stringify(filtre).slice(0, 200) });
  try {
    _sentry ||= await import("../config/sentry.js");
    _sentry.captureException(new Error(`Plafond de requête atteint : ${modele}.find()`), { modele, plafond: PLAFOND, filtre: JSON.stringify(filtre).slice(0, 500) });
  } catch { /* jamais bloquant */ }
}

export function plafondRequetes(schema) {
  schema.pre("find", function () {
    const opts = this.getOptions();
    if (opts.limit === undefined || opts.limit === null) {
      this.limit(PLAFOND);
      this._plafondApplique = true;
    }
  });
  schema.post("find", function (docs) {
    if (this._plafondApplique && Array.isArray(docs) && docs.length >= PLAFOND) {
      signaler(this.model?.modelName || "?", this.getFilter());
    }
  });
}

mongoose.plugin(plafondRequetes);
