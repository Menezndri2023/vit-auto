import Booking from "../models/Booking.js";
import PricingConfig from "../models/PricingConfig.js";
import SystemMigration from "../models/SystemMigration.js";
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
 * 2026-10-27 : elles ont été créées avec ce taux, la suspension qui suit ne
 * doit pas le changer après coup (dans un sens ou dans l'autre). Les
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
 * Suspension provisoire de la HAUSSE 5 % → 7 % de la pièce à l'export pour les
 * partenaires fondateurs, pendant la vérification des contrats (décision de
 * l'exploitant, 2026-10-30). Passe par la grille versionnée (baisse, donc
 * immédiate) ; aucune notification automatique — l'information des
 * fondateurs est une décision séparée. Ne touche aucune réservation existante.
 */
export async function suspendreHaussePieceExportFondateurs() {
  const cfg = await PricingConfig.findOne({ key: "global" }).select("foundingPartner").lean();
  if (!cfg?.foundingPartner) return { applique: false, raison: "configuration absente" };
  const fp = cfg.foundingPartner;
  const aBaisser = ["entreprise", "particulier"].filter((t) => (fp[t]?.piece_import ?? 0) > 0.05);
  if (!aBaisser.length) return { applique: false, raison: "déjà à 5 % ou moins" };
  const valeur = JSON.parse(JSON.stringify(fp));
  for (const t of aBaisser) valeur[t].piece_import = 0.05;
  const v = await programmerModification({
    section: "foundingPartner", valeur, immediat: true, notifier: false,
    motif: "Suspension provisoire de la hausse 5 % → 7 % (pièce à l'export, fondateurs) pendant la vérification des contrats — nouvelles transactions uniquement.",
  });
  return { applique: true, version: v.version };
}
