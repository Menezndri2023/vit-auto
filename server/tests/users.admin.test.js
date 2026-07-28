import { describe, it, expect } from "vitest";
import {
  getUsers, getPublicProfile, updateUserRole, updateAdminScope,
  toggleUserActive, deleteUser, adminVerifyIdentity, updateMyProfile,
  adminUpdatePhone,
} from "../controllers/usersController.js";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

describe("getUsers — aucune fuite de champ sensible via .lean()", () => {
  it("exclut password/refreshTokens/identity images/tokens de la liste", async () => {
    await createUser({
      password: "hashed-secret",
      refreshTokens: ["some-hash"],
      identity: { frontImage: "data:img", backImage: "data:img", selfie: "data:img" },
      passwordResetToken: "reset-token",
      emailVerificationToken: "verify-token",
    });
    const { req, res } = mockReqRes({ query: {} });
    await getUsers(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.users).toHaveLength(1);
    const u = res.body.users[0];
    expect(u.password).toBeUndefined();
    expect(u.refreshTokens).toBeUndefined();
    expect(u.passwordResetToken).toBeUndefined();
    expect(u.emailVerificationToken).toBeUndefined();
    expect(u.identity?.frontImage).toBeUndefined();
    expect(u.identity?.backImage).toBeUndefined();
    expect(u.identity?.selfie).toBeUndefined();
  });

  it("filtre par rôle et recherche insensible à la casse", async () => {
    await createUser({ role: "partenaire", firstName: "Alpha", email: "alpha@example.test" });
    await createUser({ role: "client", firstName: "Beta", email: "beta@example.test" });

    const { req, res } = mockReqRes({ query: { role: "partenaire" } });
    await getUsers(req, res);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].firstName).toBe("Alpha");

    const { req: req2, res: res2 } = mockReqRes({ query: { search: "ALPHA" } });
    await getUsers(req2, res2);
    expect(res2.body.users).toHaveLength(1);
  });
});

describe("getPublicProfile", () => {
  it("404 pour un client (pas un partenaire/admin)", async () => {
    const client = await createUser({ role: "client" });
    const { req, res } = mockReqRes({ params: { id: client._id.toString() } });
    await getPublicProfile(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("404 pour un partenaire désactivé", async () => {
    const partner = await createUser({ role: "partenaire", isActive: false });
    const { req, res } = mockReqRes({ params: { id: partner._id.toString() } });
    await getPublicProfile(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("expose le profil d'un partenaire actif sans email ni rôle", async () => {
    const partner = await createUser({ role: "partenaire", isActive: true, phone: "+2250700000000" });
    const { req, res } = mockReqRes({ params: { id: partner._id.toString() } });
    await getPublicProfile(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.email).toBeUndefined();
    expect(res.body.role).toBeUndefined();
    expect(res.body.isActive).toBeUndefined();
    expect(res.body.phone).toBe("+2250700000000");
  });
});

describe("updateUserRole", () => {
  it("rejette un rôle invalide", async () => {
    const user = await createUser();
    const { req, res } = mockReqRes({ params: { id: user._id.toString() }, body: { role: "superadmin" } });
    await updateUserRole(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("change le rôle et journalise l'action dans AuditLog", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser({ role: "client" });
    const { req, res } = mockReqRes({
      user: admin, params: { id: target._id.toString() }, body: { role: "partenaire" },
    });
    await updateUserRole(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.user.role).toBe("partenaire");

    const logs = await AuditLog.find({ resourceId: target._id.toString(), action: "user.role_change" });
    expect(logs).toHaveLength(1);
    expect(logs[0].changes.before.role).toBe("client");
    expect(logs[0].changes.after.role).toBe("partenaire");
  });
});

// Bug réel corrigé (audit) : aucun formulaire n'exposait ce champ en écriture
// côté admin — un partenaire inscrit sans téléphone, ou avec un numéro faux,
// n'avait aucun moyen d'être corrigé par le support (affiché en lecture
// seule uniquement dans l'onglet Utilisateurs de AdminPanel.jsx).
describe("adminUpdatePhone", () => {
  it("renseigne un numéro et journalise l'action dans AuditLog", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser({ role: "partenaire", phone: null });
    const { req, res } = mockReqRes({ user: admin, params: { id: target._id.toString() }, body: { phone: "+225 07 00 00 00 01" } });
    await adminUpdatePhone(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.user.phone).toBe("+225 07 00 00 00 01");

    const logs = await AuditLog.find({ resourceId: target._id.toString(), action: "user.phone_change" });
    expect(logs).toHaveLength(1);
    expect(logs[0].changes.before.phone).toBeNull();
    expect(logs[0].changes.after.phone).toBe("+225 07 00 00 00 01");
  });

  it("réinitialise phoneVerified quand le numéro change réellement", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser({ role: "partenaire", phone: "+225000", phoneVerified: true });
    const { req, res } = mockReqRes({ user: admin, params: { id: target._id.toString() }, body: { phone: "+225111" } });
    await adminUpdatePhone(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.user.phoneVerified).toBe(false);
  });

  it("ne réinitialise pas phoneVerified si la valeur ne change pas réellement", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser({ role: "partenaire", phone: "+225000", phoneVerified: true });
    const { req, res } = mockReqRes({ user: admin, params: { id: target._id.toString() }, body: { phone: "+225000" } });
    await adminUpdatePhone(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.user.phoneVerified).toBe(true);
  });

  it("409 si le numéro est déjà utilisé par un autre compte", async () => {
    // L'index unique sparse sur `phone` n'est réellement actif qu'une fois sa
    // construction terminée (autoIndex est asynchrone, non bloquant pour les
    // écritures — voir server.js démarrage et le même correctif appliqué à
    // Invoice/CommissionLedger) : sans ce .init(), l'update ci-dessous peut
    // réussir dans un environnement de test tout frais où l'index n'a pas
    // encore fini de se construire.
    await User.init();
    const admin = await createUser({ role: "admin" });
    await createUser({ role: "client", phone: "+225999" });
    const target = await createUser({ role: "partenaire", phone: null });
    const { req, res } = mockReqRes({ user: admin, params: { id: target._id.toString() }, body: { phone: "+225999" } });
    await adminUpdatePhone(req, res);
    expect(res.statusCode).toBe(409);
  });

  it("refuse de retirer le seul moyen de connexion (téléphone sans email)", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser({ role: "partenaire", email: undefined, phone: "+225000" });
    const { req, res } = mockReqRes({ user: admin, params: { id: target._id.toString() }, body: { phone: "" } });
    await adminUpdatePhone(req, res);
    expect(res.statusCode).toBe(400);
    const reloaded = await User.findById(target._id);
    expect(reloaded.phone).toBe("+225000"); // inchangé
  });
});

describe("updateAdminScope", () => {
  it("rejette des permissions inconnues", async () => {
    const superAdmin = await createUser({ role: "admin", adminScope: ["super_admin"] });
    const target = await createUser({ role: "admin", adminScope: [] });
    const { req, res } = mockReqRes({
      user: superAdmin, params: { id: target._id.toString() }, body: { scope: ["not_a_scope"] },
    });
    await updateAdminScope(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("refuse de scoper un compte qui n'est pas admin", async () => {
    const superAdmin = await createUser({ role: "admin", adminScope: ["super_admin"] });
    const target = await createUser({ role: "client" });
    const { req, res } = mockReqRes({
      user: superAdmin, params: { id: target._id.toString() }, body: { scope: ["finance"] },
    });
    await updateAdminScope(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("un admin scopé non super_admin ne peut pas modifier les permissions d'autrui", async () => {
    const financeAdmin = await createUser({ role: "admin", adminScope: ["finance"] });
    const target = await createUser({ role: "admin", adminScope: [] });
    const { req, res } = mockReqRes({
      user: financeAdmin, params: { id: target._id.toString() }, body: { scope: ["super_admin"] },
    });
    await updateAdminScope(req, res);
    expect(res.statusCode).toBe(403);
  });

  // Faille réelle corrigée (audit) : retirer l'accès complet au DERNIER admin
  // qui l'avait encore rendait la plateforme impossible à administrer depuis
  // l'UI (updateAdminScope exige déjà un accès complet ou super_admin pour
  // modifier des scopes — plus personne n'aurait pu se le rendre).
  it("refuse de retirer l'accès complet au DERNIER admin qui l'a encore", async () => {
    const onlyFullAccessAdmin = await createUser({ role: "admin", adminScope: [] });
    const { req, res } = mockReqRes({
      user: onlyFullAccessAdmin, params: { id: onlyFullAccessAdmin._id.toString() }, body: { scope: ["kyc"] },
    });
    await updateAdminScope(req, res);
    expect(res.statusCode).toBe(400);
    const reloaded = await User.findById(onlyFullAccessAdmin._id);
    expect(reloaded.adminScope).toEqual([]); // inchangé
  });

  // Bug réel corrigé (audit) : le comptage des "autres admins à accès complet"
  // ne filtrait pas isActive — un admin à accès complet mais DÉSACTIVÉ
  // comptait quand même comme filet de sécurité valide, permettant de
  // verrouiller la plateforme en retirant l'accès complet au dernier admin
  // réellement actif.
  it("refuse de retirer l'accès complet si le SEUL autre admin à accès complet est désactivé", async () => {
    const target = await createUser({ role: "admin", adminScope: [] });
    await createUser({ role: "admin", adminScope: [], isActive: false });
    const { req, res } = mockReqRes({
      user: target, params: { id: target._id.toString() }, body: { scope: ["kyc"] },
    });
    await updateAdminScope(req, res);
    expect(res.statusCode).toBe(400);
    const reloaded = await User.findById(target._id);
    expect(reloaded.adminScope).toEqual([]); // inchangé
  });

  it("autorise de restreindre un admin à accès complet s'il en reste un AUTRE", async () => {
    const admin1 = await createUser({ role: "admin", adminScope: [] });
    const admin2 = await createUser({ role: "admin", adminScope: [] });
    const { req, res } = mockReqRes({
      user: admin1, params: { id: admin2._id.toString() }, body: { scope: ["kyc"] },
    });
    await updateAdminScope(req, res);
    expect(res.statusCode).toBe(200);
  });

  it("un admin non scopé (adminScope=[], accès complet historique) peut modifier les permissions", async () => {
    const legacyAdmin = await createUser({ role: "admin", adminScope: [] });
    const target = await createUser({ role: "admin", adminScope: [] });
    const { req, res } = mockReqRes({
      user: legacyAdmin, params: { id: target._id.toString() }, body: { scope: ["kyc", "support"] },
    });
    await updateAdminScope(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.adminScope).toEqual(["kyc", "support"]);
  });

  it("un super_admin peut modifier les permissions d'un autre admin", async () => {
    const superAdmin = await createUser({ role: "admin", adminScope: ["super_admin"] });
    const target = await createUser({ role: "admin", adminScope: ["finance"] });
    const { req, res } = mockReqRes({
      user: superAdmin, params: { id: target._id.toString() }, body: { scope: ["moderation"] },
    });
    await updateAdminScope(req, res);
    expect(res.statusCode).toBe(200);
    const reloaded = await User.findById(target._id);
    expect(reloaded.adminScope).toEqual(["moderation"]);
  });
});

describe("toggleUserActive / deleteUser", () => {
  it("bascule isActive à chaque appel", async () => {
    const user = await createUser({ isActive: true });
    const { req, res } = mockReqRes({ params: { id: user._id.toString() } });
    await toggleUserActive(req, res);
    expect(res.body.user.isActive).toBe(false);

    const { req: req2, res: res2 } = mockReqRes({ params: { id: user._id.toString() } });
    await toggleUserActive(req2, res2);
    expect(res2.body.user.isActive).toBe(true);
  });

  it("refuse de supprimer un compte admin", async () => {
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ params: { id: admin._id.toString() } });
    await deleteUser(req, res);
    expect(res.statusCode).toBe(403);
    expect(await User.findById(admin._id)).not.toBeNull();
  });

  it("supprime un compte non-admin", async () => {
    const client = await createUser({ role: "client" });
    const { req, res } = mockReqRes({ params: { id: client._id.toString() } });
    await deleteUser(req, res);
    expect(res.statusCode).toBe(200);
    expect(await User.findById(client._id)).toBeNull();
  });
});

describe("adminVerifyIdentity", () => {
  it("400 si aucune pièce n'a été soumise", async () => {
    const user = await createUser();
    const { req, res } = mockReqRes({ params: { id: user._id.toString() }, body: { status: "verified" } });
    await adminVerifyIdentity(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("vérifie une identité soumise et synchronise documentsVerified", async () => {
    const user = await createUser({ identity: { number: "CI1234567", status: "pending" } });
    const { req, res } = mockReqRes({ params: { id: user._id.toString() }, body: { status: "verified" } });
    await adminVerifyIdentity(req, res);
    expect(res.statusCode).toBe(200);
    const reloaded = await User.findById(user._id);
    expect(reloaded.documentsVerified).toBe(true);
    expect(reloaded.identity.status).toBe("verified");
  });

  it("rejette une identité avec motif et documentsVerified=false", async () => {
    const user = await createUser({ identity: { number: "CI1234567", status: "pending" }, documentsVerified: true });
    const { req, res } = mockReqRes({
      params: { id: user._id.toString() }, body: { status: "rejected", rejectionReason: "Photo illisible" },
    });
    await adminVerifyIdentity(req, res);
    expect(res.statusCode).toBe(200);
    const reloaded = await User.findById(user._id);
    expect(reloaded.documentsVerified).toBe(false);
    expect(reloaded.identity.rejectionReason).toBe("Photo illisible");
  });
});

describe("updateMyProfile", () => {
  it("réinitialise phoneVerified quand le numéro change (anti-contournement)", async () => {
    const user = await createUser({ phone: "+2250700000001", phoneVerified: true });
    const { req, res } = mockReqRes({ user, body: { phone: "+2250700000002" } });
    await updateMyProfile(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.user.phoneVerified).toBe(false);
  });

  it("ne réinitialise pas phoneVerified si le numéro ne change pas", async () => {
    const user = await createUser({ phone: "+2250700000001", phoneVerified: true });
    const { req, res } = mockReqRes({ user, body: { phone: "+2250700000001", firstName: "Nouveau" } });
    await updateMyProfile(req, res);
    expect(res.body.user.phoneVerified).toBe(true);
  });

  it("refuse de vider le téléphone sur un compte sans email", async () => {
    const user = await createUser({ email: null, phone: "+2250700000001" });
    const { req, res } = mockReqRes({ user, body: { phone: "" } });
    await updateMyProfile(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("rejette un code pays invalide", async () => {
    const user = await createUser();
    const { req, res } = mockReqRes({ user, body: { country: "ZZ" } });
    await updateMyProfile(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("ignore les champs hors whitelist (mass assignment) — ex: role", async () => {
    const user = await createUser({ role: "client" });
    const { req, res } = mockReqRes({ user, body: { role: "admin", firstName: "Renommé" } });
    await updateMyProfile(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.user.firstName).toBe("Renommé");
    const reloaded = await User.findById(user._id);
    expect(reloaded.role).toBe("client");
  });
});
