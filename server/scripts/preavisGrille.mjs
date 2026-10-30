import Booking from "../models/Booking.js";
import SystemMigration from "../models/SystemMigration.js";

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
