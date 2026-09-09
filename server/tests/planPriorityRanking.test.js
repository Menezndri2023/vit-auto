import { describe, it, expect, beforeEach } from "vitest";
import { getVehicles } from "../controllers/vehicleController.js";
import { PLAN_RANK } from "../constants/subscriptionPlans.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";
import { cacheClear } from "../utils/catalogCache.js";

// « Classement prioritaire » est vendu sur la page Tarifs depuis l'origine.
// Le catalogue ne triait pourtant que sur les mises en avant ACHETÉES : un
// partenaire abonné payait pour une visibilité qu'il n'obtenait jamais.

const demain = () => new Date(Date.now() + 24 * 60 * 60 * 1000);
const hier   = () => new Date(Date.now() - 24 * 60 * 60 * 1000);
const attendreCache = () => new Promise((r) => setTimeout(r, 0));

const titres = async (query = {}) => {
  const { req, res } = mockReqRes({ query });
  await getVehicles(req, res);
  await attendreCache();
  return (res.body.vehicles || []).map((v) => v.title);
};

describe("Catalogue — classement prioritaire des abonnés", () => {
  // Le cache catalogue vit dans le processus, pas dans la base : sans purge, le
  // deuxième test recevrait la réponse mémorisée du premier (clé identique).
  beforeEach(() => cacheClear());

  it("place l'annonce d'un abonné devant celle d'un compte gratuit", async () => {
    const proprio = await createUser({ role: "partenaire" });
    // L'annonce gratuite est créée EN DERNIER : sans effet du plan, le tri par
    // date la mettrait en tête. C'est ce qui rend le test probant.
    await createVehicleDoc({ owner: proprio._id, title: "Abonné Business",
      ownerPlanRank: PLAN_RANK.business, ownerPlanUntil: demain() });
    await createVehicleDoc({ owner: proprio._id, title: "Compte gratuit" });

    expect(await titres()).toEqual(["Abonné Business", "Compte gratuit"]);
  });

  it("classe les paliers entre eux", async () => {
    const proprio = await createUser({ role: "partenaire" });
    // Le palier le plus élevé est créé EN PREMIER : le tri par date seul le
    // mettrait donc en DERNIER. Sans cette précaution, le test passerait même
    // sans le classement par abonnement.
    await createVehicleDoc({ owner: proprio._id, title: "Exportateur",
      ownerPlanRank: PLAN_RANK.exportateur, ownerPlanUntil: demain() });
    await createVehicleDoc({ owner: proprio._id, title: "Individuel Plus",
      ownerPlanRank: PLAN_RANK.individuel_plus, ownerPlanUntil: demain() });

    expect(await titres()).toEqual(["Exportateur", "Individuel Plus"]);
  });

  it("un abonnement expiré ne pèse plus rien, sans tâche planifiée", async () => {
    // La date est comparée AU MOMENT DU TRI : rien n'a besoin « d'éteindre »
    // un abonnement échu, ce qui compte puisque les planificateurs en mémoire
    // ne tournent pas quand le service est en veille.
    const proprio = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: proprio._id, title: "Abonnement échu",
      ownerPlanRank: PLAN_RANK.exportateur, ownerPlanUntil: hier() });
    await createVehicleDoc({ owner: proprio._id, title: "Publiée après" });

    expect(await titres()).toEqual(["Publiée après", "Abonnement échu"]);
  });

  it("une mise en avant achetée reste DEVANT un abonnement", async () => {
    // Sinon l'abonnement dévaloriserait le produit le plus cher.
    const proprio = await createUser({ role: "partenaire" });
    // Boost créé en premier : ni la date ni le rang d'abonnement ne le
    // remonteraient — seule la priorité du boost peut le placer en tête.
    await createVehicleDoc({ owner: proprio._id, title: "Boost payé",
      boostLevel: 1, sponsoredUntil: demain() });
    await createVehicleDoc({ owner: proprio._id, title: "Abonné Exportateur",
      ownerPlanRank: PLAN_RANK.exportateur, ownerPlanUntil: demain() });

    expect(await titres()).toEqual(["Boost payé", "Abonné Exportateur"]);
  });

  it("à rang égal, le tri par date le plus récent est conservé", async () => {
    const proprio = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: proprio._id, title: "Ancienne" });
    await createVehicleDoc({ owner: proprio._id, title: "Récente" });

    expect(await titres()).toEqual(["Récente", "Ancienne"]);
  });
});
