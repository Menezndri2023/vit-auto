import { describe, it, expect } from "vitest";
import { getPartnerIEAnalytics } from "../controllers/ieTransactionController.js";
import { createUser, createIETransaction } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Un exportateur transigeant en plusieurs devises n'avait aucun total agrégé —
// chaque transaction n'affichait que sa propre devise isolément. Manque réel
// trouvé en audit.
describe("ieTransactionController.getPartnerIEAnalytics", () => {
  it("renvoie une liste vide sans transaction", async () => {
    const partner = await createUser({ isFounder: true });
    const { req, res } = mockReqRes({ user: partner });
    await getPartnerIEAnalytics(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.byCurrency).toEqual([]);
  });

  it("agrège les montants par devise, sans mélanger EUR et USD", async () => {
    const partner = await createUser({ isFounder: true });
    await createIETransaction({
      partner: partner._id, status: "in_escrow",
      payment: { amount: 10000, currency: "EUR" },
    });
    await createIETransaction({
      partner: partner._id, status: "in_escrow",
      payment: { amount: 5000, currency: "EUR" },
    });
    await createIETransaction({
      partner: partner._id, status: "funds_released",
      payment: { amount: 8000, currency: "USD", commission: { amount: 160, payoutAmount: 7840 } },
    });

    const { req, res } = mockReqRes({ user: partner });
    await getPartnerIEAnalytics(req, res);
    expect(res.statusCode).toBe(200);

    const eur = res.body.byCurrency.find((c) => c.currency === "EUR");
    const usd = res.body.byCurrency.find((c) => c.currency === "USD");
    expect(eur.count).toBe(2);
    expect(eur.totalAmount).toBe(15000);
    expect(eur.inEscrow).toBe(15000);
    expect(usd.count).toBe(1);
    expect(usd.totalPayout).toBe(7840);
  });

  it("ne renvoie que les transactions du partenaire connecté", async () => {
    const partner  = await createUser({ isFounder: true });
    const stranger = await createUser({ isFounder: true });
    await createIETransaction({ partner: stranger._id, payment: { amount: 9999, currency: "EUR" } });

    const { req, res } = mockReqRes({ user: partner });
    await getPartnerIEAnalytics(req, res);
    expect(res.body.byCurrency).toEqual([]);
  });
});
