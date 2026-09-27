import { describe, it, expect } from "vitest";
import { createBooking, emettreBillet, scannerBillet } from "../controllers/bookingController.js";
import Booking from "../models/Booking.js";
import Subscription from "../models/Subscription.js";
import { nouveauJeton, refusDeScan, horsCreneau } from "../services/billetActivite.js";
import { createUser, createActivityDoc, donnerPalier } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ── Billet à QR code (2026-09-27) ──────────────────────────────────────────
//
// Fin des listes papier. Un litige de présence — « j'étais là », « non » — se
// tranche aujourd'hui parole contre parole, et le partenaire perd des deux
// côtés : il rembourse une place qu'il a tenue libre, ou il garde un client
// mécontent.
//
// ⚠️ La machine à états n'est PAS touchée. Six services la partagent et
// `confirmed → client_arrived` n'y est pas une transition valide : l'ouvrir
// pour les loisirs changerait le comportement des cinq autres.
const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };

async function seanceReservee({ date = "2027-05-01T09:00:00.000Z", participants = 2 } = {}) {
  // ⚠️ Depuis le 2026-09-27 l'immunité ne couvre plus les outils : émettre un
  // billet demande le palier Premium RÉEL du PARTENAIRE (c'est lui qui achète
  // l'outil, pas le client).
  const owner = await createUser({ role: "partenaire", isFounder: true });
  await donnerPalier(owner, "exportateur");
  const activity = await createActivityDoc({ owner: owner._id, price: 50, priceUnit: "per_person", capacity: 10 });
  const client = await createUser({ role: "client", emailVerified: true });
  const { req, res } = mockReqRes({
    user: client,
    body: { type: "activite", clientInfo, activityId: activity._id.toString(), activite: { date, participants } },
  });
  await createBooking(req, res);
  expect(res.statusCode).toBe(201);
  return { owner, activity, client, booking: await Booking.findById(res.body.booking._id) };
}

const emettre = async (user, booking, body = {}) => {
  const { req, res } = mockReqRes({ user, params: { id: booking._id.toString() }, body });
  await emettreBillet(req, res);
  return res;
};
const scanner = async (user, jeton) => {
  const { req, res } = mockReqRes({ user, body: { jeton } });
  await scannerBillet(req, res);
  return res;
};
const jetonDe = async (booking) => (await Booking.findById(booking._id)).activite.billet.jeton;

describe("Billet — le jeton", () => {
  it("chaque jeton est unique et long : une énumération n'a aucune chance", () => {
    const jetons = new Set(Array.from({ length: 200 }, () => nouveauJeton()));
    expect(jetons.size).toBe(200);
    expect([...jetons][0]).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("Billet — les refus", () => {
  it("un billet déjà présenté est refusé, et le dit avec son heure", () => {
    const scanneLe = new Date("2027-05-01T09:03:00.000Z");
    const refus = refusDeScan({ type: "activite", status: "confirmed", activite: { billet: { scanneLe } } });
    expect(refus.statut).toBe(409);
    expect(refus.dejaScanne).toBe(true);
  });

  it("une réservation annulée n'a plus de billet valable", () => {
    const refus = refusDeScan({ type: "activite", status: "cancelled", activite: { billet: {} } });
    expect(refus.statut).toBe(409);
    // Les deux refus se disent AUTREMENT l'un que l'autre : « déjà présenté »
    // et « annulé » n'appellent pas la même réaction du partenaire.
    expect(refus.dejaScanne).toBeUndefined();
  });

  it("un billet valable ne produit aucun refus", () => {
    expect(refusDeScan({ type: "activite", status: "confirmed", activite: { billet: { scanneLe: null } } })).toBeNull();
  });

  it("hors créneau INFORME, jamais ne refuse", () => {
    // Un groupe qui embarque la veille au soir, une sortie de deux jours :
    // poser une règle ici déciderait à la place de quelqu'un qui est sur place.
    const b = { activite: { date: new Date("2027-05-01T09:00:00.000Z") } };
    expect(horsCreneau(b, new Date("2027-05-01T18:00:00.000Z"))).toBe(false);
    expect(horsCreneau(b, new Date("2027-04-30T22:00:00.000Z"))).toBe(true);
  });
});

describe("Billet — émission et scan", () => {
  it("le client obtient son QR code, le partenaire le scanne une fois", async () => {
    const { owner, client, booking } = await seanceReservee();
    const emis = await emettre(client, booking);
    expect(emis.statusCode).toBe(200);
    expect(emis.body.qr).toMatch(/^data:image\/png;base64,/);
    expect(emis.body.participants).toBe(2);

    const scan = await scanner(owner, await jetonDe(booking));
    expect(scan.statusCode).toBe(200);
    expect(scan.body.valide).toBe(true);
    expect(scan.body.client).toBe("Jean Client");
    // La séance est en 2027 : le scan d'aujourd'hui est signalé hors créneau
    // sans être refusé.
    expect(scan.body.horsCreneau).toBe(true);
  });

  it("le même billet présenté deux fois est refusé, et la tentative est comptée", async () => {
    // C'est exactement le cas que l'outil doit attraper : la photo d'un QR
    // code passée à un ami.
    const { owner, client, booking } = await seanceReservee();
    await emettre(client, booking);
    const jeton = await jetonDe(booking);

    expect((await scanner(owner, jeton)).statusCode).toBe(200);
    const second = await scanner(owner, jeton);
    expect(second.statusCode).toBe(409);
    expect(second.body.scanneLe).toBeTruthy();

    expect((await Booking.findById(booking._id)).activite.billet.refus).toBe(1);
  });

  it("un billet déjà présenté ne se réémet pas : ce serait effacer la preuve", async () => {
    const { owner, client, booking } = await seanceReservee();
    await emettre(client, booking);
    await scanner(owner, await jetonDe(booking));
    const reemis = await emettre(client, booking, { reemettre: true });
    expect(reemis.statusCode).toBe(409);
  });

  it("réémettre révoque le billet précédent", async () => {
    // Le seul moyen de reprendre la main sur un billet transmis par erreur.
    const { owner, client, booking } = await seanceReservee();
    await emettre(client, booking);
    const ancien = await jetonDe(booking);
    await emettre(client, booking, { reemettre: true });
    const nouveau = await jetonDe(booking);

    expect(nouveau).not.toBe(ancien);
    expect((await scanner(owner, ancien)).statusCode).toBe(404);
    expect((await scanner(owner, nouveau)).statusCode).toBe(200);
  });

  it("le billet d'une réservation annulée n'est pas émis", async () => {
    const { client, booking } = await seanceReservee();
    await Booking.updateOne({ _id: booking._id }, { $set: { status: "cancelled" } });
    expect((await emettre(client, booking)).statusCode).toBe(409);
  });

  it("un jeton qui n'a pas la forme attendue est rejeté sans toucher la base", async () => {
    const { owner } = await seanceReservee();
    expect((await scanner(owner, "pas-un-jeton")).statusCode).toBe(400);
    expect((await scanner(owner, "a".repeat(64))).statusCode).toBe(404);
  });

  it("le scan ne déplace PAS le statut de la réservation", async () => {
    // Six services partagent la machine à états ; l'ouvrir pour les loisirs
    // changerait le comportement des cinq autres.
    const { owner, client, booking } = await seanceReservee();
    await emettre(client, booking);
    const avant = (await Booking.findById(booking._id)).status;
    await scanner(owner, await jetonDe(booking));
    expect((await Booking.findById(booking._id)).status).toBe(avant);
  });
});

describe("Billet — qui a le droit", () => {
  it("un partenaire étranger ne peut pas scanner le billet d'un confrère", async () => {
    const { client, booking } = await seanceReservee();
    await emettre(client, booking);
    const intrus = await createUser({ role: "partenaire" });
    const res = await scanner(intrus, await jetonDe(booking));
    expect(res.statusCode).toBe(403);
    // L'autorisation passe AVANT le verdict : sans cela, un concurrent
    // apprendrait qu'un billet existe et s'il a déjà servi.
    expect((await Booking.findById(booking._id)).activite.billet.scanneLe).toBeNull();
  });

  it("un tiers n'obtient pas le billet d'une séance qui ne le concerne pas", async () => {
    const { booking } = await seanceReservee();
    const intrus = await createUser({ role: "client", emailVerified: true });
    expect((await emettre(intrus, booking)).statusCode).toBe(403);
  });

  it("le partenaire peut émettre le billet de sa propre séance", async () => {
    const { owner, booking } = await seanceReservee();
    expect((await emettre(owner, booking)).statusCode).toBe(200);
  });
});

describe("Billet — verrou de palier", () => {
  // ⚠️ Ces tests avançaient l'horloge au-delà de l'immunité de lancement,
  // faute de quoi ils étaient verts sans rien vérifier. Décision de
  // l'exploitant du 2026-09-27 : le verrou des outils est actif maintenant.
  const seanceChezPartenaireOrdinaire = async () => {
    const owner = await createUser({ role: "partenaire" });
    const activity = await createActivityDoc({ owner: owner._id, price: 50, priceUnit: "per_person", capacity: 10 });
    const client = await createUser({ role: "client", emailVerified: true });
    const { req, res } = mockReqRes({
      user: client,
      body: { type: "activite", clientInfo, activityId: activity._id.toString(), activite: { date: "2027-12-01T09:00:00.000Z", participants: 2 } },
    });
    await createBooking(req, res);
    expect(res.statusCode).toBe(201);
    return { owner, client, booking: await Booking.findById(res.body.booking._id) };
  };

  it("sans le palier Premium, aucun billet n'est émis", async () => {
    const { client, booking } = await seanceChezPartenaireOrdinaire();
    const res = await emettre(client, booking);
    expect(res.statusCode).toBe(403);
    expect(res.body.feature).toBe("billetQrCode");
  });

  it("le palier lu est celui du PARTENAIRE, jamais celui du client", async () => {
    // Un client au palier gratuit chez un partenaire Premium obtient son
    // billet : c'est le partenaire qui achète l'outil, pas lui.
    const { owner, client, booking } = await seanceChezPartenaireOrdinaire();
    await donnerPalier(owner, "exportateur");
    expect((await emettre(client, booking)).statusCode).toBe(200);
  });

  it("scanner n'est PAS verrouillé : un billet déjà émis reste honoré", async () => {
    // Un partenaire redescendu d'abonnement laisserait sinon à la porte des
    // clients munis du QR code qu'il leur a lui-même envoyé. On émet donc AVEC
    // le palier, puis on le retire avant de scanner.
    const { owner, client, booking } = await seanceChezPartenaireOrdinaire();
    await donnerPalier(owner, "exportateur");
    await emettre(client, booking);
    const jeton = await jetonDe(booking);

    await Subscription.updateOne({ vendor: owner._id }, { $set: { plan: "free", "planDetails.isActive": false } });
    expect((await emettre(client, booking)).statusCode).toBe(403); // plus d'émission…
    expect((await scanner(owner, jeton)).statusCode).toBe(200);    // …mais le billet émis vaut toujours
  });
});
