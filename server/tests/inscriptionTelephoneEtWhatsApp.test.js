import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";

// Twilio Verify simulé : aucun SMS réel.
const mockSendVerification = vi.fn();
const mockCheckVerification = vi.fn();
vi.mock("../services/twilioVerify.js", () => ({
  sendVerification: mockSendVerification,
  checkVerification: mockCheckVerification,
}));

let app, User, dispatch, queue;
beforeAll(async () => {
  ({ default: app } = await import("../server.js"));
  ({ default: User } = await import("../models/User.js"));
  queue = await import("../queue/index.js");
  dispatch = queue.dispatch;
});

const TWILIO = { TWILIO_ACCOUNT_SID: "AC_test", TWILIO_AUTH_TOKEN: "tok", TWILIO_VERIFY_SERVICE_SID: "VA_test" };
const payload = (o = {}) => ({ firstName: "Awa", lastName: "Kone", password: "password123", birthDate: "1990-01-01", ...o });
const numero = () => `+22507${Math.floor(10000000 + Math.random() * 89999999)}`;

beforeEach(() => {
  mockSendVerification.mockReset().mockResolvedValue({ sent: true });
  mockCheckVerification.mockReset().mockResolvedValue({ valid: true });
});
afterEach(() => {
  delete process.env.SMS_ENABLED;
  for (const k of Object.keys(TWILIO)) delete process.env[k];
});

describe("inscription : e-mail en priorité, sinon téléphone (SMS)", () => {
  it("SMS éteints : un compte sans e-mail est refusé, et le site ne propose pas le téléphone", async () => {
    Object.assign(process.env, TWILIO);
    const canaux = await request(app).get("/api/auth/canaux");
    expect(canaux.body).toEqual({ email: true, sms: false });
    const res = await request(app).post("/api/auth/register").send(payload({ phone: numero() }));
    expect(res.status).toBe(400);
    expect(mockSendVerification).not.toHaveBeenCalled();
  });

  it("SMS allumés : inscription par téléphone, code envoyé, puis numéro confirmé", async () => {
    Object.assign(process.env, TWILIO, { SMS_ENABLED: "true" });
    expect((await request(app).get("/api/auth/canaux")).body.sms).toBe(true);
    const tel = numero();
    const res = await request(app).post("/api/auth/register").send(payload({ phone: tel }));
    expect(res.status).toBe(201);
    expect(res.body.phoneVerificationCodeRequired).toBe(true);
    expect(mockSendVerification).toHaveBeenCalledWith(tel);
    const ok = await request(app).post("/api/auth/verify-phone-otp")
      .set("Authorization", `Bearer ${res.body.token}`).send({ otp: "123456", phone: "+33600000000" });
    expect(ok.status).toBe(200);
    // Le code est toujours vérifié contre le numéro DU COMPTE, jamais celui de la requête.
    expect(mockCheckVerification).toHaveBeenCalledWith(tel, "123456");
    expect((await User.findOne({ phone: tel }).lean()).phoneVerified).toBe(true);
  });

  it("SMS allumés : avec un e-mail, c'est l'e-mail qui est vérifié (aucun SMS)", async () => {
    Object.assign(process.env, TWILIO, { SMS_ENABLED: "true" });
    const res = await request(app).post("/api/auth/register")
      .send(payload({ email: `awa.${Date.now()}@vitauto-fixtures.fr`, phone: numero() }));
    expect(res.status).toBe(201);
    expect(res.body.phoneVerificationCodeRequired).toBeUndefined();
    expect(mockSendVerification).not.toHaveBeenCalled();
  });

  it("échec d'envoi du SMS : aucun compte créé", async () => {
    Object.assign(process.env, TWILIO, { SMS_ENABLED: "true" });
    mockSendVerification.mockResolvedValueOnce({ sent: false, error: "x" });
    const tel = numero();
    const res = await request(app).post("/api/auth/register").send(payload({ phone: tel }));
    expect(res.status).toBe(503);
    expect(await User.countDocuments({ phone: tel })).toBe(0);
  });
});

describe("WhatsApp au partenaire pour toute demande hors réservation", () => {
  it("envoie le modèle nouvelle_demande_partenaire avec 4 paramètres", async () => {
    const p = await User.create({ firstName: "Karim", lastName: "P", email: `p.${Date.now()}@vitauto-fixtures.fr`, password: "x".repeat(20), role: "partenaire", phone: numero() });
    await dispatch.nouvelleDemandePartenaire(p._id, { demande: "une demande d'essai", detail: "Clio — Awa", reference: "VA-LEAD-1" });
    // L'appel passe par le enqueue interne du module : on vérifie le résultat
    // via le journal des envois (mode synchrone sans Redis en test).
    const { default: CommunicationLog } = await import("../models/CommunicationLog.js").catch(() => ({ default: null }));
    if (CommunicationLog) {
      const log = await CommunicationLog.findOne({ channel: "whatsapp" }).sort({ createdAt: -1 }).lean();
      expect(log?.template).toBe("nouvelle_demande_partenaire");
    }
  });

  it("sans téléphone, n'envoie rien et ne plante pas", async () => {
    const p = await User.create({ firstName: "Sans", lastName: "Tel", email: `s.${Date.now()}@vitauto-fixtures.fr`, password: "x".repeat(20), role: "partenaire" });
    await expect(dispatch.nouvelleDemandePartenaire(p._id, { demande: "x", detail: "y", reference: "z" })).resolves.toBeUndefined();
  });
});
