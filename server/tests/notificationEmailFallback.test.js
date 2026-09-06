import { describe, it, expect, vi } from "vitest";

// Filet email (Booking Engine, 2026-09) : toute Notification créée déclenche
// aussi un email générique sauf skipEmail:true — voir models/Notification.js
// (hook post("save")) et services/communication/channels/InternalChannel.js
// (sendInternalBroadcast). Comme founderLoiEmail.test.js : on mocke sendEmail
// (le transport bas niveau), pas sendViaEmail, pour que la résolution réelle
// du template s'exécute et soit vérifiable.
const sendEmailMock = vi.fn().mockResolvedValue({ messageId: "test", provider: "console" });
vi.mock("../services/communication/channels/EmailChannel.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, sendEmail: (...args) => sendEmailMock(...args) };
});

const { default: Notification } = await import("../models/Notification.js");
const { sendInternal, sendInternalBroadcast } = await import("../services/communication/channels/InternalChannel.js");
const { createUser } = await import("./helpers/fixtures.js");

describe("Filet email pour les notifications internes/push", () => {
  it("Notification.create déclenche l'email générique par défaut", async () => {
    sendEmailMock.mockClear();
    const user = await createUser({ role: "client" });

    await Notification.create({
      user: user._id, type: "system", titre: "🚗 Test", message: "Un message de test.", channel: "internal",
    });
    // Le hook post("save") est asynchrone (best-effort) — laisser la microtask queue se vider.
    await new Promise((r) => setTimeout(r, 50));

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const [{ to, html }] = sendEmailMock.mock.calls[0];
    expect(to).toBe(user.email);
    expect(html).toContain("Un message de test.");
  });

  it("skipEmail:true supprime l'envoi de l'email générique", async () => {
    sendEmailMock.mockClear();
    const user = await createUser({ role: "client" });

    await Notification.create({
      user: user._id, type: "system", titre: "Test", message: "Ne doit pas être emailé.", channel: "internal", skipEmail: true,
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sendInternal transmet bien skipEmail jusqu'au document Notification", async () => {
    sendEmailMock.mockClear();
    const user = await createUser({ role: "client" });

    await sendInternal({ userId: user._id.toString(), type: "system", titre: "Via sendInternal", message: "Corps", skipEmail: true });
    await new Promise((r) => setTimeout(r, 50));

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sendInternalBroadcast (insertMany) déclenche aussi l'email générique pour chaque destinataire", async () => {
    sendEmailMock.mockClear();
    const u1 = await createUser({ role: "partenaire", isActive: true });
    const u2 = await createUser({ role: "partenaire", isActive: true });

    await sendInternalBroadcast({ role: "partenaire", type: "system", titre: "Annonce", message: "Message diffusé à tous." });
    await new Promise((r) => setTimeout(r, 50));

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const recipients = sendEmailMock.mock.calls.map((c) => c[0].to).sort();
    expect(recipients).toEqual([u1.email, u2.email].sort());
  });

  it("sendInternalBroadcast avec skipEmail:true n'envoie aucun email", async () => {
    sendEmailMock.mockClear();
    await createUser({ role: "partenaire", isActive: true });

    await sendInternalBroadcast({ role: "partenaire", type: "system", titre: "Annonce", message: "Silencieux", skipEmail: true });
    await new Promise((r) => setTimeout(r, 50));

    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
