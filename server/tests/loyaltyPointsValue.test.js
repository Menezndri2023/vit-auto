import { describe, it, expect } from "vitest";
import { POINTS_PER_USD, pointsToUSD } from "../constants/loyaltyTiers.js";
import { getUserLoyaltyAdmin, getMyLoyaltyStatus } from "../controllers/loyaltyController.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";
import "../models/Booking.js"; // schéma requis par le populate des mouvements

// Valeur monétaire des points.
//
// Le taux (100 points = 1 USD) était réécrit en dur à quatre endroits, dont
// l'aperçu client. Un aperçu calculé avec un taux différent de celui du serveur
// annonce une remise que le client n'obtient pas : le taux doit venir d'une
// seule source, et l'API doit renvoyer la valeur qu'elle a elle-même calculée.

describe("Points de fidélité — conversion en argent", () => {
  it("convertit au taux officiel, au centime près", () => {
    expect(pointsToUSD(POINTS_PER_USD)).toBe(1);
    expect(pointsToUSD(250)).toBe(2.5);
    expect(pointsToUSD(1)).toBe(0.01);
    expect(pointsToUSD(0)).toBe(0);
  });

  it("ne renvoie jamais NaN sur un solde absent", () => {
    // Un solde manquant doit valoir 0, jamais « NaN » affiché au client.
    expect(pointsToUSD(undefined)).toBe(0);
    expect(pointsToUSD(null)).toBe(0);
  });

  it("le client reçoit la valeur de son solde et le taux appliqué", async () => {
    const client = await createUser({ role: "client", loyaltyPoints: 450, loyaltyLifetimePoints: 450 });
    const { req, res } = mockReqRes({ user: { _id: client._id } });
    await getMyLoyaltyStatus(req, res);

    expect(res.body.pointsValueUSD).toBe(4.5);
    expect(res.body.pointsPerUSD).toBe(POINTS_PER_USD);
  });

  it("l'administrateur voit la même valeur que le client", async () => {
    // Une valeur calculée différemment des deux côtés rendrait toute
    // réclamation client inarbitrable.
    const client = await createUser({ role: "client", loyaltyPoints: 450, loyaltyLifetimePoints: 450 });
    const { req, res } = mockReqRes({ params: { userId: String(client._id) }, user: { role: "admin" } });
    await getUserLoyaltyAdmin(req, res);

    expect(res.body.pointsValueUSD).toBe(4.5);
  });
});
