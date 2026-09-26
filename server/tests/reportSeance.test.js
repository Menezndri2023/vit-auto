import { describe, it, expect } from "vitest";
import { createBooking, proposerReportSeance, repondreReportSeance } from "../controllers/bookingController.js";
import Booking from "../models/Booking.js";
import { createUser, createActivityDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ── Report de séance (2026-09-26) ──────────────────────────────────────────
//
// Une sortie annulée pour météo ne rapporte rien : le client est remboursé, le
// partenaire a mobilisé matériel et équipe pour rien. Une sortie REPORTÉE se
// facture. Le partenaire propose, le client dispose — déplacer unilatéralement
// une séance payée reviendrait à confisquer le paiement.
//
// ⚠️ Aucune source météo automatique n'existe dans le produit, et en inventer
// une déciderait à la place du partenaire, qui est sur place. Le motif est
// déclaratif.
const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };

async function seanceReservee({ capacity = 10, participants = 2 } = {}) {
  const owner = await createUser({ role: "partenaire", isFounder: true });
  const activity = await createActivityDoc({ owner: owner._id, price: 50, priceUnit: "per_person", capacity, durationMinutes: 60 });
  const client = await createUser({ role: "client", emailVerified: true });
  const { req, res } = mockReqRes({
    user: client,
    body: {
      type: "activite", clientInfo, activityId: activity._id.toString(),
      activite: { date: "2027-05-01T09:00:00.000Z", participants },
    },
  });
  await createBooking(req, res);
  expect(res.statusCode).toBe(201);
  return { owner, activity, client, booking: await Booking.findById(res.body.booking._id) };
}

const proposer = async (user, booking, body) => {
  const { req, res } = mockReqRes({ user, params: { id: booking._id.toString() }, body });
  await proposerReportSeance(req, res);
  return res;
};
const repondre = async (user, booking, accepte) => {
  const { req, res } = mockReqRes({ user, params: { id: booking._id.toString() }, body: { accepte } });
  await repondreReportSeance(req, res);
  return res;
};

describe("Loisirs — report de séance", () => {
  it("le partenaire propose, le client accepte, la séance se déplace", async () => {
    const { owner, client, booking } = await seanceReservee();
    const prop = await proposer(owner, booking, { nouvelleDate: "2027-05-08T09:00:00.000Z", motif: "meteo", note: "Mer agitée" });
    expect(prop.statusCode).toBe(200);

    const rep = await repondre(client, booking, true);
    expect(rep.statusCode).toBe(200);

    const apres = await Booking.findById(booking._id).lean();
    expect(new Date(apres.activite.date).toISOString()).toBe("2027-05-08T09:00:00.000Z");
    expect(apres.activite.report.accepteLe).toBeTruthy();
    // La date d'origine est conservée : sans elle, plus personne ne sait
    // qu'il y a eu report, ni depuis quand.
    expect(new Date(apres.activite.report.dateInitiale).toISOString()).toBe("2027-05-01T09:00:00.000Z");
    // La séance n'est PAS annulée : le partenaire garde son revenu.
    expect(apres.status).not.toBe("cancelled");
  });

  it("un refus laisse la séance à sa date d'origine", async () => {
    const { owner, client, booking } = await seanceReservee();
    await proposer(owner, booking, { nouvelleDate: "2027-05-08T09:00:00.000Z", motif: "meteo" });
    const rep = await repondre(client, booking, false);
    expect(rep.statusCode).toBe(200);

    const apres = await Booking.findById(booking._id).lean();
    expect(new Date(apres.activite.date).toISOString()).toBe("2027-05-01T09:00:00.000Z");
    expect(apres.activite.report.refuseLe).toBeTruthy();
  });

  it("refuse un report qui dépasserait la capacité de la nouvelle date", async () => {
    // Sans ce contrôle, un report créerait le surbooking que la création
    // interdit — c'est le même calcul, partagé.
    const { owner, activity, booking } = await seanceReservee({ capacity: 4, participants: 2 });
    const autreClient = await createUser({ role: "client", emailVerified: true });
    const autre = mockReqRes({
      user: autreClient,
      body: {
        type: "activite", clientInfo, activityId: activity._id.toString(),
        activite: { date: "2027-05-08T09:00:00.000Z", participants: 3 },
      },
    });
    await createBooking(autre.req, autre.res);
    expect(autre.res.statusCode).toBe(201);

    // 3 places prises sur 4 : les 2 participants ne rentrent pas.
    const prop = await proposer(owner, booking, { nouvelleDate: "2027-05-08T09:00:00.000Z", motif: "meteo" });
    expect(prop.statusCode).toBe(409);
    expect(prop.res?.body?.message || prop.body.message).toMatch(/[Cc]apacité/);
  });

  it("refuse une date passée, un second report en attente, et un tiers", async () => {
    const { owner, booking } = await seanceReservee();

    const passee = await proposer(owner, booking, { nouvelleDate: "2020-01-01T09:00:00.000Z" });
    expect(passee.statusCode).toBe(400);

    const premier = await proposer(owner, booking, { nouvelleDate: "2027-05-08T09:00:00.000Z" });
    expect(premier.statusCode).toBe(200);
    const second = await proposer(owner, booking, { nouvelleDate: "2027-05-09T09:00:00.000Z" });
    expect(second.statusCode).toBe(409);

    const tiers = await createUser({ role: "partenaire" });
    const parTiers = await proposer(tiers, booking, { nouvelleDate: "2027-05-10T09:00:00.000Z" });
    expect(parTiers.statusCode).toBe(403);
  });

  it("le client ne peut répondre qu'à un report réellement en attente", async () => {
    const { client, booking } = await seanceReservee();
    const rep = await repondre(client, booking, true);
    expect(rep.statusCode).toBe(409);
  });
});
