import { describe, it, expect } from "vitest";
import { getPartnerInsights } from "../controllers/subscriptionController.js";
import Subscription from "../models/Subscription.js";
import Booking from "../models/Booking.js";
import Favorite from "../models/Favorite.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Statistiques de performance réservées aux abonnés.
//
// Le tableau de bord montrait de l'ARGENT — revenus, réservations, commissions.
// Utile, mais rétrospectif : cela ne dit pas POURQUOI une annonce ne part pas.
// Ces indicateurs sont diagnostiques (vues, conversion, prix face à la médiane
// de la ville) : c'est ce qui permet d'AGIR sur une annonce.

const abonne = async (plan = "business") => {
  const p = await createUser({ role: "partenaire" });
  await Subscription.create({
    vendor: p._id, plan,
    planDetails: { startDate: new Date(), endDate: new Date(Date.now() + 30 * 86400000), isActive: true, priceUSD: 19.99 },
  });
  return p;
};

// Booking exige les coordonnées du client — champ obligatoire au schéma.
const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean@exemple.test" };
const reserver = (vehicleId, clientId) =>
  Booking.create({ type: "location", vehicle: vehicleId, client: clientId, clientInfo, montantTotal: 100 });

const insights = async (user) => {
  const { req, res } = mockReqRes({ user });
  await getPartnerInsights(req, res);
  return res;
};

describe("Statistiques de performance partenaire", () => {
  it("refuse un compte sans abonnement, en disant ce qui l'en sépare", async () => {
    // Une réponse vide laisserait croire à une absence de données. Le partenaire
    // doit comprendre que la donnée existe et ce qui la débloque.
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "approved" });

    const res = await insights(p);

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("PLAN_REQUIS");
    expect(res.body.message).toMatch(/abonn/i);
  });

  it("refuse aussi un abonnement expiré", async () => {
    const p = await createUser({ role: "partenaire" });
    await Subscription.create({
      vendor: p._id, plan: "business",
      planDetails: { isActive: true, endDate: new Date(Date.now() - 1000), priceUSD: 19.99 },
    });

    expect((await insights(p)).statusCode).toBe(403);
  });

  it("calcule vues, réservations et taux de conversion", async () => {
    const p = await abonne();
    const v = await createVehicleDoc({ owner: p._id, status: "approved", ville: "Abidjan", pricePerDay: 50, vues: 200 });
    await reserver(v._id, p._id);
    await reserver(v._id, p._id);

    const res = await insights(p);

    const a = res.body.annonces[0];
    expect(a.vues).toBe(200);
    expect(a.reservations).toBe(2);
    expect(a.tauxConversion, "2 réservations sur 200 vues = 1 %").toBe(1);
  });

  it("laisse le taux à null tant qu'aucune vue n'est enregistrée", async () => {
    // Un taux de 0 % accuserait l'annonce de ne convaincre personne, alors
    // qu'elle n'a simplement pas encore été vue.
    const p = await abonne();
    await createVehicleDoc({ owner: p._id, status: "approved", vues: 0 });

    const res = await insights(p);

    expect(res.body.annonces[0].tauxConversion).toBeNull();
    expect(res.body.resume.jamaisVues).toBe(1);
  });

  it("compare le prix à la MÉDIANE de la ville, concurrents compris", async () => {
    // Se comparer à ses propres annonces n'apprend rien : la médiane porte sur
    // toutes les annonces publiées de la ville.
    const concurrent = await createUser({ role: "partenaire" });
    for (const prix of [40, 50, 60]) {
      await createVehicleDoc({ owner: concurrent._id, status: "approved", available: true, ville: "Abidjan", pricePerDay: prix });
    }
    const p = await abonne();
    await createVehicleDoc({ owner: p._id, status: "approved", available: true, ville: "Abidjan", pricePerDay: 75, vues: 10 });

    const res = await insights(p);
    const a = res.body.annonces.find((x) => x.prix === 75);

    expect(a.medianeVille, "médiane de 40/50/60/75").toBe(60);
    expect(a.ecartMediane, "75 contre 60 = +25 %").toBe(25);
  });

  it("ne désigne jamais une annonce jamais vue comme la moins performante", async () => {
    // L'accuser d'un problème de conversion serait faux : elle n'a pas eu sa
    // chance.
    const p = await abonne();
    await createVehicleDoc({ owner: p._id, status: "approved", title: "Jamais vue", vues: 0 });
    const vue = await createVehicleDoc({ owner: p._id, status: "approved", title: "Vue", vues: 100 });
    await reserver(vue._id, p._id);

    const res = await insights(p);

    expect(res.body.resume.aAmeliorer.titre).toBe("Vue");
    expect(res.body.resume.meilleure.titre).toBe("Vue");
  });

  it("répond sans erreur à un partenaire sans aucune annonce", async () => {
    const p = await abonne();
    const res = await insights(p);
    expect(res.body.annonces).toEqual([]);
    expect(res.body.resume).toBeNull();
  });

  it("se tait sur le prix tant que les vues ne le permettent pas", async () => {
    // Un diagnostic tiré de trois visites serait une invention. En dessous du
    // seuil, aucune recommandation de prix n'est émise, même sur une annonce
    // très au-dessus du marché.
    const concurrent = await createUser({ role: "partenaire" });
    for (const prix of [40, 50, 60]) {
      await createVehicleDoc({ owner: concurrent._id, status: "approved", available: true, ville: "Abidjan", pricePerDay: prix });
    }
    const p = await abonne();
    await createVehicleDoc({
      owner: p._id, status: "approved", available: true, ville: "Abidjan",
      pricePerDay: 200, vues: 3, images: ["a.jpg", "b.jpg"], description: "Un texte",
    });

    const res = await insights(p);
    const a = res.body.annonces.find((x) => x.prix === 200);

    expect(a.conseils, "trop peu de vues pour diagnostiquer quoi que ce soit").toEqual([]);
  });

  it("désigne le prix quand les vues le soutiennent", async () => {
    const concurrent = await createUser({ role: "partenaire" });
    for (const prix of [40, 50, 60]) {
      await createVehicleDoc({ owner: concurrent._id, status: "approved", available: true, ville: "Abidjan", pricePerDay: prix });
    }
    const p = await abonne();
    await createVehicleDoc({
      owner: p._id, status: "approved", available: true, ville: "Abidjan",
      pricePerDay: 200, vues: 150, images: ["a.jpg", "b.jpg"], description: "Un texte",
    });

    const res = await insights(p);
    const a = res.body.annonces.find((x) => x.prix === 200);

    expect(a.conseils.join(" ")).toMatch(/prix/i);
  });

  it("signale un intérêt réel bloqué ailleurs que sur l'annonce", async () => {
    // Beaucoup de favoris, aucune réservation : le véhicule plaît, l'obstacle
    // est la caution, la durée minimale ou la disponibilité.
    const p = await abonne();
    const v = await createVehicleDoc({
      owner: p._id, status: "approved", ville: "Abidjan", pricePerDay: 50,
      vues: 100, images: ["a.jpg", "b.jpg"], description: "Un texte",
    });
    for (let i = 0; i < 10; i++) {
      await Favorite.create({ user: (await createUser())._id, itemType: "vehicle", itemId: v._id });
    }

    const res = await insights(p);

    expect(res.body.annonces[0].favoris).toBe(10);
    expect(res.body.annonces[0].conseils.join(" ")).toMatch(/favori/i);
  });

  it("relève une annonce sans photo ni description, même sans audience", async () => {
    // Ces deux défauts n'ont pas besoin de statistiques pour être constatés —
    // ils expliquent justement l'absence d'audience.
    const p = await abonne();
    await createVehicleDoc({ owner: p._id, status: "approved", vues: 0, images: [], description: "" });

    const res = await insights(p);
    const conseils = res.body.annonces[0].conseils.join(" ");

    expect(conseils).toMatch(/photo/i);
    expect(conseils).toMatch(/description/i);
    expect(res.body.resume.aCorriger).toBe(1);
  });
});
