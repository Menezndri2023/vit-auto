import { describe, it, expect } from "vitest";
import { getUserLoyaltyAdmin } from "../controllers/loyaltyController.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Fidélité vue par l'administration.
//
// Le solde et les mouvements n'étaient consultables que par le titulaire du
// compte. Or 100 points = 1 USD de remise à la réservation suivante : un
// administrateur doit pouvoir vérifier ce solde quand un client conteste une
// remise, ou quand un palier paraît incohérent.

const appeler = async (userId, query = {}) => {
  const { req, res } = mockReqRes({ params: { userId: String(userId) }, query, user: { role: "admin" } });
  await getUserLoyaltyAdmin(req, res);
  return res;
};

describe("Fidélité — vue administrateur", () => {
  it("renvoie le solde, le cumul à vie et les mouvements d'un client", async () => {
    const client = await createUser({ role: "client", loyaltyPoints: 300, loyaltyLifetimePoints: 6000 });
    await LoyaltyTransaction.create([
      { user: client._id, type: "credit", points: 6000, reason: "Réservation terminée" },
      { user: client._id, type: "debit",  points: 5700, reason: "Remise appliquée" },
    ]);

    const res = await appeler(client._id);
    expect(res.body.points).toBe(300);
    expect(res.body.lifetimePoints).toBe(6000);
    expect(res.body.total).toBe(2);
    expect(res.body.transactions).toHaveLength(2);
  });

  it("recalcule le palier depuis le cumul à vie et signale un écart avec le compte", async () => {
    // C'est le cas que l'admin vient chercher : le palier stocké sur le compte
    // a décroché de celui qu'imposent les points réellement cumulés.
    const client = await createUser({ role: "client", loyaltyLifetimePoints: 6000, loyaltyTier: "bronze" });

    const res = await appeler(client._id);
    expect(res.body.tier.key, "6000 points à vie = palier Argent").toBe("argent");
    expect(res.body.storedTier, "le palier réellement stocké reste visible tel quel").toBe("bronze");
  });

  it("un compte inexistant renvoie 404, jamais un solde à zéro trompeur", async () => {
    const res = await appeler("6a60c464772a5a566af30165");
    expect(res.statusCode).toBe(404);
  });
});
