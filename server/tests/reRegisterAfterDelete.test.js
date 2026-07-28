import { describe, it, expect } from "vitest";
import { register } from "../controllers/authController.js";
import { deleteUser } from "../controllers/usersController.js";
import User from "../models/User.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const validPayload = (overrides = {}) => ({
  firstName: "Jean",
  lastName: "Testeur",
  email: `jean.${Date.now()}.${Math.random().toString(36).slice(2)}@example.test`,
  password: "password123",
  birthDate: "1990-01-01",
  ...overrides,
});

// deleteUser (admin) fait une suppression réelle (User.findByIdAndDelete),
// jamais un simple drapeau — une personne dont le compte a été supprimé par
// un admin doit donc pouvoir se réinscrire normalement avec le même email/
// téléphone, exactement comme un tout nouvel utilisateur. Aucun test
// n'exerçait ce scénario précis avant ce correctif (voir aussi le nouveau
// contrôle de doublon téléphone, absent jusqu'ici).
describe("Réinscription après suppression de compte par un admin", () => {
  it("un email redevient disponible après suppression du compte par un admin", async () => {
    const email = `reinscription.${Date.now()}@example.test`;
    const admin = await createUser({ role: "admin" });

    const first = mockReqRes({ body: validPayload({ email }) });
    await register(first.req, first.res);
    expect(first.res.statusCode).toBe(201);
    const firstUserId = first.res.body.user.id;

    const del = mockReqRes({ user: admin, params: { id: firstUserId } });
    await deleteUser(del.req, del.res);
    expect(del.res.statusCode).toBe(200);
    expect(await User.findById(firstUserId)).toBeNull();

    const second = mockReqRes({ body: validPayload({ email }) });
    await register(second.req, second.res);
    expect(second.res.statusCode).toBe(201);
    expect(second.res.body.user.email).toBe(email);
    expect(second.res.body.user.id).not.toBe(firstUserId); // nouveau compte, nouvel _id
  });

  it("un numéro de téléphone redevient disponible après suppression du compte par un admin", async () => {
    const phone = "+225 07 12 34 56 78";
    const admin = await createUser({ role: "admin" });

    const first = mockReqRes({ body: validPayload({ phone }) });
    await register(first.req, first.res);
    expect(first.res.statusCode).toBe(201);
    const firstUserId = first.res.body.user.id;

    const del = mockReqRes({ user: admin, params: { id: firstUserId } });
    await deleteUser(del.req, del.res);
    expect(del.res.statusCode).toBe(200);

    const second = mockReqRes({ body: validPayload({ phone }) });
    await register(second.req, second.res);
    expect(second.res.statusCode).toBe(201);
  });

  it("refuse toujours un email appartenant à un compte ENCORE actif (pas supprimé), avec un code exploitable par le frontend", async () => {
    const payload = validPayload();
    const first = mockReqRes({ body: payload });
    await register(first.req, first.res);
    expect(first.res.statusCode).toBe(201);

    const dup = mockReqRes({ body: validPayload({ email: payload.email }) });
    await register(dup.req, dup.res);
    expect(dup.res.statusCode).toBe(409);
    expect(dup.res.body.code).toBe("EMAIL_ALREADY_USED");
  });

  it("refuse un téléphone appartenant à un compte ENCORE actif, avec un 409 propre (pas un 500 générique)", async () => {
    const phone = "+225 01 02 03 04 05";
    const first = mockReqRes({ body: validPayload({ phone }) });
    await register(first.req, first.res);
    expect(first.res.statusCode).toBe(201);

    const dup = mockReqRes({ body: validPayload({ phone }) });
    await register(dup.req, dup.res);
    expect(dup.res.statusCode).toBe(409);
    expect(dup.res.body.code).toBe("PHONE_ALREADY_USED");
  });
});
