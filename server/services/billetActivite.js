// ── Billet à QR code d'une séance de loisirs ───────────────────────────────
//
// Ce que ça remplace : la liste papier et le « je vous assure que j'étais là ».
// Un litige de présence se tranche aujourd'hui parole contre parole, et le
// partenaire perd les deux fois — soit il rembourse une place qu'il a tenue
// libre, soit il garde un client mécontent.
//
// ⚠️ Le billet ne touche PAS la machine à états des réservations. Six services
// la partagent (location, essai, chauffeur, leasing, activité, pièce) et
// `confirmed → client_arrived` n'y est pas une transition valide : l'ouvrir
// pour les loisirs changerait le comportement des cinq autres. Le billet
// répond à la seule question qu'on lui pose — QUI s'est présenté, et QUAND —
// et le partenaire continue de piloter le statut comme avant.
import crypto from "crypto";

/**
 * Le jeton porté par le QR code.
 *
 * Aléatoire et stocké, plutôt qu'une signature du numéro de réservation :
 * une référence signée reste valable pour toujours, alors qu'un jeton se
 * REMPLACE — un billet transmis par erreur se révoque en en réémettant un.
 * 32 octets, soit bien au-delà de ce qu'une énumération peut atteindre.
 */
export function nouveauJeton() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Un billet est-il présentable ?
 *
 * Les deux refus sont définitifs et se disent autrement l'un que l'autre : un
 * billet annulé n'aurait pas dû être présenté, un billet déjà scanné l'a déjà
 * été — et c'est précisément le cas qu'on veut attraper, la photo d'un QR
 * code passée à un ami.
 */
export function refusDeScan(booking) {
  if (!booking) return { statut: 404, message: "Billet inconnu." };
  if (booking.type !== "activite") return { statut: 400, message: "Ce billet ne correspond pas à une séance." };
  if (["cancelled", "transaction_not_concluded"].includes(booking.status)) {
    return { statut: 409, message: "Cette réservation est annulée : le billet n'est plus valable." };
  }
  const billet = booking.activite?.billet;
  if (billet?.scanneLe) {
    return {
      statut: 409,
      message: `Billet déjà présenté le ${new Date(billet.scanneLe).toLocaleString("fr-FR")}.`,
      dejaScanne: true,
      scanneLe: billet.scanneLe,
    };
  }
  return null;
}

/**
 * Le scan tombe-t-il le jour de la séance ?
 *
 * Renvoyé au partenaire, jamais utilisé pour REFUSER. Un groupe qui embarque
 * la veille au soir, une sortie de deux jours, un décalage de fuseau : poser
 * une règle ici déciderait à la place de quelqu'un qui est sur place et voit
 * le client. On l'informe, il tranche — comme pour le motif de report.
 */
export function horsCreneau(booking, maintenant = new Date()) {
  const date = booking?.activite?.date;
  if (!date) return false;
  const jour = (d) => new Date(d).toISOString().slice(0, 10);
  return jour(date) !== jour(maintenant);
}
