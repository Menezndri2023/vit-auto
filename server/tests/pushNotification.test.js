import { describe, it, expect, vi } from "vitest";
import { dispatch } from "../queue/index.js";
import User from "../models/User.js";
import { createUser } from "./helpers/fixtures.js";

// sendViaPush est mocké pour capturer ce qui serait réellement envoyé à FCM —
// sans ce mock, PushChannel.js retourne juste "not_configured" en test
// (FIREBASE_PROJECT_ID/FIREBASE_SERVICE_ACCOUNT_JSON absents en test), ce qui ne permettrait pas de vérifier que les bons
// tokens/titre/corps sont bien résolus et transmis.
const sendViaPushMock = vi.fn().mockResolvedValue({ sent: true, provider: "fcm" });
vi.mock("../services/communication/CommunicationService.js", () => ({
  sendViaPush: (...args) => sendViaPushMock(...args),
}));

describe("dispatch.pushNotification", () => {
  it("ne fait rien (no-op silencieux) si l'utilisateur n'a aucun appareil natif enregistré", async () => {
    sendViaPushMock.mockClear();
    const user = await createUser({ pushTokens: [] });

    await dispatch.pushNotification(user._id, "Titre", "Corps");

    expect(sendViaPushMock).not.toHaveBeenCalled();
  });

  it("résout les pushTokens de l'utilisateur et enqueue vers le canal push", async () => {
    sendViaPushMock.mockClear();
    const user = await createUser({ pushTokens: ["token-abc", "token-def"] });

    await dispatch.pushNotification(user._id, "Réservation confirmée", "Votre location a été confirmée.", { lien: "/dashboard", type: "success" });

    expect(sendViaPushMock).toHaveBeenCalledTimes(1);
    const payload = sendViaPushMock.mock.calls[0][0];
    expect(payload.to).toEqual(["token-abc", "token-def"]);
    expect(payload.title).toBe("Réservation confirmée");
    expect(payload.body).toBe("Votre location a été confirmée.");
    expect(payload.data).toEqual({ lien: "/dashboard", type: "success" });
  });

  it("ne fait rien si userId est absent", async () => {
    sendViaPushMock.mockClear();
    await dispatch.pushNotification(null, "Titre", "Corps");
    expect(sendViaPushMock).not.toHaveBeenCalled();
  });

  it("n'affecte pas les tokens d'un autre utilisateur", async () => {
    sendViaPushMock.mockClear();
    const other = await createUser({ pushTokens: ["autre-token"] });
    const user  = await createUser({ pushTokens: ["mon-token"] });

    await dispatch.pushNotification(user._id, "Titre", "Corps");

    expect(sendViaPushMock).toHaveBeenCalledTimes(1);
    expect(sendViaPushMock.mock.calls[0][0].to).toEqual(["mon-token"]);

    const reloadedOther = await User.findById(other._id).select("pushTokens").lean();
    expect(reloadedOther.pushTokens).toEqual(["autre-token"]);
  });
});
