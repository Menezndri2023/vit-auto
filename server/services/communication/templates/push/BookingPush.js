// ── Modèles de notification push — cycle de vie réservation ──────────────────
// Contenu dédié au push (court, actionnable), distinct du texte de la
// notification in-app (souvent plus long) — voir queue/index.js (dispatch
// .bookingCreated / .bookingStatusChanged) pour l'appel, et InternalChannel.js
// (fanOutPush) pour l'utilisation de `pushTitle`/`pushBody` s'ils sont fournis.

export function newBookingPartnerPush({ reference, clientName, vehicleTitle }) {
  return {
    title: "📋 Nouvelle réservation !",
    body: `${clientName || "Un client"} souhaite réserver ${vehicleTitle || "votre annonce"} (${reference || ""}). Répondez vite.`,
  };
}

export function newBookingClientPush({ reference, vehicleTitle }) {
  return {
    title: "🚗 Réservation reçue",
    body: `Votre demande pour ${vehicleTitle || "le véhicule"} (${reference || ""}) est enregistrée. On vous notifie dès la réponse du partenaire.`,
  };
}

export function bookingConfirmedClientPush({ reference, vehicleTitle }) {
  return {
    title: "✅ Réservation confirmée !",
    body: `${vehicleTitle || "Votre véhicule"} vous attend — réservation ${reference || ""} acceptée par le partenaire.`,
  };
}
