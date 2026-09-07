import { describe, it, expect, vi } from "vitest";
import { requireAdminScope, requireGeneralAdmin } from "../middleware/auth.js";
import { updateAdminScope, updateUserRole } from "../controllers/usersController.js";
import User from "../models/User.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Permissions admin (2026-09) — deux niveaux, et deux seulement :
//   1. ADMIN GÉNÉRAL  (adminScope contient "super_admin") : tout, y compris la
//      gestion des autres comptes admin ;
//   2. ADMIN À ACCÈS ASSIGNÉ : strictement limité aux domaines attribués.
// Un tableau de permissions VIDE ne donne plus accès à rien — auparavant il
// valait « accès complet », si bien qu'un compte promu admin devenait
// administrateur général par simple oubli, et que retirer sa dernière
// permission à un admin scopé lui rendait TOUS les droits.

const runMiddleware = (mw, user) => {
  const { req, res } = mockReqRes({ user });
  const next = vi.fn();
  mw(req, res, next);
  return { res, next };
};

describe("requireAdminScope — accès assigné", () => {
  it("laisse passer l'administrateur général sur n'importe quel domaine", () => {
    const general = { role: "admin", adminScope: ["super_admin"] };
    for (const scope of ["finance", "kyc", "bookings", "users", "catalogue", "partners"]) {
      const { next } = runMiddleware(requireAdminScope(scope), general);
      expect(next).toHaveBeenCalled();
    }
  });

  it("laisse passer un admin sur SON domaine et le refuse ailleurs", () => {
    const financier = { role: "admin", adminScope: ["finance"] };
    expect(runMiddleware(requireAdminScope("finance"), financier).next).toHaveBeenCalled();

    const refus = runMiddleware(requireAdminScope("bookings"), financier);
    expect(refus.next).not.toHaveBeenCalled();
    expect(refus.res.status).toHaveBeenCalledWith(403);
  });

  it("refuse un admin SANS aucune permission (le tableau vide ne donne plus accès à rien)", () => {
    const sansDroit = { role: "admin", adminScope: [] };
    const refus = runMiddleware(requireAdminScope("finance"), sansDroit);
    expect(refus.next).not.toHaveBeenCalled();
    expect(refus.res.status).toHaveBeenCalledWith(403);
  });

  it("refuse un non-admin, quel que soit son adminScope", () => {
    const faux = { role: "client", adminScope: ["super_admin"] };
    const refus = runMiddleware(requireAdminScope("finance"), faux);
    expect(refus.res.status).toHaveBeenCalledWith(403);
  });
});

describe("requireGeneralAdmin — réservé à l'admin général", () => {
  it("accepte l'admin général, refuse tout accès assigné", () => {
    expect(runMiddleware(requireGeneralAdmin, { role: "admin", adminScope: ["super_admin"] }).next).toHaveBeenCalled();

    for (const scope of [["finance"], ["users"], ["support", "moderation"], []]) {
      const refus = runMiddleware(requireGeneralAdmin, { role: "admin", adminScope: scope });
      expect(refus.next).not.toHaveBeenCalled();
      expect(refus.res.status).toHaveBeenCalledWith(403);
    }
  });
});

// Régression réelle (signalée : « l'admin général est vide, je ne vois rien ») :
// safeUser() ne renvoyait PAS adminScope — ni au login, ni sur /auth/me. Sans
// importance tant qu'un tableau vide valait « accès complet » ; mais depuis les
// permissions explicites, l'interface en déduisait « aucune permission » et
// masquait TOUS les onglets, y compris à l'administrateur général.
describe("safeUser — les permissions doivent atteindre l'interface", () => {
  it("renvoie adminScope pour un compte admin", async () => {
    const { getMe } = await import("../controllers/authController.js");
    const general = await createUser({ role: "admin", adminScope: ["super_admin"] });

    const { req, res } = mockReqRes({ user: general });
    await getMe(req, res);
    expect(res.body.user.adminScope).toEqual(["super_admin"]);
  });

  it("renvoie les domaines assignés d'un admin restreint", async () => {
    const { getMe } = await import("../controllers/authController.js");
    const scoped = await createUser({ role: "admin", adminScope: ["finance", "bookings"] });

    const { req, res } = mockReqRes({ user: scoped });
    await getMe(req, res);
    expect(res.body.user.adminScope).toEqual(["finance", "bookings"]);
  });

  it("n'expose pas adminScope à un compte non-admin", async () => {
    const { getMe } = await import("../controllers/authController.js");
    const client = await createUser({ role: "client" });

    const { req, res } = mockReqRes({ user: client });
    await getMe(req, res);
    expect(res.body.user.adminScope).toBeUndefined();
  });
});

describe("Gestion des comptes admin", () => {
  it("seul l'administrateur général peut modifier les permissions d'un autre admin", async () => {
    const general = await createUser({ role: "admin", adminScope: ["super_admin"] });
    const cible   = await createUser({ role: "admin", adminScope: ["finance"] });
    const scoped  = await createUser({ role: "admin", adminScope: ["users"] });

    const refus = mockReqRes({ user: scoped, params: { id: cible._id.toString() }, body: { scope: ["super_admin"] } });
    await updateAdminScope(refus.req, refus.res);
    expect(refus.res.status).toHaveBeenCalledWith(403);

    const ok = mockReqRes({ user: general, params: { id: cible._id.toString() }, body: { scope: ["finance", "bookings"] } });
    await updateAdminScope(ok.req, ok.res);
    expect(ok.res.body.adminScope).toEqual(["finance", "bookings"]);
  });

  it("refuse de retirer le statut au DERNIER administrateur général actif", async () => {
    const seul = await createUser({ role: "admin", adminScope: ["super_admin"] });
    await createUser({ role: "admin", adminScope: ["finance"] }); // ne compte pas comme filet

    const { req, res } = mockReqRes({ user: seul, params: { id: seul._id.toString() }, body: { scope: ["finance"] } });
    await updateAdminScope(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    const fresh = await User.findById(seul._id).select("adminScope");
    expect(fresh.adminScope).toContain("super_admin");
  });

  it("un compte promu admin part sans aucune permission (attribution explicite ensuite)", async () => {
    const general = await createUser({ role: "admin", adminScope: ["super_admin"] });
    const client  = await createUser({ role: "client" });

    const { req, res } = mockReqRes({ user: general, params: { id: client._id.toString() }, body: { role: "admin" } });
    await updateUserRole(req, res);

    const promu = await User.findById(client._id).select("role adminScope");
    expect(promu.role).toBe("admin");
    expect(promu.adminScope).toEqual([]); // aucun droit tant qu'aucun ne lui est assigné
  });

  it("un admin rétrogradé perd ses permissions", async () => {
    const general = await createUser({ role: "admin", adminScope: ["super_admin"] });
    const admin   = await createUser({ role: "admin", adminScope: ["finance", "bookings"] });

    const { req, res } = mockReqRes({ user: general, params: { id: admin._id.toString() }, body: { role: "client" } });
    await updateUserRole(req, res);

    const retrograde = await User.findById(admin._id).select("role adminScope");
    expect(retrograde.role).toBe("client");
    expect(retrograde.adminScope).toEqual([]);
  });

  it("un admin à accès assigné ne peut pas promouvoir un compte en admin", async () => {
    const scoped = await createUser({ role: "admin", adminScope: ["users"] });
    const client = await createUser({ role: "client" });

    const { req, res } = mockReqRes({ user: scoped, params: { id: client._id.toString() }, body: { role: "admin" } });
    await updateUserRole(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
