import { describe, it, expect } from "vitest";
import CommunicationLog from "../models/CommunicationLog.js";
import { sendViaEmail } from "../services/communication/CommunicationService.js";

// Vu en production (2026-09-13) : 59 e-mails en 48 h vers des comptes de test
// (@example.com, *.local), tous refusés ou rebondis par Resend — chaque rebond
// pèse sur la réputation du domaine pour les vrais clients.
describe("E-mail vers un compte de test", () => {
  it("n'atteint jamais le fournisseur et reste visible comme « simulated »", async () => {
    const r = await sendViaEmail({ to: "sec-p-1@vit-auto-test.local", subject: "Test", html: "<p>x</p>" });
    expect(r).toMatchObject({ sent: true, simulated: true });
    const log = await CommunicationLog.findOne({ to: "sec-p-1@vit-auto-test.local" }).lean();
    expect(log.status).toBe("simulated");
    expect(log.context?.motif).toBe("compte de test");
  });

  it("laisse passer une adresse réelle vers le fournisseur (console en test)", async () => {
    const r = await sendViaEmail({ to: "client@vitauto-fixtures.fr", subject: "Test", html: "<p>x</p>" });
    expect(r.sent).toBe(true);
    expect(r.simulated).toBeUndefined();
  });
});
