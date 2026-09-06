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

// Le hook post("save") est délibérément fire-and-forget (non attendu par
// Mongoose — voir Notification.js, sans quoi Notification.create() bloquerait
// tout appelant existant le temps du filet email). Un délai fixe pour
// "laisser le temps" est donc fragile sous charge (--maxWorkers) : on sonde
// plutôt jusqu'à ce que la condition soit vraie, avec un plafond généreux.
async function waitFor(predicate, { timeout = 3000, interval = 20 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  if (!predicate()) throw new Error(`waitFor: condition non remplie après ${timeout}ms`);
}

describe("Filet email pour les notifications internes/push", () => {
  it("Notification.create déclenche l'email générique par défaut", async () => {
    sendEmailMock.mockClear();
    const user = await createUser({ role: "client" });

    await Notification.create({
      user: user._id, type: "system", titre: "🚗 Test", message: "Un message de test.", channel: "internal",
    });
    await waitFor(() => sendEmailMock.mock.calls.length > 0);

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
    // Assertion négative : pas de condition à sonder, on laisse une marge
    // généreuse pour qu'un envoi (qui ne devrait pas arriver) ait eu le temps
    // de se produire s'il devait avoir lieu.
    await new Promise((r) => setTimeout(r, 500));

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sendInternal transmet bien skipEmail jusqu'au document Notification", async () => {
    sendEmailMock.mockClear();
    const user = await createUser({ role: "client" });

    await sendInternal({ userId: user._id.toString(), type: "system", titre: "Via sendInternal", message: "Corps", skipEmail: true });
    await new Promise((r) => setTimeout(r, 500));

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sendInternalBroadcast (insertMany) déclenche aussi l'email générique pour chaque destinataire", async () => {
    sendEmailMock.mockClear();
    const u1 = await createUser({ role: "partenaire", isActive: true });
    const u2 = await createUser({ role: "partenaire", isActive: true });

    await sendInternalBroadcast({ role: "partenaire", type: "system", titre: "Annonce", message: "Message diffusé à tous." });
    await waitFor(() => sendEmailMock.mock.calls.length >= 2);

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const recipients = sendEmailMock.mock.calls.map((c) => c[0].to).sort();
    expect(recipients).toEqual([u1.email, u2.email].sort());
  });

  it("sendInternalBroadcast avec skipEmail:true n'envoie aucun email", async () => {
    sendEmailMock.mockClear();
    await createUser({ role: "partenaire", isActive: true });

    await sendInternalBroadcast({ role: "partenaire", type: "system", titre: "Annonce", message: "Silencieux", skipEmail: true });
    await new Promise((r) => setTimeout(r, 500));

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  // Suggestion UX (2026-09) : Profile.jsx a déjà une case "Rappels par email"
  // (notif_emailReminders) persistée depuis longtemps, mais rien ne la
  // consultait jamais avant un envoi réel — bug réel corrigé en même temps
  // que ce filet.
  it("respecte notif_emailReminders:false (Notification.create)", async () => {
    sendEmailMock.mockClear();
    const user = await createUser({ role: "client", notif_emailReminders: false });

    await Notification.create({
      user: user._id, type: "system", titre: "Test", message: "Ne doit pas être emailé.", channel: "internal",
    });
    await new Promise((r) => setTimeout(r, 500));

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("respecte notif_emailReminders:false (sendInternalBroadcast)", async () => {
    sendEmailMock.mockClear();
    const optedOut = await createUser({ role: "partenaire", isActive: true, notif_emailReminders: false });
    const optedIn  = await createUser({ role: "partenaire", isActive: true });

    await sendInternalBroadcast({ role: "partenaire", type: "system", titre: "Annonce", message: "Message diffusé à tous." });
    await waitFor(() => sendEmailMock.mock.calls.length > 0);
    await new Promise((r) => setTimeout(r, 200)); // laisser une éventuelle 2e résolution arriver si elle devait

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe(optedIn.email);
    expect(sendEmailMock.mock.calls.some((c) => c[0].to === optedOut.email)).toBe(false);
  });
});
