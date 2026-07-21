import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";

// Requis par le contrôleur (server/controllers/authController.js oauthGoogle) :
// sans cette variable, la route répond 503 "non configurée" avant même de
// tenter de vérifier le jeton — voir tests/setup.js pour le pattern `||=`.
process.env.GOOGLE_OAUTH_CLIENT_ID ||= "test-google-client-id.apps.googleusercontent.com";

// google-auth-library n'est jamais appelé pour de vrai en test — seul
// `verifyIdToken` est mocké, reconfigurable par test (mockResolvedValueOnce /
// mockRejectedValueOnce). Doit être une "function" (pas une flèche) : le
// contrôleur instancie `new OAuth2Client(...)` (cf. pattern déjà utilisé pour
// @anthropic-ai/sdk dans tests/whatsappBot.test.js).
const mockVerifyIdToken = vi.fn();
vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(function OAuth2ClientMock() {
    return { verifyIdToken: mockVerifyIdToken };
  }),
}));

// server.js n'exporte `app` correctement qu'après que tests/setup.js ait
// positionné MONGO_URI dans son propre beforeAll (voir http.auth.test.js).
let app, User, createUser;
beforeAll(async () => {
  ({ default: app } = await import("../server.js"));
  ({ default: User } = await import("../models/User.js"));
  ({ createUser } = await import("./helpers/fixtures.js"));
});

beforeEach(() => {
  mockVerifyIdToken.mockReset();
});

const googlePayload = (overrides = {}) => ({
  sub:           `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  email:         `google.${Date.now()}.${Math.random().toString(36).slice(2)}@example.test`,
  email_verified: true,
  given_name:    "Nouvel",
  family_name:   "Utilisateur",
  picture:       "https://example.test/photo.jpg",
  ...overrides,
});

const mockGoogleSuccess = (payload) => {
  mockVerifyIdToken.mockResolvedValueOnce({ getPayload: () => payload });
};

const call = (body) => request(app).post("/api/auth/oauth/google").send({ credential: "fake-credential-token", ...body });

describe("POST /api/auth/oauth/google", () => {
  it("crée un compte quand aucun compte n'existe et que birthDate/country sont fournis (inscription)", async () => {
    const payload = googlePayload();
    mockGoogleSuccess(payload);

    const res = await call({ birthDate: "1990-01-01", country: "CI" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.email).toBe(payload.email);
    expect(res.body.user.password).toBeUndefined();

    const created = await User.findOne({ email: payload.email });
    expect(created.googleId).toBe(payload.sub);
    expect(created.authProvider).toBe("google");
    expect(created.emailVerified).toBe(true);
  });

  it("renvoie 400 si Google ne fournit pas d'e-mail", async () => {
    mockGoogleSuccess(googlePayload({ email: undefined }));
    const res = await call({ birthDate: "1990-01-01", country: "CI" });
    expect(res.status).toBe(400);
  });

  it("renvoie 404 OAUTH_NO_ACCOUNT si aucun compte et pas de birthDate (bouton sur /login)", async () => {
    mockGoogleSuccess(googlePayload());
    const res = await call({});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("OAUTH_NO_ACCOUNT");
  });

  it("refuse un mineur (< 18 ans) à la création de compte", async () => {
    mockGoogleSuccess(googlePayload());
    const res = await call({
      birthDate: new Date(Date.now() - 10 * 365.25 * 24 * 3600 * 1000).toISOString(),
      country: "CI",
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("MINOR_NOT_ALLOWED");
  });

  it("lie un compte mot de passe existant trouvé par e-mail, sans dupliquer", async () => {
    const existing = await createUser({ email: `existing.${Date.now()}@example.test`, emailVerified: false });
    mockGoogleSuccess(googlePayload({ email: existing.email }));

    const res = await call({});

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(existing.email);

    const linked = await User.findById(existing._id);
    expect(linked.googleId).toBeTruthy();
    expect(linked.emailVerified).toBe(true);

    const countMatching = await User.countDocuments({ email: existing.email });
    expect(countMatching).toBe(1);
  });

  it("connecte directement un compte déjà lié par googleId", async () => {
    const sub = `sub-${Date.now()}`;
    const existing = await createUser({ email: `linked.${Date.now()}@example.test`, googleId: sub, authProvider: "google" });
    mockGoogleSuccess(googlePayload({ email: existing.email, sub }));

    const res = await call({});

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(existing.email);
  });

  it("refuse un compte bloqué (isActive: false)", async () => {
    const sub = `sub-${Date.now()}`;
    const existing = await createUser({ email: `blocked.${Date.now()}@example.test`, googleId: sub, isActive: false });
    mockGoogleSuccess(googlePayload({ email: existing.email, sub }));

    const res = await call({});
    expect(res.status).toBe(403);
  });

  it("renvoie 401 si le jeton Google est invalide ou expiré", async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error("invalid token"));
    const res = await call({});
    expect(res.status).toBe(401);
  });

  it("renvoie un challenge 2FA sans émettre de tokens si le compte l'a activé", async () => {
    const sub = `sub-${Date.now()}`;
    const existing = await createUser({
      email: `twofa.${Date.now()}@example.test`,
      googleId: sub,
      twoFactor: { enabled: true, secret: "ABCDEFGH" },
    });
    mockGoogleSuccess(googlePayload({ email: existing.email, sub }));

    const res = await call({});

    expect(res.status).toBe(200);
    expect(res.body.requiresTwoFactor).toBe(true);
    expect(res.body.challengeToken).toBeTruthy();
    expect(res.body.token).toBeUndefined();
  });

  it("renvoie 503 si GOOGLE_OAUTH_CLIENT_ID n'est pas configuré", async () => {
    const original = process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    try {
      const res = await call({});
      expect(res.status).toBe(503);
    } finally {
      process.env.GOOGLE_OAUTH_CLIENT_ID = original;
    }
  });
});
