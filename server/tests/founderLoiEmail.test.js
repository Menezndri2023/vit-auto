import { describe, it, expect, vi } from "vitest";

// sendViaEmail est mocké pour capturer le HTML réellement généré — sans ce
// mock, aucun email n'est réellement envoyé en test (SMTP/Resend non
// configurés, voir tests/setup.js), donc rien ne permettait de détecter que
// loiReadyTemplate/agreementReadyTemplate recevaient des paramètres mal
// nommés (companyName jamais rempli, bouton de signature cassé — bug réel
// signalé par un partenaire après approbation de son dossier).
const sendViaEmailMock = vi.fn().mockResolvedValue({ trackingId: "test" });
vi.mock("../services/communication/CommunicationService.js", () => ({
  sendViaEmail: (...args) => sendViaEmailMock(...args),
}));

describe("pdf.worker — email LOI/Accord prêts à signer", () => {
  it("le mail LOI contient le nom de l'entité (pas 'undefined') et un bouton pointant vers le vrai lien de signature", async () => {
    const { processPdfJob } = await import("../queue/workers/pdf.worker.js");
    sendViaEmailMock.mockClear();

    await processPdfJob({
      data: {
        type: "loi",
        sendEmail: true,
        data: {
          userId: "user123",
          partnerEmail: "partner@example.test",
          partnerName: "Jean Dupont",
          companyName: "Jean Dupont SARL",
          loiContent: "Contenu de test de la LOI",
          referenceNumber: "VA-FP-2026-999",
          signLink: "https://vit-auto.com/sign/abc123token",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    expect(sendViaEmailMock).toHaveBeenCalledTimes(1);
    const { html } = sendViaEmailMock.mock.calls[0][0];
    expect(html).toContain("Jean Dupont SARL");
    expect(html).not.toContain("undefined");
    expect(html).toContain('href="https://vit-auto.com/sign/abc123token"');
  });

  it("le mail LOI reste correct même sans companyName fourni (repli sur le nom du signataire)", async () => {
    const { processPdfJob } = await import("../queue/workers/pdf.worker.js");
    sendViaEmailMock.mockClear();

    await processPdfJob({
      data: {
        type: "loi",
        sendEmail: true,
        data: {
          userId: "user123",
          partnerEmail: "partner@example.test",
          partnerName: "Jean Dupont",
          loiContent: "Contenu de test",
          referenceNumber: "VA-FP-2026-998",
          signLink: "https://vit-auto.com/sign/def456token",
        },
      },
    });

    const { html } = sendViaEmailMock.mock.calls[0][0];
    expect(html).not.toContain("undefined");
    expect(html).toContain("Jean Dupont");
  });

  it("le mail Accord contient le nom de l'entité et un bouton pointant vers le vrai lien de signature", async () => {
    const { processPdfJob } = await import("../queue/workers/pdf.worker.js");
    sendViaEmailMock.mockClear();

    await processPdfJob({
      data: {
        type: "agreement",
        sendEmail: true,
        data: {
          userId: "user123",
          partnerEmail: "partner@example.test",
          partnerName: "Marie Export",
          companyName: "Marie Export SARL",
          agreementContent: "Contenu de test de l'accord",
          referenceNumber: "VA-FP-2026-997",
          signLink: "https://vit-auto.com/sign/ghi789token",
        },
      },
    });

    expect(sendViaEmailMock).toHaveBeenCalledTimes(1);
    const { html } = sendViaEmailMock.mock.calls[0][0];
    expect(html).toContain("Marie Export SARL");
    expect(html).not.toContain("undefined");
    expect(html).toContain('href="https://vit-auto.com/sign/ghi789token"');
  });
});
