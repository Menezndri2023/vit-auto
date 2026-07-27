import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { deactivateMyAccount } from "../controllers/usersController.js";
import { authenticate } from "../middleware/auth.js";
import User from "../models/User.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const PASSWORD = "correct-horse-battery";
const withPassword = async (overrides = {}) =>
  createUser({ password: await bcrypt.hash(PASSWORD, 12), emailVerified: true, ...overrides });

function signOldToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role, tokenVersion: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

describe("usersController.deactivateMyAccount", () => {
  it("refuse un mot de passe incorrect et laisse le compte actif", async () => {
    const user = await withPassword();
    const { req, res } = mockReqRes({ body: { password: "wrong" }, user });
    await deactivateMyAccount(req, res);
    expect(res.statusCode).toBe(401);

    const reloaded = await User.findById(user._id);
    expect(reloaded.isActive).toBe(true);
  });

  // Bug réel corrigé (audit) : un compte créé via Google a un mot de passe
  // aléatoire jamais connu de l'utilisateur — message dédié plutôt que
  // l'erreur générique "mot de passe incorrect" qui le piégeait sans recours
  // évident (mot de passe oublié).
  it("indique explicitement le contournement (mot de passe oublié) pour un compte Google", async () => {
    const user = await createUser({ authProvider: "google", password: await bcrypt.hash("random-unknown", 12) });
    const { req, res } = mockReqRes({ body: { password: "n-importe-quoi" }, user });
    await deactivateMyAccount(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe("GOOGLE_ACCOUNT_NO_PASSWORD");
  });

  it("désactive le compte, incrémente tokenVersion et vide refreshTokens", async () => {
    const user = await withPassword({ refreshTokens: ["some-old-hash"], tokenVersion: 1 });
    const oldToken = signOldToken(user);

    const { req, res } = mockReqRes({ body: { password: PASSWORD }, user });
    await deactivateMyAccount(req, res);
    expect(res.statusCode).toBe(200);
    // Contrairement à changePassword/logoutOtherSessions : aucun token n'est
    // réémis, la désactivation doit déconnecter, pas prolonger la session.
    expect(res.body.token).toBeUndefined();

    const reloaded = await User.findById(user._id);
    expect(reloaded.isActive).toBe(false);
    expect(reloaded.tokenVersion).toBe(2);
    expect(reloaded.refreshTokens).toEqual([]);

    // Le token émis avant la désactivation doit désormais être rejeté par le
    // middleware authenticate (via isActive, en défense en profondeur via
    // tokenVersion aussi si le compte était un jour réactivé).
    const authReq = { headers: { authorization: `Bearer ${oldToken}` } };
    const { res: authRes } = mockReqRes();
    let nextCalled = false;
    await authenticate(authReq, authRes, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(authRes.statusCode).toBe(403); // "Compte bloqué." — isActive:false
  });

  it("gère un compte déjà inactif sans erreur", async () => {
    const user = await withPassword({ isActive: false });
    const { req, res } = mockReqRes({ body: { password: PASSWORD }, user });
    await deactivateMyAccount(req, res);
    expect(res.statusCode).toBe(200);

    const reloaded = await User.findById(user._id);
    expect(reloaded.isActive).toBe(false);
  });

  it("crée une entrée d'audit", async () => {
    const user = await withPassword();
    const { req, res } = mockReqRes({ body: { password: PASSWORD }, user });
    await deactivateMyAccount(req, res);
    expect(res.statusCode).toBe(200);

    const AuditLog = (await import("../models/AuditLog.js")).default;
    const entry = await AuditLog.findOne({ action: "user.self_deactivate", resourceId: user._id.toString() });
    expect(entry).toBeTruthy();
  });
});
