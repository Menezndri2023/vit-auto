import { describe, it, expect } from "vitest";
import { purchaseBoost, getMySubscription } from "../controllers/subscriptionController.js";
import { PLAN_INCLUDED_BOOSTS, INCLUDED_BOOST_TIER, INCLUDED_BOOST_MARK } from "../constants/subscriptionPlans.js";
import Subscription from "../models/Subscription.js";
import Vehicle from "../models/Vehicle.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Mises en avant incluses dans l'abonnement.
//
// Un abonnement qui ne fait que réduire une commission ne se vend qu'aux
// partenaires à fort volume. Les mises en avant incluses donnent au partenaire
// quelque chose qu'il VOIT le jour même — et rien n'étant facturé, rien ne doit
// attendre une confirmation de paiement.

const demain = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

const abonne = async (plan) => {
  const partenaire = await createUser({ role: "partenaire" });
  await Subscription.create({
    vendor: partenaire._id, plan,
    planDetails: { startDate: new Date(), endDate: demain(), isActive: true, priceUSD: 19.99 },
  });
  return partenaire;
};

const demanderBoost = async (partenaire, vehicleId, tier = INCLUDED_BOOST_TIER) => {
  const { req, res } = mockReqRes({ user: partenaire, body: { vehicleId: String(vehicleId), tier } });
  await purchaseBoost(req, res);
  return res;
};

describe("Mises en avant incluses dans l'abonnement", () => {
  it("active immédiatement, sans passer par une confirmation de paiement", async () => {
    const partenaire = await abonne("business");
    const vehicule = await createVehicleDoc({ owner: partenaire._id });

    const res = await demanderBoost(partenaire, vehicule._id);

    expect(res.statusCode).toBe(201);
    const sub = await Subscription.findOne({ vendor: partenaire._id }).lean();
    expect(sub.boosts.at(-1).isActive, "incluse ⇒ active tout de suite").toBe(true);
    expect(sub.boosts.at(-1).priceUSD, "rien n'est facturé").toBe(0);
  });

  it("prend réellement effet sur l'annonce, pas seulement dans l'abonnement", async () => {
    // Le piège déjà rencontré : écrire le boost dans l'abonnement sans toucher
    // au véhicule ne change rien au catalogue.
    const partenaire = await abonne("business");
    const vehicule = await createVehicleDoc({ owner: partenaire._id });

    await demanderBoost(partenaire, vehicule._id);

    const v = await Vehicle.findById(vehicule._id).select("sponsoredUntil boostLevel").lean();
    expect(v.sponsoredUntil, "sans cette date, le tri du catalogue ignore le boost").toBeTruthy();
    expect(new Date(v.sponsoredUntil).getTime()).toBeGreaterThan(Date.now());
    expect(v.boostLevel).toBeGreaterThan(0);
  });

  it("épuise le quota du mois, puis repasse en demande payante", async () => {
    const partenaire = await abonne("individuel_plus");
    const quota = PLAN_INCLUDED_BOOSTS.individuel_plus;

    for (let i = 0; i < quota; i++) {
      const v = await createVehicleDoc({ owner: partenaire._id });
      const res = await demanderBoost(partenaire, v._id);
      expect(res.statusCode, `mise en avant ${i + 1} incluse`).toBe(201);
    }

    const vDeTrop = await createVehicleDoc({ owner: partenaire._id });
    const res = await demanderBoost(partenaire, vDeTrop._id);
    expect(res.statusCode, "quota épuisé ⇒ demande payante").toBe(202);
    const sub = await Subscription.findOne({ vendor: partenaire._id }).lean();
    expect(sub.boosts.at(-1).isActive).toBe(false);
  });

  it("un boost ACHETÉ n'entame jamais le quota inclus", async () => {
    // Sinon le partenaire paierait deux fois : une fois en espèces, une fois
    // en quota.
    const partenaire = await abonne("business");
    const v1 = await createVehicleDoc({ owner: partenaire._id });
    await demanderBoost(partenaire, v1._id, "30d"); // palier non inclus ⇒ payant

    const { req, res } = mockReqRes({ user: partenaire });
    await getMySubscription(req, res);
    expect(res.body.includedBoosts.utilises, "un boost payant ne consomme rien").toBe(0);
    expect(res.body.includedBoosts.restants).toBe(PLAN_INCLUDED_BOOSTS.business);
  });

  it("un compte gratuit n'a aucun quota", async () => {
    // Garde-fou : l'avantage doit rester réservé aux abonnés, sinon il ne vend
    // plus rien.
    const partenaire = await createUser({ role: "partenaire" });
    const vehicule = await createVehicleDoc({ owner: partenaire._id });

    const res = await demanderBoost(partenaire, vehicule._id);

    expect(res.statusCode, "sans abonnement, la demande reste payante").toBe(202);
  });

  it("un abonnement EXPIRÉ ne donne plus de quota", async () => {
    const partenaire = await createUser({ role: "partenaire" });
    await Subscription.create({
      vendor: partenaire._id, plan: "business",
      planDetails: { startDate: new Date(0), endDate: new Date(Date.now() - 1000), isActive: true, priceUSD: 19.99 },
    });
    const vehicule = await createVehicleDoc({ owner: partenaire._id });

    const res = await demanderBoost(partenaire, vehicule._id);
    expect(res.statusCode).toBe(202);
  });

  it("expose le quota restant au partenaire", async () => {
    const partenaire = await abonne("business");
    const v = await createVehicleDoc({ owner: partenaire._id });
    await demanderBoost(partenaire, v._id);

    const { req, res } = mockReqRes({ user: partenaire });
    await getMySubscription(req, res);

    expect(res.body.includedBoosts.total).toBe(PLAN_INCLUDED_BOOSTS.business);
    expect(res.body.includedBoosts.utilises).toBe(1);
    expect(res.body.includedBoosts.restants).toBe(PLAN_INCLUDED_BOOSTS.business - 1);
    expect(res.body.includedBoosts.tier).toBe(INCLUDED_BOOST_TIER);
    const sub = await Subscription.findOne({ vendor: partenaire._id }).lean();
    expect(sub.boosts.at(-1).promoCode).toBe(INCLUDED_BOOST_MARK);
  });
});
