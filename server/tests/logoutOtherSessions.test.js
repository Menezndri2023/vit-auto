import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { logoutOtherSessions } from "../controllers/authController.js";
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

describe("authController.logoutOtherSessions", () => {
  it("incrémente tokenVersion, vide refreshTokens et réémet un token pour la session courante", async () => {
    const user = await withPassword({ refreshTokens: ["some-old-hash"], tokenVersion: 1 });
    const oldToken = signOldToken(user);

    const { req, res } = mockReqRes({ user });
    await logoutOtherSessions(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeTruthy();

    const reloaded = await User.findById(user._id);
    expect(reloaded.tokenVersion).toBe(2);
    expect(reloaded.refreshTokens).toEqual([]);
    expect(reloaded.isActive).toBe(true); // contrairement à deactivateMyAccount, le compte reste actif

    // L'ancien token (émis avant l'appel) doit être rejeté...
    const oldReq = { headers: { authorization: `Bearer ${oldToken}` } };
    const { res: oldRes } = mockReqRes();
    let oldNextCalled = false;
    await authenticate(oldReq, oldRes, () => { oldNextCalled = true; });
    expect(oldNextCalled).toBe(false);
    expect(oldRes.statusCode).toBe(401);

    // ...mais le NOUVEAU token renvoyé par la réponse doit rester valide (la
    // session courante ne doit pas se retrouver déconnectée par son propre appel).
    const newReq = { headers: { authorization: `Bearer ${res.body.token}` } };
    const { res: newRes } = mockReqRes();
    let newNextCalled = false;
    await authenticate(newReq, newRes, () => { newNextCalled = true; });
    expect(newNextCalled).toBe(true);
  });

  it("n'affecte pas les autres utilisateurs", async () => {
    const bystander = await withPassword({ tokenVersion: 5, refreshTokens: ["keep-me"] });
    const user = await withPassword();

    const { req, res } = mockReqRes({ user });
    await logoutOtherSessions(req, res);
    expect(res.statusCode).toBe(200);

    const reloadedBystander = await User.findById(bystander._id);
    expect(reloadedBystander.tokenVersion).toBe(5);
    expect(reloadedBystander.refreshTokens).toEqual(["keep-me"]);
  });
});
