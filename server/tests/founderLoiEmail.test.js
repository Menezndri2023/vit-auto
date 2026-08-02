import { describe, it, expect, vi } from "vitest";

// pdf.worker.js appelle désormais sendEmailOrThrow({template:"loi_ready", data})
// — c'est sendViaEmail (CommunicationService.js) qui résout le template en HTML
// avant de transmettre au transport bas niveau. Mocker sendViaEmail directement
// (comme ce test le faisait auparavant) contournait cette résolution : plus
// aucun HTML n'était jamais généré, rendant ce test structurellement incapable
// de détecter le bug qu'il prétend couvrir (companyName jamais rempli, bouton
// de signature cassé — signalé par un partenaire après approbation de son
// dossier). Même correctif que partnerOnboarding.resendDocuments.test.js :
// mocker sendEmail (le transport), pas sendViaEmail (la résolution de template).
const sendEmailMock = vi.fn().mockResolvedValue({ messageId: "test", provider: "console" });
vi.mock("../services/communication/channels/EmailChannel.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, sendEmail: (...args) => sendEmailMock(...args) };
});

describe("pdf.worker — email LOI/Accord prêts à signer", () => {
  it("le mail LOI contient le nom de l'entité (pas 'undefined') et un bouton pointant vers le vrai lien de signature", async () => {
    const { processPdfJob } = await import("../queue/workers/pdf.worker.js");
    sendEmailMock.mockClear();

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

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const { html } = sendEmailMock.mock.calls[0][0];
    expect(html).toContain("Jean Dupont SARL");
    expect(html).not.toContain("undefined");
    expect(html).toContain('href="https://vit-auto.com/sign/abc123token"');
  });

  it("le mail LOI reste correct même sans companyName fourni (repli sur le nom du signataire)", async () => {
    const { processPdfJob } = await import("../queue/workers/pdf.worker.js");
    sendEmailMock.mockClear();

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

    const { html } = sendEmailMock.mock.calls[0][0];
    expect(html).not.toContain("undefined");
    expect(html).toContain("Jean Dupont");
  });

  it("le mail Accord contient le nom de l'entité et un bouton pointant vers le vrai lien de signature", async () => {
    const { processPdfJob } = await import("../queue/workers/pdf.worker.js");
    sendEmailMock.mockClear();

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

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const { html } = sendEmailMock.mock.calls[0][0];
    expect(html).toContain("Marie Export SARL");
    expect(html).not.toContain("undefined");
    expect(html).toContain('href="https://vit-auto.com/sign/ghi789token"');
  });
});
