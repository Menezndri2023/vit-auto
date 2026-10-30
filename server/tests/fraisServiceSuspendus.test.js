import { describe, it, expect } from "vitest";
import { createBooking } from "../controllers/bookingController.js";
import { computeServiceFee, computeImportEstimateFee, fraisServiceAuReglement } from "../services/pricingEngine.js";
import PricingConfig from "../models/PricingConfig.js";
import { DEFAULT_PRICING_CONFIG } from "../config/defaultPricingConfig.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// FRAIS DE SERVICE SUSPENDUS (décision de l'exploitant, 2026-10-30)
// ═══════════════════════════════════════════════════════════════════════════
// Ni frais de réservation (0,5 %, plancher 1 $US), ni frais d'estimation
// Import/Export (3 %, plancher 333 $US) tant que nature, payeur, montant et
// conditions ne sont pas validés. Jamais cumulés automatiquement avec la
// commission. Barèmes conservés, inactifs.

const FAKE_DOC_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };
const documents = { identity: { type: "cni", frontImage: FAKE_DOC_IMAGE }, license: { frontImage: FAKE_DOC_IMAGE } };

// Document de production réel : barème présent, champ `actif` absent.
const configProduction = () => {
  const { actif: _a, ...fee } = DEFAULT_PRICING_CONFIG.serviceFee;
  const { actif: _b, ...imp } = DEFAULT_PRICING_CONFIG.importEstimateFee;
  return PricingConfig.collection.insertOne({ ...DEFAULT_PRICING_CONFIG, key: "global", serviceFee: fee, importEstimateFee: imp });
};

describe("Frais de service suspendus", () => {
  it("un document sans `actif` (la production) vaut suspendu : aucun frais, aucun plancher", async () => {
    await configProduction();
    expect(await computeServiceFee(50)).toBe(0);
    expect(await computeServiceFee(100000)).toBe(0);
    expect(await computeImportEstimateFee(20000)).toBe(0);
  });

  it("une location : reversement = total − commission, sans frais retenu", async () => {
    await configProduction();
    const client = await createUser({ role: "client", emailVerified: true });
    const vehicle = await createVehicleDoc({ pricePerDay: 100 });
    const { req, res } = mockReqRes({ user: client, body: {
      type: "location", clientInfo, documents, vehicleId: vehicle._id.toString(),
      location: { days: 2, startDate: "2027-04-01", endDate: "2027-04-03" },
    } });
    await createBooking(req, res);
    expect(res.statusCode).toBe(201);
    const b = res.body.booking;
    expect(b.serviceFeeFCFA).toBe(0);
    expect(b.partnerPayout).toBe(b.montantTotal - b.commissionAmount);
  });

  it("au règlement d'une réservation ancienne (1 $US figé), le frais n'est plus retenu", async () => {
    await configProduction();
    expect(await fraisServiceAuReglement({ serviceFeeFCFA: 1 })).toBe(0);
  });

  it("réactivation explicite seulement : `actif: true` restaure le barème", async () => {
    await PricingConfig.create({ ...DEFAULT_PRICING_CONFIG, key: "global", serviceFee: { ...DEFAULT_PRICING_CONFIG.serviceFee, actif: true } });
    expect(await computeServiceFee(50)).toBe(1);
    expect(await fraisServiceAuReglement({ serviceFeeFCFA: 1 })).toBe(1);
    expect(await computeImportEstimateFee(20000)).toBe(0);    // l'autre frais reste suspendu
  });
});
