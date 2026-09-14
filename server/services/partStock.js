// ── Stock d'une pièce détachée au fil de la commande ───────────────────────
//
// Réservé à la CRÉATION de la commande (décrément conditionnel, atomique :
// deux clients ne peuvent pas acheter la dernière unité), restitué si la
// commande est annulée, compté en vente à la réception confirmée. Une annonce
// sans suivi de stock (stock: null = « sur commande ») n'est jamais touchée.
import SparePart from "../models/SparePart.js";
import Booking from "../models/Booking.js";

export async function reserverStockPiece(partId, quantity) {
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const part = await SparePart.findById(partId).select("stock").lean();
  if (!part) return { ok: false, reason: "introuvable" };
  if (part.stock == null) return { ok: true, tracked: false };
  const r = await SparePart.updateOne({ _id: partId, stock: { $gte: qty } }, { $inc: { stock: -qty } });
  return r.modifiedCount === 1 ? { ok: true, tracked: true } : { ok: false, reason: "stock", stock: part.stock };
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
  return true;
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
