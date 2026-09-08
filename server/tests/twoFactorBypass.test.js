import { describe, it, expect, vi } from "vitest";
import jwt from "jsonwebtoken";
import { authenticate } from "../middleware/auth.js";
import { createUser } from "./helpers/fixtures.js";

// Faille CRITIQUE (audit sécurité 2026-09) — CONTOURNEMENT COMPLET DU 2FA.
//
// Quand un compte a la double authentification activée, /auth/login ne délivre
// pas de session : il renvoie un « challengeToken » censé ne servir qu'à
// soumettre le code TOTP. Mais ce jeton était signé avec JWT_SECRET, la MÊME
// clé que les jetons d'accès, et `authenticate` ne regardait jamais son champ
// `purpose`. Il fonctionnait donc comme un jeton d'accès complet :
//
//   1. l'attaquant, en possession du seul mot de passe, appelle /auth/login ;
//   2. il reçoit le challengeToken sans avoir fourni le moindre code ;
//   3. il l'envoie en `Authorization: Bearer` sur n'importe quelle route
//      protégée et agit avec tous les droits de la victime pendant 10 minutes ;
//   4. il appelle /auth/2fa/disable — qui n'exige que le mot de passe, qu'il a
//      déjà — et désactive le second facteur définitivement.
//
// Le 2FA n'apportait donc aucune protection contre un mot de passe compromis,
// c'est-à-dire sa seule raison d'être. Ni `jti` ni `tokenVersion` n'étant
// présents dans ce jeton, il échappait aussi à la révocation et à
// l'invalidation par changement de mot de passe.

const runAuthenticate = async (token) => {
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = {
    statusCode: 200,
    status: vi.fn(function (c) { res.statusCode = c; return res; }),
    json: vi.fn(function (b) { res.body = b; return res; }),
  };
  const next = vi.fn();
  await authenticate(req, res, next);
  return { res, next, req };
};

describe("Jeton de challenge 2FA — ne doit JAMAIS valoir jeton d'accès", () => {
  it("refuse un challengeToken présenté comme jeton d'accès", async () => {
    const victime = await createUser({ role: "admin" });

    // Exactement le jeton émis par login quand le 2FA est actif.
    const challengeToken = jwt.sign(
      { id: victime._id, purpose: "2fa_challenge" },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    const { res, next } = await runAuthenticate(challengeToken);

    expect(next, "le challengeToken ne doit ouvrir AUCUNE route protégée").not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("refuse tout jeton porteur d'un `purpose`, quel qu'il soit", async () => {
    // Défense générale : un jeton à usage restreint (challenge, lien signé,
    // action ponctuelle…) ne doit jamais pouvoir servir de session, même si un
    // futur développement en introduit un nouveau type.
    const user = await createUser();
    for (const purpose of ["2fa_challenge", "email_link", "password_reset", "n_importe_quoi"]) {
      const token = jwt.sign({ id: user._id, purpose }, process.env.JWT_SECRET, { expiresIn: "10m" });
      const { res, next } = await runAuthenticate(token);
      expect(next, `un jeton « ${purpose} » ne doit pas authentifier`).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    }
  });

  it("accepte toujours un jeton d'accès normal (pas de régression)", async () => {
    const user = await createUser();
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role, tokenVersion: user.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const { res, next, req } = await runAuthenticate(token);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(401);
    expect(req.user._id.toString()).toBe(user._id.toString());
  });
});
