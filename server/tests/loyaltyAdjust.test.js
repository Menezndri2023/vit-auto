import { describe, it, expect } from "vitest";
import { adjustUserLoyalty } from "../controllers/loyaltyController.js";
import { MAX_LOYALTY_BALANCE_POINTS, MAX_MANUAL_ADJUSTMENT_POINTS } from "../constants/loyaltyTiers.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import User from "../models/User.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Ajustement manuel d'un solde de fidélité par un administrateur.
//
// C'est la seule écriture humaine sur un solde, et un point vaut de l'argent
// (100 points = 1 USD de remise). Chaque garde-fou ci-dessous existe pour une
// façon précise de perdre de l'argent ou de rendre un mouvement inexplicable.

const admin = () => createUser({ role: "admin" });

const ajuster = async (adminUser, targetId, body) => {
  const { req, res } = mockReqRes({ params: { userId: String(targetId) }, body, user: adminUser });
  await adjustUserLoyalty(req, res);
  return res;
};

describe("Fidélité — ajustement manuel par un administrateur", () => {
  it("crédite le solde, trace le motif et l'auteur", async () => {
    const [a, client] = await Promise.all([admin(), createUser({ role: "client", loyaltyPoints: 100 })]);

    const res = await ajuster(a, client._id, { direction: "credit", points: 500, reason: "Geste commercial — dossier #4821" });

    expect(res.body.points).toBe(600);
    const mouvement = await LoyaltyTransaction.findOne({ user: client._id }).lean();
    expect(mouvement.type).toBe("credit");
    expect(mouvement.reason, "le motif est conservé tel quel, préfixé pour être identifiable")
      .toBe("admin_adjust:Geste commercial — dossier #4821");
    expect(String(mouvement.adjustedBy), "l'historique doit rester lisible sans le journal d'audit")
      .toBe(String(a._id));
    expect(mouvement.balanceAfter).toBe(600);
  });

  it("un crédit ne promeut pas de palier par défaut", async () => {
    // Un geste commercial ne doit pas donner un multiplicateur permanent :
    // seul le cumul à vie détermine le palier, et il ne bouge pas sans
    // décision explicite.
    const [a, client] = await Promise.all([admin(), createUser({ role: "client", loyaltyLifetimePoints: 4900 })]);

    const res = await ajuster(a, client._id, { direction: "credit", points: 200, reason: "Compensation retard" });

    expect(res.body.lifetimePoints).toBe(4900);
    expect(res.body.tier.key).toBe("bronze");
  });

  it("countsTowardTier compte le crédit dans le cumul à vie", async () => {
    const [a, client] = await Promise.all([admin(), createUser({ role: "client", loyaltyLifetimePoints: 4900 })]);

    const res = await ajuster(a, client._id, {
      direction: "credit", points: 200, reason: "Rattrapage points non attribués", countsTowardTier: true,
    });

    expect(res.body.lifetimePoints).toBe(5100);
    expect(res.body.tier.key, "5000 points à vie franchissent le palier Argent").toBe("argent");
    const apres = await User.findById(client._id).select("loyaltyTier").lean();
    expect(apres.loyaltyTier, "le palier est aussi persisté sur le compte").toBe("argent");
  });

  it("débite sans jamais laisser un solde négatif", async () => {
    const [a, client] = await Promise.all([admin(), createUser({ role: "client", loyaltyPoints: 50 })]);

    const res = await ajuster(a, client._id, { direction: "debit", points: 300, reason: "Correction double attribution" });

    expect(res.statusCode).toBe(409);
    const apres = await User.findById(client._id).select("loyaltyPoints").lean();
    expect(apres.loyaltyPoints, "aucun débit partiel ne doit passer").toBe(50);
    expect(await LoyaltyTransaction.countDocuments({ user: client._id })).toBe(0);
  });

  it("refuse un motif vide", async () => {
    const [a, client] = await Promise.all([admin(), createUser({ role: "client", loyaltyPoints: 100 })]);

    const res = await ajuster(a, client._id, { direction: "credit", points: 100, reason: "  " });

    expect(res.statusCode).toBe(400);
    expect(await LoyaltyTransaction.countDocuments({ user: client._id })).toBe(0);
  });

  it("refuse un montant au-delà du plafond par opération", async () => {
    // Le garde-fou du zéro de trop.
    const [a, client] = await Promise.all([admin(), createUser({ role: "client" })]);

    const res = await ajuster(a, client._id, {
      direction: "credit", points: MAX_MANUAL_ADJUSTMENT_POINTS + 1, reason: "Saisie erronée",
    });

    expect(res.statusCode).toBe(400);
  });

  it("refuse les points non entiers ou négatifs", async () => {
    const [a, client] = await Promise.all([admin(), createUser({ role: "client", loyaltyPoints: 100 })]);

    for (const points of [0, -50, 12.5]) {
      const res = await ajuster(a, client._id, { direction: "credit", points, reason: "Motif valide" });
      expect(res.statusCode, `points=${points} doit être refusé`).toBe(400);
    }
    const apres = await User.findById(client._id).select("loyaltyPoints").lean();
    expect(apres.loyaltyPoints).toBe(100);
  });

  it("refuse un crédit qui ferait dépasser le plafond de solde, en disant ce qui est possible", async () => {
    // Écrêter en silence ferait croire à l'administrateur qu'il a crédité la
    // totalité — il doit savoir exactement ce qui passe.
    const [a, client] = await Promise.all([
      admin(), createUser({ role: "client", loyaltyPoints: MAX_LOYALTY_BALANCE_POINTS - 200 }),
    ]);

    const res = await ajuster(a, client._id, { direction: "credit", points: 500, reason: "Geste commercial" });

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toContain("200");
    const apres = await User.findById(client._id).select("loyaltyPoints").lean();
    expect(apres.loyaltyPoints).toBe(MAX_LOYALTY_BALANCE_POINTS - 200);
  });

  it("un administrateur ne peut pas s'ajuster lui-même", async () => {
    const a = await admin();

    const res = await ajuster(a, a._id, { direction: "credit", points: 1000, reason: "Test conflit d'intérêts" });

    expect(res.statusCode).toBe(403);
  });

  it("un compte inexistant renvoie 404", async () => {
    const a = await admin();
    const res = await ajuster(a, "6a60c464772a5a566af30165", { direction: "credit", points: 10, reason: "Motif valide" });
    expect(res.statusCode).toBe(404);
  });
});
