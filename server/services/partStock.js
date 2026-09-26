// ── Stock d'une pièce détachée au fil de la commande ───────────────────────
//
// Réservé à la CRÉATION de la commande (décrément conditionnel, atomique :
// deux clients ne peuvent pas acheter la dernière unité), restitué si la
// commande est annulée, compté en vente à la réception confirmée. Une annonce
// sans suivi de stock (stock: null = « sur commande ») n'est jamais touchée.
import SparePart from "../models/SparePart.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";
import logger from "../utils/logger.js";

/**
 * Prévient le partenaire quand une pièce passe sous son seuil.
 *
 * Posée ICI et nulle part ailleurs : `reserverStockPiece` est le seul endroit
 * où le stock descend. La poser dans le contrôleur de commande l'aurait
 * oubliée le jour où une seconde voie de vente apparaît.
 *
 * Deux garde-fous :
 *  · `alerteStockLe` empêche de renotifier à chaque vente sous le seuil — on
 *    n'alerte qu'au FRANCHISSEMENT, pas tant qu'on reste dessous ;
 *  · la mise à jour est conditionnelle (`alerteStockLe: null`), donc deux
 *    commandes simultanées ne produisent qu'une notification.
 *
 * Jamais bloquant : une notification qui échoue ne doit pas annuler une vente.
 */
async function alerterSiStockBas(partId) {
  try {
    const part = await SparePart.findById(partId)
      .select("owner title stock seuilStockBas alerteStockLe").lean();
    if (!part || part.seuilStockBas == null || part.stock == null) return;
    if (part.stock > part.seuilStockBas) return;

    const pose = await SparePart.updateOne(
      { _id: partId, alerteStockLe: null },
      { $set: { alerteStockLe: new Date() } }
    );
    if (pose.modifiedCount !== 1) return; // déjà alerté depuis le dernier réassort

    const epuisee = part.stock === 0;
    await Notification.create({
      user: part.owner,
      type: "system",
      titre: epuisee ? "⛔ Pièce épuisée" : "⚠️ Stock bas",
      message: epuisee
        ? `« ${part.title} » n'a plus aucune unité en stock. Tant qu'elle n'est pas réapprovisionnée, elle ne peut plus être commandée.`
        : `« ${part.title} » descend à ${part.stock} unité${part.stock > 1 ? "s" : ""}, sous votre seuil de ${part.seuilStockBas}. Réapprovisionnez avant la rupture.`,
      lien: "/vendor/dashboard",
    });
  } catch (e) {
    logger.error("alerte de stock bas (non bloquant) :", e.message);
  }
}

export async function reserverStockPiece(partId, quantity) {
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const part = await SparePart.findById(partId).select("stock").lean();
  if (!part) return { ok: false, reason: "introuvable" };
  if (part.stock == null) return { ok: true, tracked: false };
  const r = await SparePart.updateOne({ _id: partId, stock: { $gte: qty } }, { $inc: { stock: -qty } });
  if (r.modifiedCount !== 1) return { ok: false, reason: "stock", stock: part.stock };
  await alerterSiStockBas(partId);
  return { ok: true, tracked: true };
}

// Idempotente : le drapeau `piece.stockRestored` empêche une double
// restitution (annulation client puis admin, par exemple).
export async function restituerStockPiece(booking) {
  if (!booking || booking.type !== "piece" || !booking.part) return false;
  const bId = booking._id;
  const claim = await Booking.updateOne(
    { _id: bId, "piece.stockReserved": true, "piece.stockRestored": { $ne: true } },
    { $set: { "piece.stockRestored": true } }
  );
  if (claim.modifiedCount !== 1) return false;
  const qty = Math.max(1, Math.floor(Number(booking.piece?.quantity) || 1));
  await SparePart.updateOne({ _id: booking.part?._id || booking.part, stock: { $ne: null } }, { $inc: { stock: qty } });
  // Le stock remonte : l'alerte doit pouvoir se redéclencher au prochain
  // franchissement, sinon une rupture sur deux passerait sous silence.
  await rearmerAlerteStock(booking.part?._id || booking.part);
  return true;
}

/**
 * Réarme l'alerte dès que le stock repasse au-dessus du seuil.
 *
 * Exporté : un réassort ne passe pas forcément par une annulation — le
 * partenaire corrige souvent le compteur à la main depuis son tableau de bord,
 * et le contrôleur de mise à jour appelle donc cette fonction.
 */
export async function rearmerAlerteStock(partId) {
  try {
    const part = await SparePart.findById(partId).select("stock seuilStockBas").lean();
    if (!part || part.seuilStockBas == null || part.stock == null) return;
    if (part.stock <= part.seuilStockBas) return;
    await SparePart.updateOne({ _id: partId }, { $set: { alerteStockLe: null } });
  } catch (e) {
    logger.error("réarmement de l'alerte de stock (non bloquant) :", e.message);
  }
}

export async function enregistrerVentePiece(booking) {
  if (!booking || booking.type !== "piece" || !booking.part) return;
  const claim = await Booking.updateOne(
    { _id: booking._id, "piece.saleCounted": { $ne: true } },
    { $set: { "piece.saleCounted": true } }
  );
  if (claim.modifiedCount !== 1) return;
  await SparePart.updateOne({ _id: booking.part?._id || booking.part }, { $inc: { ventes: Math.max(1, Math.floor(Number(booking.piece?.quantity) || 1)) } });
}
