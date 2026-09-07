import { describe, it, expect } from "vitest";
import { createBooking } from "../controllers/bookingController.js";
import { createReview } from "../controllers/reviewController.js";
import { purchaseBoost } from "../controllers/subscriptionController.js";
import { initiatePayment } from "../controllers/paymentController.js";
import { createReservation, createDirectPurchase } from "../controllers/ieTransactionController.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Classe de bug systémique (audit 2026-09) : un identifiant Mongo malformé
// (id local numérique, valeur tronquée, copier-coller partiel) passé à
// findById/findOne({_id}) lève un CastError, rattrapé par le catch du
// contrôleur et renvoyé en 500 "Erreur serveur." — alors que c'est une entrée
// invalide. L'utilisateur voit "erreur serveur" sans rien pouvoir corriger.
// Le middleware validateObjectId couvre les paramètres d'URL ; ces tests
// couvrent les identifiants reçus dans le CORPS de la requête, qu'il ne voit pas.

const BAD_IDS = ["abc123", "1757230000000", "undefined", "%2E%2E"];
const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.badid@example.test" };

describe("Identifiant malformé dans le body — jamais de 500", () => {
  it("createBooking refuse un vehicleId/driverId/activityId malformé (400, pas 500)", async () => {
    const client = await createUser({ role: "client", emailVerified: true });
    for (const bad of BAD_IDS) {
      const { req, res } = mockReqRes({
        user: client,
        body: { type: "location", clientInfo, vehicleId: bad, location: { days: 2, startDate: "2027-10-01", endDate: "2027-10-03" } },
      });
      await createBooking(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.status).not.toHaveBeenCalledWith(500);
    }
  });

  it("createReview refuse un bookingId malformé", async () => {
    const client = await createUser({ role: "client" });
    const { req, res } = mockReqRes({ user: client, body: { bookingId: "abc123", note: 5 } });
    await createReview(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  it("purchaseBoost refuse un vehicleId malformé", async () => {
    const partner = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: partner, body: { vehicleId: "1757230000000", tier: "24h" } });
    await purchaseBoost(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  it("initiatePayment refuse une cible malformée", async () => {
    const client = await createUser({ role: "client" });
    const { req, res } = mockReqRes({ user: client, body: { bookingId: "abc123", method: "card" } });
    await initiatePayment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  it("createReservation et createDirectPurchase (Import/Export) refusent un listingId malformé", async () => {
    const buyer = await createUser({ role: "client" });
    for (const handler of [createReservation, createDirectPurchase]) {
      const { req, res } = mockReqRes({ user: buyer, body: { listingId: "abc123", destCountry: "CI" } });
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.status).not.toHaveBeenCalledWith(500);
    }
  });
});
