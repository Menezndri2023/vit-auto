import { describe, it, expect } from "vitest";
import { register } from "../controllers/authController.js";
import { accepterConsentements } from "../controllers/usersController.js";
import User from "../models/User.js";
import { VERSION_CONSENTEMENT } from "../constants/consentement.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Dossier CNDP (2026-10-10) : consentement EXPRÈS aux conditions et à
// l'hébergement hors du Maroc, recueilli et prouvé (date, version, IP).
let n = 0;
const inscrire = async (consentements) => {
  const { req, res } = mockReqRes({ body: {
    firstName: "Awa", lastName: "Koné", email: `c${++n}-${Date.now()}@vitauto-fixtures.fr`,
    password: "MotDePasse123", birthDate: "1990-01-01", ...(consentements ? { consentements } : {}),
  } });
  await register(req, res);
  return res;
};

describe("consentements", () => {
  it("l'inscription exige les deux accords", async () => {
    expect((await inscrire()).body.code).toBe("CONSENTEMENT_REQUIS");
    expect((await inscrire({ cgu: true, transfert: false })).body.code).toBe("CONSENTEMENT_REQUIS");
  });

  it("les accords sont enregistrés avec leur version et leur date", async () => {
    const res = await inscrire({ cgu: true, transfert: true });
    expect(res.body.user.consentementAJour).toBe(true);
    const u = await User.findById(res.body.user.id).lean();
    expect(u.consentements.version).toBe(VERSION_CONSENTEMENT);
    expect(u.consentements.transfertLe).toBeInstanceOf(Date);
  });

  it("un compte existant les donne depuis la fenêtre du site", async () => {
    const u = await createUser({ role: "client" });
    const refus = mockReqRes({ user: u, body: { consentements: { cgu: true } } });
    await accepterConsentements(refus.req, refus.res);
    expect(refus.res.status).toHaveBeenCalledWith(400);
    const ok = mockReqRes({ user: u, body: { consentements: { cgu: true, transfert: true } } });
    await accepterConsentements(ok.req, ok.res);
    expect((await User.findById(u._id).lean()).consentements.version).toBe(VERSION_CONSENTEMENT);
  });
});
