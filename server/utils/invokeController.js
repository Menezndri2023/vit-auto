// Appelle un handler Express existant (params/body/user) sans passer par une
// vraie requête HTTP — utilisé pour que WhatsApp et l'auto-approbation par
// score de fraude exécutent EXACTEMENT la même logique métier que le
// dashboard (updateBookingStatus/adminValidateBooking), sans dupliquer une
// seule ligne de la machine à états existante. `res.status()/.json()` sont
// mockés pour capturer la réponse au lieu de l'envoyer sur le réseau.
export function invokeController(handler, { params = {}, body = {}, user = null, source = null } = {}) {
  return new Promise((resolve) => {
    let statusCode = 200;
    const req = { params, body, user, source };
    const res = {
      status(code) { statusCode = code; return this; },
      json(data) { resolve({ statusCode, body: data }); },
    };
    Promise.resolve(handler(req, res)).catch((err) => resolve({ statusCode: 500, body: { message: err.message } }));
  });
}
