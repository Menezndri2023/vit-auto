import { describe, it, expect, vi, afterEach } from "vitest";

// PushChannel.js utilise FCM HTTP v1 (compte de service + OAuth2) depuis la
// migration 2026-09 — l'ancienne API "Legacy HTTP" (FCM_SERVER_KEY) est
// fermée par Google depuis mi-2024. On mocke google-auth-library (jamais de
// vrai appel réseau Google en test) et fetch (jamais de vrai appel FCM).
const getAccessTokenMock = vi.fn().mockResolvedValue({ token: "fake-access-token" });
const getClientMock = vi.fn().mockResolvedValue({ getAccessToken: getAccessTokenMock });
vi.mock("google-auth-library", () => ({
  GoogleAuth: vi.fn().mockImplementation(function () { return { getClient: getClientMock }; }),
}));

// PushChannel importe dynamiquement "node-fetch" (présent en dépendance
// transitive dans node_modules) avec repli sur globalThis.fetch s'il est
// absent — comme le module EST résolvable ici, il faut le mocker directement
// (stubGlobal("fetch", ...) serait ignoré, le vrai node-fetch prenant le dessus).
const nodeFetchMock = vi.fn();
vi.mock("node-fetch", () => ({ default: (...args) => nodeFetchMock(...args) }));

const { sendPush, isAvailable } = await import("../services/communication/channels/PushChannel.js");

const SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: "test@vit-auto.iam.gserviceaccount.com", private_key: "fake" });

describe("PushChannel (FCM HTTP v1)", () => {
  const originalProjectId = process.env.FIREBASE_PROJECT_ID;
  const originalServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  afterEach(() => {
    process.env.FIREBASE_PROJECT_ID = originalProjectId;
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = originalServiceAccount;
  });

  it("isAvailable() est false sans configuration", () => {
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    expect(isAvailable()).toBe(false);
  });

  it("sendPush ne fait rien (no-op) sans configuration", async () => {
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const result = await sendPush({ to: ["token1"], title: "Titre", body: "Corps" });
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("not_configured");
  });

  it("envoie un appel HTTP v1 par token avec le bon Bearer token", async () => {
    process.env.FIREBASE_PROJECT_ID = "vit-auto-test";
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = SERVICE_ACCOUNT_JSON;

    nodeFetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ name: "projects/vit-auto-test/messages/1" }) });

    const result = await sendPush({ to: ["token1", "token2"], title: "Réservation confirmée", body: "Votre location est confirmée." });

    expect(result.sent).toBe(true);
    expect(result.successCount).toBe(2);
    expect(result.failCount).toBe(0);
    expect(nodeFetchMock).toHaveBeenCalledTimes(2);

    const [url, options] = nodeFetchMock.mock.calls[0];
    expect(url).toBe("https://fcm.googleapis.com/v1/projects/vit-auto-test/messages:send");
    expect(options.headers.Authorization).toBe("Bearer fake-access-token");
    const body = JSON.parse(options.body);
    expect(body.message.token).toBe("token1");
    expect(body.message.notification.title).toBe("Réservation confirmée");
  });

  it("agrège correctement succès et échecs quand un token est invalide", async () => {
    process.env.FIREBASE_PROJECT_ID = "vit-auto-test";
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = SERVICE_ACCOUNT_JSON;

    nodeFetchMock.mockReset()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: { message: "Requested entity was not found." } }) });

    const result = await sendPush({ to: ["token-valide", "token-invalide"], title: "Titre", body: "Corps" });

    expect(result.sent).toBe(true); // au moins un succès
    expect(result.successCount).toBe(1);
    expect(result.failCount).toBe(1);
  });
});
