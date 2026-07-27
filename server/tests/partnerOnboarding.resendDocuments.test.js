import { describe, it, expect, vi } from "vitest";

// sendEmail (le transport bas niveau) est mocké pour capturer le HTML final —
// contrairement à founderLoiEmail.test.js (qui mocke sendViaEmail parce que
// pdf.worker.js construit le HTML lui-même), le job "documents_ready_reminder"
// passe par email.worker.js → sendViaEmail({template, data}), où c'est
// sendViaEmail (CommunicationService.js) qui résout le template en HTML. Le
// mocker directement contournerait cette résolution et ne testerait rien.
const sendEmailMock = vi.fn().mockResolvedValue({ messageId: "test", provider: "console" });
vi.mock("../services/communication/channels/EmailChannel.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, sendEmail: (...args) => sendEmailMock(...args) };
});

const { adminResendDocuments } = await import("../controllers/partnerOnboardingController.js");
const { checkAndSendPartnerReminders } = await import("../utils/partnerReminders.js");
const PartnerOnboarding = (await import("../models/PartnerOnboarding.js")).default;
const PartnerBusiness = (await import("../models/PartnerBusiness.js")).default;
const { createUser, makeTestPartnerBusiness } = await import("./helpers/fixtures.js");
const { mockReqRes } = await import("./helpers/mockReqRes.js");

describe("adminResendDocuments", () => {
  it("400 si le dossier n'attend aucune signature", async () => {
    const partner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const doc = await PartnerOnboarding.create({ userId: partner._id, status: "soumis" });
    const { req, res } = mockReqRes({ user: admin, params: { id: doc._id.toString() } });
    await adminResendDocuments(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("régénère un token frais pour la LOI et envoie un seul email avec un lien valide", async () => {
    const partner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const doc = await PartnerOnboarding.create({
      userId: partner._id, status: "loi_envoyee", companyInfo: { legalName: "Alpha SARL" },
      loi: { content: "Contenu LOI", signingToken: "1".repeat(64), signingTokenExpires: new Date(Date.now() - 1000) }, // expiré
    });
    const { req, res } = mockReqRes({ user: admin, params: { id: doc._id.toString() } });
    await adminResendDocuments(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.signLink).toBeTruthy();

    const reloaded = await PartnerOnboarding.findById(doc._id);
    expect(reloaded.loi.signingToken).not.toBe("1".repeat(64)); // token régénéré
    expect(reloaded.loi.signingTokenExpires.getTime()).toBeGreaterThan(Date.now()); // repoussé dans le futur

    // Laisse le fallback synchrone (Redis indisponible en test) traiter le job.
    await new Promise((r) => setTimeout(r, 1500));
    expect(sendEmailMock).toHaveBeenCalled();
    const { html } = sendEmailMock.mock.calls.at(-1)[0];
    expect(html).not.toContain("undefined");
    expect(html).toContain(`href="${res.body.signLink}"`);
  });

  it("renvoie l'Accord (pas la LOI) quand le dossier est déjà à l'étape accord_envoye", async () => {
    const partner = await createUser({ role: "partenaire" });
    const admin = await createUser({ role: "admin" });
    const doc = await PartnerOnboarding.create({
      userId: partner._id, status: "accord_envoye", companyInfo: { legalName: "Beta SARL" },
      loi:       { content: "Contenu LOI", signedAt: new Date() },
      agreement: { content: "Contenu Accord", signingToken: "2".repeat(64), signingTokenExpires: new Date(Date.now() + 3600_000) },
    });
    const { req, res } = mockReqRes({ user: admin, params: { id: doc._id.toString() } });
    await adminResendDocuments(req, res);
    expect(res.statusCode).toBe(200);

    const reloaded = await PartnerOnboarding.findById(doc._id);
    expect(reloaded.agreement.signingToken).not.toBe("2".repeat(64));
    // La LOI, déjà signée, ne doit pas être régénérée par le renvoi de l'Accord.
    expect(reloaded.loi.signingToken).toBeFalsy();
  });
});

describe("checkAndSendPartnerReminders — relance dossier Founding Partner bloqué en signature", () => {
  it("relance un dossier loi_envoyee resté sans signature depuis plus de 3 jours", async () => {
    const partner = await createUser({ role: "partenaire" });
    const doc = await PartnerOnboarding.create({
      userId: partner._id, status: "loi_envoyee", companyInfo: { legalName: "Gamma SARL" },
      loi: { content: "Contenu LOI", signingToken: "3".repeat(64), signingTokenExpires: new Date(Date.now() - 1000) },
    });
    // Simule un dossier resté inactif depuis 4 jours (au-delà du délai de grâce de 3 jours).
    await PartnerOnboarding.updateOne({ _id: doc._id }, { $set: { updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) } });

    sendEmailMock.mockClear();
    const total = await checkAndSendPartnerReminders();
    expect(total).toBeGreaterThanOrEqual(1);

    const reloaded = await PartnerOnboarding.findById(doc._id);
    expect(reloaded.lastReminderSentAt).toBeTruthy();
    expect(reloaded.loi.signingToken).not.toBe("3".repeat(64)); // token régénéré, l'ancien pouvait être cassé/expiré
  });

  it("ne relance pas deux fois un dossier déjà relancé récemment (cooldown)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const doc = await PartnerOnboarding.create({
      userId: partner._id, status: "loi_envoyee", companyInfo: { legalName: "Delta SARL" },
      loi: { content: "Contenu LOI", signingToken: "4".repeat(64), signingTokenExpires: new Date(Date.now() + 3600_000) },
    });
    await PartnerOnboarding.updateOne({ _id: doc._id }, {
      $set: { updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), lastReminderSentAt: new Date() },
    });

    await checkAndSendPartnerReminders();
    const reloaded = await PartnerOnboarding.findById(doc._id);
    expect(reloaded.loi.signingToken).toBe("4".repeat(64)); // pas touché, cooldown actif
  });

  it("relance une entité partenaire n'ayant JAMAIS démarré de candidature Founding Partner (aucun PartnerOnboarding du tout)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const biz = await makeTestPartnerBusiness(partner._id, { companyName: "Epsilon Motors" });
    await PartnerBusiness.updateOne({ _id: biz._id }, { $set: { createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) } });

    const total = await checkAndSendPartnerReminders();
    expect(total).toBeGreaterThanOrEqual(1);

    const reloaded = await PartnerBusiness.findById(biz._id);
    expect(reloaded.lastReminderSentAt).toBeTruthy();
  });

  it("ne relance pas une entité qui a déjà un dossier Founding Partner (même brouillon)", async () => {
    const partner = await createUser({ role: "partenaire" });
    const biz = await makeTestPartnerBusiness(partner._id, { companyName: "Zeta Cars" });
    await PartnerBusiness.updateOne({ _id: biz._id }, { $set: { createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) } });
    await PartnerOnboarding.create({ userId: partner._id, businessId: biz._id, status: "brouillon", updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) });

    await checkAndSendPartnerReminders();
    const reloaded = await PartnerBusiness.findById(biz._id);
    expect(reloaded.lastReminderSentAt).toBeFalsy(); // c'est checkFoundingPartnerDrafts qui gère ce cas, pas celui-ci
  });

  it("ne relance jamais l'entité d'un client (role !== partenaire)", async () => {
    const client = await createUser({ role: "client" });
    const biz = await makeTestPartnerBusiness(client._id, { companyName: "Client Corp" });
    await PartnerBusiness.updateOne({ _id: biz._id }, { $set: { createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) } });

    await checkAndSendPartnerReminders();
    const reloaded = await PartnerBusiness.findById(biz._id);
    expect(reloaded.lastReminderSentAt).toBeFalsy();
  });
});
