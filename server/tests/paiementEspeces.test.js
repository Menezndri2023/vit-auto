import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { createBooking } from "../controllers/bookingController.js";
import { especesUniquement, TYPES_ESPECES_UNIQUEMENT } from "../constants/paiement.js";
import Payment from "../models/Payment.js";
import Booking from "../models/Booking.js";
import Activity from "../models/Activity.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Tant qu'aucun agrégateur de paiement n'est branché, les prestations rendues
// SUR PLACE se règlent en espèces auprès du partenaire. Encaisser en ligne sans
// prestataire réel — donc sans webhook signé — reviendrait à déclarer payées des
// réservations dont rien ne prouve qu'elles l'aient été.
//
// La règle couvrait la seule LOCATION. Les activités de loisir passaient à
// travers : l'écran de réservation proposait Orange Money par défaut et la carte
// bancaire, et le serveur enregistrait un paiement « pending » sans que rien ne
// soit encaissé.

const clientInfo = {
  firstName: "Awa", lastName: "Koné", email: "awa@exemple.test",
  phone: "+2250700000000", passportNumber: "CI1234567",
};

const demain = (n = 1) => new Date(Date.now() + n * 86400000);

const reserver = async (body) => {
  // Trois vérifications précèdent une réservation : e-mail ou téléphone
  // confirmé, identité vérifiée, et permis pour une location sans chauffeur.
  // Sans elles, le contrôleur répond 403 et le test n'atteindrait jamais la
  // règle de paiement qu'il veut éprouver.
  const client = await createUser({
    role: "client", emailVerified: true, kycStatus: "VERIFIE",
    // Permis exigé pour une location sans chauffeur (eligibilityEngine).
    driverLicenseOcr: { licenseNumber: "CI-2026-0001", isExpired: false },
  });
  const { req, res } = mockReqRes({ user: client, body });
  await createBooking(req, res);
  return res;
};

describe("Périmètre du règlement en espèces", () => {
  it("couvre location, activité et chauffeur — jamais l'essai ni le leasing", async () => {
    // L'essai est gratuit ; le leasing engage un financement dont le premier
    // versement ne se règle pas au comptoir.
    for (const t of ["location", "activite", "chauffeur"]) expect(especesUniquement(t), t).toBe(true);
    for (const t of ["essai", "leasing"]) expect(especesUniquement(t), t).toBe(false);
    expect(TYPES_ESPECES_UNIQUEMENT).toContain("activite");
  });

  it("l'interface n'affiche que ce que le serveur accepte", async () => {
    // Un écran qui propose la carte bancaire pendant que le serveur la refuse
    // produit un échec incompréhensible au moment de valider.
    const racine = path.join(process.cwd(), "..", "src");
    const miroir = fs.readFileSync(path.join(racine, "constants", "paiement.js"), "utf8");
    const serveur = fs.readFileSync(path.join(process.cwd(), "constants", "paiement.js"), "utf8");
    const extraire = (src) => src.match(/TYPES_ESPECES_UNIQUEMENT = \[([^\]]+)\]/)[1].replace(/\s|"/g, "");
    expect(extraire(miroir)).toBe(extraire(serveur));

    // Et les deux écrans de réservation s'appuient bien dessus.
    for (const f of ["Booking.jsx", "ActivityBooking.jsx"]) {
      expect(fs.readFileSync(path.join(racine, "pages", f), "utf8"), f).toMatch(/especesUniquement/);
    }
  });
});

describe("Réservation d'activité — aucun encaissement en ligne", () => {
  const activite = async () => {
    const partenaire = await createUser({ role: "partenaire" });
    return Activity.create({
      owner: partenaire._id, activityType: "QUAD", title: "Randonnée quad",
      price: 45, durationMinutes: 120, capacity: 4, ville: "Abidjan",
      status: "approved", available: true, images: ["q.jpg"],
    });
  };

  it("ignore une carte bancaire déclarée par le client et n'enregistre aucun paiement", async () => {
    // Le cas exact qui passait : une sortie en quad « payée par carte », sans
    // qu'aucun prestataire ne vérifie quoi que ce soit.
    const a = await activite();
    const res = await reserver({
      type: "activite", activityId: String(a._id), clientInfo,
      activite: { date: demain(3), participants: 2 },
      payment: { method: "card", cardLast4: "4242" },
    });

    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    const reservation = await Booking.findById(res.body.booking?._id ?? res.body._id).lean();
    expect(reservation).toBeTruthy();
    expect(await Payment.countDocuments({ booking: reservation._id })).toBe(0);
  });

  it("ignore aussi un mobile money déclaré", async () => {
    const a = await activite();
    const res = await reserver({
      type: "activite", activityId: String(a._id), clientInfo,
      activite: { date: demain(3), participants: 1 },
      payment: { method: "orange_money", mobileNumber: "+2250700000000" },
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    expect(await Payment.countDocuments()).toBe(0);
  });
});

describe("Réservation de location — inchangée", () => {
  it("n'enregistre toujours aucun paiement en ligne", async () => {
    const partenaire = await createUser({ role: "partenaire" });
    const v = await createVehicleDoc({ owner: partenaire._id, status: "approved", available: true });
    const res = await reserver({
      type: "location", vehicleId: String(v._id), clientInfo,
      location: { startDate: demain(2), endDate: demain(4), pickupMethod: "retrait" },
      payment: { method: "card", cardLast4: "4242" },
    });
    expect([200, 201], JSON.stringify(res.body)).toContain(res.statusCode);
    expect(await Payment.countDocuments()).toBe(0);
  });
});
