import { describe, it, expect } from "vitest";
import { createBooking } from "../controllers/bookingController.js";
import { computeIeCommission } from "../controllers/ieTransactionController.js";
import PricingConfig from "../models/PricingConfig.js";
import { DEFAULT_PRICING_CONFIG } from "../config/defaultPricingConfig.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// AUCUNE COMMISSION MINIMALE (décision provisoire de l'exploitant, 2026-10-28)
// ═══════════════════════════════════════════════════════════════════════════
// Commission = assiette × taux de la grille, arrondie au centime, sans
// plancher. Un minimum éventuel serait une décision explicite (catégories,
// montant, devise, exceptions, date d'effet) — voir docs/commissions.md.
// Le « frais de service » (serviceFee) est une ligne distincte, hors commission.

const FAKE_DOC_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };
const documents = { identity: { type: "cni", frontImage: FAKE_DOC_IMAGE }, license: { frontImage: FAKE_DOC_IMAGE } };

// Toute clé de la forme min*, plancher*, floor* dans une section de commission.
const clesPlancher = (o, chemin = "") => Object.entries(o || {}).flatMap(([k, v]) => {
  const ici = chemin ? `${chemin}.${k}` : k;
  const propre = /^(min|plancher|floor)/i.test(k) ? [ici] : [];
  return v && typeof v === "object" && !Array.isArray(v) ? [...propre, ...clesPlancher(v, ici)] : propre;
});

describe("Commission sans minimum caché", () => {
  it("la grille par défaut ne porte aucun plancher de commission", () => {
    expect(clesPlancher(DEFAULT_PRICING_CONFIG.commissions)).toEqual([]);
    expect(clesPlancher(DEFAULT_PRICING_CONFIG.foundingPartner)).toEqual([]);
  });

  it("une petite location paie exactement 10 % : 0,30 sur 3, pas un plancher", async () => {
    await PricingConfig.create({ ...DEFAULT_PRICING_CONFIG, key: "global" });
    const client = await createUser({ role: "client", emailVerified: true });
    const vehicle = await createVehicleDoc({ pricePerDay: 3 });
    const { req, res } = mockReqRes({ user: client, body: {
      type: "location", clientInfo, documents, vehicleId: vehicle._id.toString(),
      location: { days: 1, startDate: "2027-03-01", endDate: "2027-03-02" },
    } });
    await createBooking(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.booking.commissionRate).toBe(0.10);
    expect(res.body.booking.commissionAmount).toBe(0.3);
  });

  it("Import/Export : 3 % de la part exportateur, même pour un petit montant", async () => {
    await PricingConfig.create({ ...DEFAULT_PRICING_CONFIG, key: "global" });
    const p = await createUser({ role: "partenaire" });
    const r = await computeIeCommission({ partner: p._id, ventilation: { exportateur: 20 }, payment: {} });
    expect(r).toMatchObject({ rate: 0.03, amount: 0.6, base: 20, payoutAmount: 19.4 });
  });

  it("une assiette nulle donne une commission nulle, jamais un montant forfaitaire", async () => {
    const p = await createUser({ role: "partenaire" });
    const r = await computeIeCommission({ partner: p._id, ventilation: { exportateur: 0 }, payment: {} });
    expect(r.amount).toBe(0);
  });
});
