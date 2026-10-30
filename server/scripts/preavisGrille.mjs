import Booking from "../models/Booking.js";
import SystemMigration from "../models/SystemMigration.js";
import PricingConfig from "../models/PricingConfig.js";
import { programmerModification } from "../services/grilleTarifaire.js";

// ═══════════════════════════════════════════════════════════════════════════
// Préavis et grille versionnée — migrations du 2026-10-30 (server.js)
// ═══════════════════════════════════════════════════════════════════════════

const TERMINAUX = ["completed", "cancelled"];
// Repli si le marqueur de la migration de la grille unique est introuvable :
// la grille du 27/10 a été publiée le 28/10 (83f065b).
const REPLI_GRILLE_UNIQUE = new Date("2026-10-28T00:00:00Z");

/**
 * Conserve le taux des réservations OUVERTES créées sous la grille du
 * 2026-10-27 : elles ont été créées avec ce taux, une version ultérieure de
 * la grille ne doit pas le changer après coup. Les
 * réservations plus anciennes gardent le comportement d'avant (recalcul au
 * règlement), qui n'est pas modifié ici.
 */
export async function conserverTauxReservationsOuvertes() {
  const marqueur = await SystemMigration.findOne({ name: "grille-commissions-unique-2026-10-27" }).select("ranAt").lean();
  const depuis = marqueur?.ranAt || REPLI_GRILLE_UNIQUE;
  const r = await Booking.updateMany(
    { commissionFigee: { $ne: true }, status: { $nin: TERMINAUX }, createdAt: { $gte: depuis } },
    { $set: { commissionFigee: true } },
  );
  return { depuis, conservees: r.modifiedCount };
}

/**
 * Grille officielle du 2026-10-30 : pièces détachées à 5 % partout (la clé
 * `piece_import` passe de 7 % à 5 %), pour tous, fondateurs compris. Baisse :
 * appliquée tout de suite via la grille versionnée, sans e-mail automatique
 * (l'annonce aux partenaires est une décision séparée). La vente de véhicules
 * Import/Export passe à 2 % par le code (clé « vente »), pas par la config.
 */
export async function appliquerGrilleOfficielle() {
  const cfg = await PricingConfig.findOne({ key: "global" }).select("commissions foundingPartner").lean();
  if (!cfg) return { versions: [] };
  const versions = [];
  for (const [section, paliers] of [["commissions", ["standard", "premium"]], ["foundingPartner", ["entreprise", "particulier"]]]) {
    const valeur = JSON.parse(JSON.stringify(cfg[section] || {}));
    let change = false;
    for (const p of paliers) {
      if (valeur[p] && (valeur[p].piece_import ?? 0) > 0.05) { valeur[p].piece_import = 0.05; change = true; }
    }
    if (!change) continue;
    const v = await programmerModification({ section, valeur, immediat: true, notifier: false,
      motif: "Grille officielle du 2026-10-30 : pièces détachées 5 %, locale ou export." });
    versions.push(v.version);
  }
  return { versions };
}
