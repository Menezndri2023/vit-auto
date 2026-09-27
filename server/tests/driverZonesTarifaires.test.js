import { describe, it, expect } from "vitest";
import { createBooking } from "../controllers/bookingController.js";
import { updateDriver } from "../controllers/driverController.js";
import Driver from "../models/Driver.js";
import { createUser, createDriverDoc, donnerPalier } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ── Zones tarifaires chauffeur (2026-09-26) ────────────────────────────────
//
// Le chauffeur avait QUATRE tarifs (heure, demi-journée, journée, mois) et UNE
// zone, en texte libre. Un transfert aéroport était donc facturé comme une
// course intra-ville : il le refusait, ou le perdait. Premier outil du secteur
// au palier Essentiel, qui n'avait rien à vendre — planning et
// indisponibilités étant gratuits depuis toujours.
const IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };

const reserver = async (driver, chauffeur) => {
  const client = await createUser({ role: "client", emailVerified: true });
  const { req, res } = mockReqRes({
    user: client,
    body: {
      type: "chauffeur", clientInfo,
      documents: { identity: { type: "cni", frontImage: IMG } },
      driverId: driver._id.toString(),
      chauffeur,
    },
  });
  await createBooking(req, res);
  return res;
};

describe("Chauffeur — supplément par zone", () => {
  const avecZones = async (zones) => {
    // ⚠️ Depuis le 2026-09-27, définir des zones demande le palier Essentiel
    // RÉEL : l'immunité de lancement ne couvre plus les outils.
    const owner = await createUser({ role: "partenaire", isFounder: true });
    await donnerPalier(owner, "individuel_plus");
    await donnerPalier(owner, "individuel_plus");
    const driver = await createDriverDoc({ owner: owner._id, tarifHeure: 100 });
    await Driver.updateOne({ _id: driver._id }, { $set: { zonesTarifaires: zones } });
    return { owner, driver };
  };

  it("ajoute le supplément UNE fois, jamais multiplié par la durée", async () => {
    // C'est le déplacement qui coûte, pas le temps passé sur place.
    const { driver } = await avecZones([{ nom: "Aéroport", supplementUSD: 50 }]);
    const res = await reserver(driver, { date: "2027-03-01T09:00:00.000Z", heures: 4, zone: "Aéroport" });
    expect(res.statusCode).toBe(201);
    // 100 × 4 heures + 50 de supplément, et non 50 × 4.
    expect(res.body.booking.montantBase).toBe(450);
    expect(res.body.booking.chauffeur.zone).toBe("Aéroport");
    expect(res.body.booking.chauffeur.supplementZoneUSD).toBe(50);
  });

  it("sans zone demandée, le tarif ne change pas", async () => {
    const { driver } = await avecZones([{ nom: "Aéroport", supplementUSD: 50 }]);
    const res = await reserver(driver, { date: "2027-03-02T09:00:00.000Z", heures: 4 });
    expect(res.statusCode).toBe(201);
    expect(res.body.booking.montantBase).toBe(400);
    expect(res.body.booking.chauffeur.supplementZoneUSD).toBe(0);
  });

  it("une zone inconnue est ignorée, pas refusée", async () => {
    // Le client choisit dans une liste ; une zone retirée entre-temps ne doit
    // pas bloquer sa réservation.
    const { driver } = await avecZones([{ nom: "Aéroport", supplementUSD: 50 }]);
    const res = await reserver(driver, { date: "2027-03-03T09:00:00.000Z", heures: 2, zone: "Lune" });
    expect(res.statusCode).toBe(201);
    expect(res.body.booking.montantBase).toBe(200);
    expect(res.body.booking.chauffeur.zone).toBeNull();
  });

  it("la casse du nom de zone n'a pas d'importance", async () => {
    const { driver } = await avecZones([{ nom: "Aéroport", supplementUSD: 50 }]);
    const res = await reserver(driver, { date: "2027-03-04T09:00:00.000Z", heures: 1, zone: "aéroport" });
    expect(res.body.booking.chauffeur.supplementZoneUSD).toBe(50);
  });

  it("refuse deux zones de même nom, et une zone sans nom", async () => {
    const owner = await createUser({ role: "partenaire", isFounder: true });
    await donnerPalier(owner, "individuel_plus");
    const driver = await createDriverDoc({ owner: owner._id });

    const doublon = mockReqRes({ user: owner, params: { id: driver._id.toString() }, body: {
      zonesTarifaires: [{ nom: "Aéroport", supplementUSD: 10 }, { nom: "aeroport", supplementUSD: 20 }],
    } });
    await updateDriver(doublon.req, doublon.res);
    // « Aéroport » et « aeroport » diffèrent par l'accent : ce ne sont pas des
    // doublons pour la comparaison, mais deux zones distinctes. On vérifie le
    // vrai doublon juste après.
    const vraiDoublon = mockReqRes({ user: owner, params: { id: driver._id.toString() }, body: {
      zonesTarifaires: [{ nom: "Aéroport", supplementUSD: 10 }, { nom: "AÉROPORT", supplementUSD: 20 }],
    } });
    await updateDriver(vraiDoublon.req, vraiDoublon.res);
    expect(vraiDoublon.res.statusCode).toBe(400);

    const sansNom = mockReqRes({ user: owner, params: { id: driver._id.toString() }, body: {
      zonesTarifaires: [{ nom: "   ", supplementUSD: 10 }],
    } });
    await updateDriver(sansNom.req, sansNom.res);
    expect(sansNom.res.statusCode).toBe(400);
  });

  it("enregistre des zones valides et permet toujours de les retirer", async () => {
    const owner = await createUser({ role: "partenaire", isFounder: true });
    await donnerPalier(owner, "individuel_plus");
    const driver = await createDriverDoc({ owner: owner._id });

    const pose = mockReqRes({ user: owner, params: { id: driver._id.toString() }, body: {
      zonesTarifaires: [{ nom: "Aéroport", supplementUSD: 50 }, { nom: "Hors ville", supplementUSD: 25.5 }],
    } });
    await updateDriver(pose.req, pose.res);
    expect(pose.res.statusCode).toBe(200);
    expect((await Driver.findById(driver._id).lean()).zonesTarifaires).toHaveLength(2);

    // Retirer reste libre : on ne piège pas un partenaire dans une grille.
    const retrait = mockReqRes({ user: owner, params: { id: driver._id.toString() }, body: { zonesTarifaires: [] } });
    await updateDriver(retrait.req, retrait.res);
    expect(retrait.res.statusCode).toBe(200);
    expect((await Driver.findById(driver._id).lean()).zonesTarifaires).toHaveLength(0);
  });
});
