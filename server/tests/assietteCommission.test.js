import { describe, it, expect } from "vitest";
import { createBooking, assietteCommission, ASSIETTE_REGLE } from "../controllers/bookingController.js";
import PricingConfig from "../models/PricingConfig.js";
import { DEFAULT_PRICING_CONFIG } from "../config/defaultPricingConfig.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// ASSIETTE DE LA COMMISSION — la prestation vendue par VIT AUTO
// ═══════════════════════════════════════════════════════════════════════════
// Exploitant, 2026-10-27 : la commission (location, chauffeur, loisirs) porte
// sur le prix de la prestation et les options fournies par VIT AUTO. Une
// option fournie par le partenaire (son assurance, son GPS) et la livraison,
// qu'il assure, n'y entrent pas. Une réservation antérieure à la règle garde
// sa commission sur le total.

const FAKE_DOC_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };
const bookingDocuments = { identity: { type: "cni", frontImage: FAKE_DOC_IMAGE }, license: { frontImage: FAKE_DOC_IMAGE } };

const reserver = async (vehicle, client, jours, options) => {
  const debut = new Date("2027-03-01T00:00:00.000Z");
  const fin = new Date(debut.getTime() + jours * 86400000);
  const { req, res } = mockReqRes({
    user: client,
    body: {
      type: "location", clientInfo, documents: bookingDocuments,
      vehicleId: vehicle._id.toString(),
      location: { days: jours, startDate: debut.toISOString().slice(0, 10), endDate: fin.toISOString().slice(0, 10), options },
    },
  });
  await createBooking(req, res);
  return res;
};

const config = (fournisseur = {}) => PricingConfig.create({
  ...DEFAULT_PRICING_CONFIG, key: "global",
  rentalOptionsFournisseur: { ...DEFAULT_PRICING_CONFIG.rentalOptionsFournisseur, ...fournisseur },
});

describe("Assiette de la commission — location", () => {
  it("options fournies par le partenaire : facturées au client, hors commission", async () => {
    await config();
    const client = await createUser({ role: "client", emailVerified: true });
    const vehicle = await createVehicleDoc({ pricePerDay: 100 });
    const res = await reserver(vehicle, client, 2, { gps: true, insurance: true });
    expect(res.statusCode).toBe(201);
    const b = res.body.booking;

    expect(b.montantBase).toBe(200);
    expect(b.montantOptions).toBeCloseTo((16.67 + 25) * 2, 2);   // tarif plateforme par défaut
    expect(b.montantOptionsVitAuto).toBe(0);
    expect(b.assietteRegle).toBe(ASSIETTE_REGLE);
    expect(b.commissionRate).toBe(0.10);
    expect(b.commissionAmount).toBe(20);                          // 10 % de 200, pas de 283,34
  });

  it("assurance fournie par VIT AUTO : entre dans l'assiette, le GPS du partenaire non", async () => {
    await config({ insurance: "vitauto" });
    const client = await createUser({ role: "client", emailVerified: true });
    const vehicle = await createVehicleDoc({ pricePerDay: 100 });
    const b = (await reserver(vehicle, client, 2, { gps: true, insurance: true })).body.booking;

    expect(b.montantOptionsVitAuto).toBe(50);
    expect(b.commissionAmount).toBe(25);                          // 10 % de (200 + 50)
  });
});

describe("assietteCommission — recalculs", () => {
  it("exclut la livraison et les options du partenaire, déduit la remise fidélité", () => {
    const b = {
      type: "location", assietteRegle: ASSIETTE_REGLE, montantBase: 300,
      montantOptions: 80, montantOptionsVitAuto: 30, loyaltyDiscount: 10, location: { deliveryFee: 15 },
    };
    const total = 300 + 80 + 15 - 10;
    expect(assietteCommission(b, total)).toBe(300 + 30 - 10);
  });

  it("une clôture admin à un autre montant ne retire que les parts du partenaire", () => {
    const b = { type: "location", assietteRegle: ASSIETTE_REGLE, montantOptions: 40, montantOptionsVitAuto: 0, location: { deliveryFee: 10 } };
    expect(assietteCommission(b, 250)).toBe(200);
    expect(assietteCommission(b, 20)).toBe(0);                     // jamais négative
  });

  it("une réservation antérieure à la règle garde sa commission sur le total", () => {
    const ancienne = { type: "location", montantOptions: 40, location: { deliveryFee: 10 } };
    expect(assietteCommission(ancienne, 250)).toBe(250);
  });

  it("les pièces gardent leur assiette : le prix des pièces seul", () => {
    expect(assietteCommission({ type: "piece", montantBase: 80 }, 115)).toBe(80);
  });
});
