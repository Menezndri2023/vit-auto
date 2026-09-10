import { describe, it, expect } from "vitest";
import { getVehicles, updateVehicle } from "../controllers/vehicleController.js";
import Vehicle from "../models/Vehicle.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Bug réel corrigé (audit) : featured/boostLevel/sponsoredUntil étaient déjà
// référencés partout (toggleFeatured admin, ADMIN_ONLY whitelist,
// HeroSection.jsx) mais jamais déclarés sur le schéma Vehicle — en mode
// strict (défaut Mongoose), toute écriture sur un chemin non déclaré est
// silencieusement ignorée. Le bouton "Mettre en vedette" de l'admin ne
// faisait donc RIEN, malgré une réponse 200 trompeuse. Le carousel/"Véhicules
// en vedette" doivent passer OBLIGATOIREMENT par une validation admin
// explicite (featured:true) — jamais par available/récence seuls.
//
// RÈGLE ASSOUPLIE le 2026-09-10, sur décision explicite : la vitrine ne doit
// plus dépendre d'une coche administrateur. Un administrateur qui ne coche rien
// laissait la page d'accueil vide, et un partenaire ne pouvait RIEN faire pour
// y figurer, quels que soient son abonnement et son travail. Le moteur de mise
// en avant (services/spotlightEngine.js) compose désormais tout seul :
// épinglage admin (facultatif) → boost acheté → place d'abonnement → mérite.
//
// Ce qui NE change pas, et que ces tests continuent de garder :
//   • seules des annonces DÉJÀ MODÉRÉES (status "approved", available) entrent
//     en vitrine — c'était la substance réelle du bug d'origine, où la récence
//     et la disponibilité seules suffisaient à exposer une annonce jamais
//     examinée ;
//   • `featured` reste un champ strictement administrateur : un partenaire ne
//     peut toujours pas s'auto-promouvoir ;
//   • une annonce épinglée par un administrateur figure toujours en vitrine.
describe("Vehicle.featured — épinglage admin et composition automatique", () => {
  it("l'admin peut réellement marquer une annonce comme mise en avant (persistance réelle)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const vehicle = await createVehicleDoc({ owner: partner._id, status: "approved" });

    const { req, res } = mockReqRes({
      user: admin, params: { id: vehicle._id.toString() },
      body: { featured: true },
    });
    await updateVehicle(req, res);
    expect(res.statusCode).toBe(200);

    const reloaded = await Vehicle.findById(vehicle._id);
    expect(reloaded.featured).toBe(true); // bug réel : restait `undefined` avant la correction du schéma
  });

  it("un partenaire ne peut PAS se marquer lui-même en vedette (champ réservé admin)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partner._id, status: "approved" });

    const { req, res } = mockReqRes({
      user: partner, params: { id: vehicle._id.toString() },
      body: { featured: true },
    });
    await updateVehicle(req, res);
    expect(res.statusCode).toBe(200);

    const reloaded = await Vehicle.findById(vehicle._id);
    expect(reloaded.featured).toBe(false); // ignoré — pas dans EDITABLE, seulement ADMIN_ONLY
  });

  it("GET /api/vehicles?featured=true n'expose JAMAIS une annonce non modérée", async () => {
    // Garantie de fond, et la seule que l'assouplissement ne touche pas : une
    // annonce en attente, refusée ou retirée ne doit sous aucun prétexte
    // atteindre la page la plus vue du site.
    const partner = await createUser({ role: "partenaire" });
    const publiee   = await createVehicleDoc({ owner: partner._id, status: "approved", available: true });
    const enAttente = await createVehicleDoc({ owner: partner._id, status: "pending",  available: true });
    const refusee   = await createVehicleDoc({ owner: partner._id, status: "rejected", available: true });
    const retiree   = await createVehicleDoc({ owner: partner._id, status: "approved", available: false });

    const { req, res } = mockReqRes({ query: { featured: "true" } });
    await getVehicles(req, res);
    expect(res.statusCode).toBe(200);

    const ids = res.body.vehicles.map((v) => v._id.toString());
    expect(ids).toContain(publiee._id.toString());
    for (const interdite of [enAttente, refusee, retiree]) {
      expect(ids, `${interdite.status} / available=${interdite.available}`).not.toContain(interdite._id.toString());
    }
  });

  it("GET /api/vehicles?featured=true se remplit SANS aucune coche admin", async () => {
    // Le défaut que l'assouplissement corrige : avant, cette réponse restait
    // vide tant qu'un administrateur n'avait rien coché — donc une page
    // d'accueil sans vitrine.
    const partner = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: partner._id, status: "approved", available: true, featured: false });
    await createVehicleDoc({ owner: partner._id, status: "approved", available: true }); // featured jamais touché

    const { req, res } = mockReqRes({ query: { featured: "true" } });
    await getVehicles(req, res);
    expect(res.body.vehicles).toHaveLength(2);
  });

  it("une annonce épinglée par un admin figure toujours dans la vitrine", async () => {
    // L'épinglage devient facultatif, il ne devient pas décoratif : il reste le
    // moyen d'imposer une annonce précise, même noyée parmi beaucoup d'autres.
    const partner = await createUser({ role: "partenaire" });
    const epinglee = await createVehicleDoc({ owner: partner._id, status: "approved", available: true, featured: true });
    for (let i = 0; i < 12; i++) {
      const autre = await createUser({ role: "partenaire" });
      await createVehicleDoc({ owner: autre._id, status: "approved", available: true });
    }

    const { req, res } = mockReqRes({ query: { featured: "true" } });
    await getVehicles(req, res);
    expect(res.body.vehicles.map((v) => v._id.toString())).toContain(epinglee._id.toString());
  });

  it("sans le paramètre featured, le catalogue normal reste inchangé (toutes les annonces approuvées)", async () => {
    const partner = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: partner._id, status: "approved", available: true, featured: true });
    await createVehicleDoc({ owner: partner._id, status: "approved", available: true, featured: false });

    const { req, res } = mockReqRes({ query: {} });
    await getVehicles(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.vehicles).toHaveLength(2); // les annonces approuvées restent naturellement dans le catalogue
  });
});
