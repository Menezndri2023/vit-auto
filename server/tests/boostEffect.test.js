import { describe, it, expect } from "vitest";
import { adminApproveBoost } from "../controllers/subscriptionController.js";
import { getVehicles } from "../controllers/vehicleController.js";
import Subscription from "../models/Subscription.js";
import Vehicle from "../models/Vehicle.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Mise en avant payante (boost) — le produit était VENDU (prix réel, code promo,
// confirmation de paiement par un admin) mais n'avait strictement aucun effet :
// adminApproveBoost n'écrivait que dans le sous-document Subscription.boosts,
// alors que Vehicle.boostLevel / sponsoredUntil n'étaient lus nulle part et que
// le catalogue triait uniquement par date de création.

const approveBoost = async (subId, boostId) => {
  const admin = await createUser({ role: "admin", adminScope: ["super_admin"] });
  const { req, res } = mockReqRes({ user: admin, params: { subscriptionId: subId, boostId } });
  await adminApproveBoost(req, res);
  return res;
};

describe("Mise en avant payante (boost)", () => {
  it("applique réellement la mise en avant sur l'annonce à la confirmation du paiement", async () => {
    const partner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id });
    const sub = await Subscription.create({
      vendor: partner._id, plan: "free",
      boosts: [{ vehicle: vehicle._id, tier: "30d", isActive: false, priceUSD: 20 }],
    });

    const res = await approveBoost(sub._id.toString(), sub.boosts[0]._id.toString());
    expect(res.statusCode).not.toBe(500);

    const boosted = await Vehicle.findById(vehicle._id).select("sponsoredUntil boostLevel");
    expect(boosted.sponsoredUntil).toBeTruthy();
    expect(boosted.sponsoredUntil.getTime()).toBeGreaterThan(Date.now());
    expect(boosted.boostLevel).toBe(3); // palier 30 jours
  });

  it("fait remonter l'annonce boostée en tête du catalogue", async () => {
    const partner = await createUser({ role: "partenaire" });
    // L'annonce boostée est créée EN PREMIER : sans le tri par mise en avant,
    // elle serait dernière (tri par date de création décroissante).
    const boostedVehicle = await createVehicleDoc({ owner: partner._id, title: "Annonce boostée" });
    await createVehicleDoc({ owner: partner._id, title: "Annonce récente A" });
    await createVehicleDoc({ owner: partner._id, title: "Annonce récente B" });

    await Vehicle.findByIdAndUpdate(boostedVehicle._id, {
      $set: { sponsoredUntil: new Date(Date.now() + 7 * 86400000), boostLevel: 2 },
    });

    // `search` distinct par test : getVehicles met ses réponses en cache par
    // clé de requête (buildCacheKey) — deux appels identiques dans le même
    // processus renverraient la réponse du test précédent.
    const { req, res } = mockReqRes({ query: { limit: "10", search: "Annonce" } });
    await getVehicles(req, res);
    expect(res.body.vehicles[0].title).toBe("Annonce boostée");
  });

  it("une mise en avant EXPIRÉE ne remonte plus l'annonce (aucune tâche planifiée requise)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const expired = await createVehicleDoc({ owner: partner._id, title: "Boost terminé" });
    await createVehicleDoc({ owner: partner._id, title: "Annonce plus récente" });

    await Vehicle.findByIdAndUpdate(expired._id, {
      $set: { sponsoredUntil: new Date(Date.now() - 86400000), boostLevel: 4 },
    });

    const { req, res } = mockReqRes({ query: { limit: "10", search: "récente" } });
    await getVehicles(req, res);
    expect(res.body.vehicles[0].title).toBe("Annonce plus récente");
  });

  it("un palier supérieur passe devant un palier inférieur", async () => {
    const partner = await createUser({ role: "partenaire" });
    const petit = await createVehicleDoc({ owner: partner._id, title: "Boost 24h" });
    const grand = await createVehicleDoc({ owner: partner._id, title: "Boost international" });
    const dans7j = new Date(Date.now() + 7 * 86400000);

    await Vehicle.findByIdAndUpdate(petit._id, { $set: { sponsoredUntil: dans7j, boostLevel: 1 } });
    await Vehicle.findByIdAndUpdate(grand._id, { $set: { sponsoredUntil: dans7j, boostLevel: 4 } });

    const { req, res } = mockReqRes({ query: { limit: "10", search: "Boost" } });
    await getVehicles(req, res);
    expect(res.body.vehicles[0].title).toBe("Boost international");
  });
});
