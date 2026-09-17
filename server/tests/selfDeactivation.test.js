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

  // App Store 5.1.1 (v) : une désactivation « réversible via le support » est
  // explicitement insuffisante. Sans réservation, le compte est SUPPRIMÉ ; avec
  // des réservations (que les autres parties doivent garder), il est anonymisé
  // et rendu définitivement inutilisable.
  it("supprime le compte sans réservation, avec ses annonces non réservées", async () => {
    const Vehicle = (await import("../models/Vehicle.js")).default;
    const user = await withPassword({ role: "partenaire" });
    await Vehicle.create({ title: "Clio", type: "location", owner: user._id });

    const { req, res } = mockReqRes({ body: { password: PASSWORD }, user });
    await deactivateMyAccount(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeUndefined();
    expect(await User.findById(user._id)).toBeNull();
    expect(await Vehicle.countDocuments({ owner: user._id })).toBe(0);
  });

  it("anonymise et verrouille le compte qui a des réservations ; l'ancien jeton est rejeté ; l'e-mail est libéré", async () => {
    const Booking = (await import("../models/Booking.js")).default;
    const Vehicle = (await import("../models/Vehicle.js")).default;
    const user = await withPassword({ refreshTokens: ["some-old-hash"], tokenVersion: 1, phone: "+2250700000001", profilePhoto: "https://x/y.jpg",
      identity: { type: "passport", number: "P123", frontImage: "data:...", status: "verified" } });
    const owner = await createUser({ role: "partenaire" });
    const vehicle = await Vehicle.create({ title: "Corolla", type: "location", owner: owner._id });
    await Booking.create({ type: "location", client: user._id, vehicle: vehicle._id, clientInfo: { firstName: "A", lastName: "B", email: user.email, passportNumber: "P123" }, adminValidation: { status: "approved" } });
    const oldToken = signOldToken(user);
    const ancienEmail = user.email;

    const { req, res } = mockReqRes({ body: { password: PASSWORD }, user });
    await deactivateMyAccount(req, res);
    expect(res.statusCode).toBe(200);

    const reloaded = await User.findById(user._id);
    expect(reloaded).toBeTruthy();
    expect(reloaded.isActive).toBe(false);
    expect(reloaded.deletedAt).toBeTruthy();
    expect(reloaded.email).not.toBe(ancienEmail);
    expect(reloaded.phone).toBeNull();
    expect(reloaded.profilePhoto).toBeNull();
    expect(reloaded.identity.frontImage).toBeNull();
    expect(reloaded.identity.number).toBeNull();
    expect(reloaded.firstName).toBe("Compte");
    expect(reloaded.tokenVersion).toBe(2);
    expect(reloaded.refreshTokens).toEqual([]);
    // La réservation reste lisible par le partenaire
    expect(await Booking.countDocuments({ client: user._id })).toBe(1);

    const authReq = { headers: { authorization: `Bearer ${oldToken}` } };
    const { res: authRes } = mockReqRes();
    let nextCalled = false;
    await authenticate(authReq, authRes, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(authRes.statusCode).toBe(403);

    // Réinscription possible avec la même adresse
    const nouveau = await createUser({ email: ancienEmail });
    expect(nouveau._id.toString()).not.toBe(user._id.toString());
  });

  it("gère un compte déjà inactif sans erreur", async () => {
    const user = await withPassword({ isActive: false });
    const { req, res } = mockReqRes({ body: { password: PASSWORD }, user });
    await deactivateMyAccount(req, res);
    expect(res.statusCode).toBe(200);
    expect(await User.findById(user._id)).toBeNull();
  });

  it("crée une entrée d'audit", async () => {
    const user = await withPassword();
    const { req, res } = mockReqRes({ body: { password: PASSWORD }, user });
    await deactivateMyAccount(req, res);
    expect(res.statusCode).toBe(200);

    const AuditLog = (await import("../models/AuditLog.js")).default;
    const entry = await AuditLog.findOne({ action: "user.self_delete", resourceId: user._id.toString() });
    expect(entry).toBeTruthy();
  });
});
