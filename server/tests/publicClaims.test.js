import { describe, it, expect } from "vitest";
import { getPublicStats } from "../controllers/vehicleController.js";
import { getShowcaseReviews } from "../controllers/reviewController.js";
import Review from "../models/Review.js";
import mongoose from "mongoose";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Allégations commerciales chiffrées — désormais adossées aux données réelles.
//
// La page d'accueil annonçait « 3 500+ véhicules », « 50 000+ utilisateurs
// satisfaits sur 5 continents » et « 4,9/5 sur 2 400+ avis vérifiés », tous
// écrits en dur. Les chiffres réels au moment du constat : 138 véhicules
// publiés, 29 comptes, 0 avis. « Avis vérifiés » est en outre une mention
// réglementée.
//
// Ces tests garantissent que les compteurs disent la vérité — en particulier
// qu'ils restent MODESTES quand les données le sont, car c'est précisément le
// cas où la tentation d'un chiffre décoratif revient.

const attendreCache = () => new Promise((r) => setTimeout(r, 0));

describe("Chiffres publics — GET /api/vehicles/public-stats", () => {
  it("ne compte que les annonces réellement publiées", async () => {
    const owner = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: owner._id, status: "approved", country: "MA" });
    await createVehicleDoc({ owner: owner._id, status: "approved", country: "MA" });
    await createVehicleDoc({ owner: owner._id, status: "pending",  country: "CI" });
    await createVehicleDoc({ owner: owner._id, status: "rejected", country: "SN" });

    const { req, res } = mockReqRes({});
    await getPublicStats(req, res);
    await attendreCache();

    expect(res.body.vehicles, "les annonces en attente ou rejetées ne comptent pas").toBe(2);
    expect(res.body.countries, "un seul pays a des annonces publiées").toBe(1);
  });

  it("ne renvoie AUCUNE note tant qu'il n'existe pas d'avis", async () => {
    // Le cas de départ réel — et celui où un « 4,9/5 » décoratif serait le plus
    // tentant.
    const { req, res } = mockReqRes({});
    await getPublicStats(req, res);

    expect(res.body.rating, "pas d'avis ⇒ pas de note inventée").toBeNull();
    expect(res.body.reviewCount).toBe(0);
  });
});

describe("Avis mis en avant — GET /api/reviews/showcase", () => {
  const creerAvis = async (over = {}) => {
    const auteur = await createUser({ firstName: "Awa", lastName: "Traoré", country: "CI" });
    return Review.create({
      // `booking` est requis par le schéma : un avis n'existe que rattaché à
      // une réservation réelle — la garantie même qui manquait aux témoignages
      // fabriqués que cette route remplace.
      booking: new mongoose.Types.ObjectId(),
      reviewer: auteur._id,
      targetType: "vehicle",
      targetId: auteur._id,       // cible indifférente pour cette route
      note: 5,
      commentaire: "Véhicule conforme, remise rapide.",
      visible: true,
      ...over,
    });
  };

  it("ne renvoie rien quand aucun avis n'existe — jamais de témoignage fabriqué", async () => {
    const { req, res } = mockReqRes({ query: {} });
    await getShowcaseReviews(req, res);
    expect(res.body.reviews).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("écarte les avis masqués par la modération", async () => {
    await creerAvis({ visible: false });
    const { req, res } = mockReqRes({ query: {} });
    await getShowcaseReviews(req, res);
    expect(res.body.reviews).toHaveLength(0);
  });

  it("écarte les avis sans commentaire et les notes basses", async () => {
    await creerAvis({ commentaire: "" });
    await creerAvis({ note: 2 });
    const { req, res } = mockReqRes({ query: {} });
    await getShowcaseReviews(req, res);
    expect(res.body.reviews).toHaveLength(0);
  });

  it("réduit le nom de famille à son initiale", async () => {
    await creerAvis();
    const { req, res } = mockReqRes({ query: {} });
    await getShowcaseReviews(req, res);

    expect(res.body.reviews).toHaveLength(1);
    const avis = res.body.reviews[0];
    expect(avis.auteur, "un avis public n'a pas à exposer l'identité complète").toBe("Awa T.");
    expect(JSON.stringify(avis)).not.toMatch(/Traoré/);
  });

  it("n'expose jamais les avis internes (plateforme, fiabilité client)", async () => {
    // getReviews les réserve déjà à l'admin ; cette route ne doit pas rouvrir
    // la porte par une autre entrée.
    await creerAvis({ targetType: "platform" });
    await creerAvis({ targetType: "client" });
    const { req, res } = mockReqRes({ query: {} });
    await getShowcaseReviews(req, res);
    expect(res.body.reviews).toHaveLength(0);
  });
});
