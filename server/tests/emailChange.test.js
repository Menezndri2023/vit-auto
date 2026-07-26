import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { requestEmailChange } from "../controllers/usersController.js";
import { confirmEmailChange } from "../controllers/authController.js";
import User from "../models/User.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const PASSWORD = "correct-horse-battery";
const withPassword = async (overrides = {}) =>
  createUser({ password: await bcrypt.hash(PASSWORD, 12), emailVerified: true, ...overrides });

describe("usersController.requestEmailChange", () => {
  it("refuse un mot de passe incorrect", async () => {
    const user = await withPassword();
    const { req, res } = mockReqRes({
      body: { newEmail: "nouveau@example.test", currentPassword: "wrong" },
      user,
    });
    await requestEmailChange(req, res);
    expect(res.statusCode).toBe(401);

    const reloaded = await User.findById(user._id);
    expect(reloaded.pendingEmail).toBeNull();
  });

  it("refuse une adresse déjà utilisée par un autre compte", async () => {
    const other = await createUser({ email: "deja-pris@example.test" });
    const user = await withPassword();
    const { req, res } = mockReqRes({
      body: { newEmail: other.email, currentPassword: PASSWORD },
      user,
    });
    await requestEmailChange(req, res);
    expect(res.statusCode).toBe(409);
  });

  it("refuse une adresse déjà en attente de confirmation pour un autre compte", async () => {
    const other = await withPassword();
    const first = mockReqRes({
      body: { newEmail: "convoitee@example.test", currentPassword: PASSWORD },
      user: other,
    });
    await requestEmailChange(first.req, first.res);
    expect(first.res.statusCode).toBe(200);

    const user = await withPassword();
    const { req, res } = mockReqRes({
      body: { newEmail: "convoitee@example.test", currentPassword: PASSWORD },
      user,
    });
    await requestEmailChange(req, res);
    expect(res.statusCode).toBe(409);
  });

  it("pose pendingEmail/token sans jamais toucher à l'email actuel", async () => {
    const user = await withPassword();
    const originalEmail = user.email;
    const { req, res } = mockReqRes({
      body: { newEmail: "nouveau@example.test", currentPassword: PASSWORD },
      user,
    });
    await requestEmailChange(req, res);
    expect(res.statusCode).toBe(200);

    const reloaded = await User.findById(user._id);
    expect(reloaded.email).toBe(originalEmail);
    expect(reloaded.pendingEmail).toBe("nouveau@example.test");
    expect(reloaded.pendingEmailToken).toBeTruthy();
    expect(reloaded.pendingEmailExpires).toBeTruthy();
  });
});

describe("authController.confirmEmailChange", () => {
  it("bascule l'email et réémet un token sur lien valide", async () => {
    const user = await withPassword();
    const { req: reqReq, res: reqRes } = mockReqRes({
      body: { newEmail: "confirme@example.test", currentPassword: PASSWORD },
      user,
    });
    await requestEmailChange(reqReq, reqRes);
    const { pendingEmailToken: token } = await User.findById(user._id);

    const { req, res } = mockReqRes({ params: { token } });
    await confirmEmailChange(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe("confirme@example.test");

    const reloaded = await User.findById(user._id);
    expect(reloaded.email).toBe("confirme@example.test");
    expect(reloaded.emailVerified).toBe(true);
    expect(reloaded.pendingEmail).toBeNull();
    expect(reloaded.pendingEmailToken).toBeNull();
    expect(reloaded.pendingEmailExpires).toBeNull();
  });

  it("rejette un token invalide ou expiré", async () => {
    const { req, res } = mockReqRes({ params: { token: "does-not-exist" } });
    await confirmEmailChange(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("n'affecte aucun autre utilisateur", async () => {
    const bystander = await withPassword({ email: "bystander@example.test" });
    const user = await withPassword();
    const { req: reqReq, res: reqRes } = mockReqRes({
      body: { newEmail: "confirme2@example.test", currentPassword: PASSWORD },
      user,
    });
    await requestEmailChange(reqReq, reqRes);
    const { pendingEmailToken: token } = await User.findById(user._id);

    const { req, res } = mockReqRes({ params: { token } });
    await confirmEmailChange(req, res);
    expect(res.statusCode).toBe(200);

    const reloadedBystander = await User.findById(bystander._id);
    expect(reloadedBystander.email).toBe("bystander@example.test");
  });
});
