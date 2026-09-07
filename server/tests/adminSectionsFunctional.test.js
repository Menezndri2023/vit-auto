import { describe, it, expect, vi } from "vitest";
import { requireAdminScope } from "../middleware/auth.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";
import Booking from "../models/Booking.js";

// « Vérification complète que tout est placé et fonctionnel » — signalement :
// certaines sections de l'administration (Comptes…) n'affichaient rien pour
// l'administrateur général.
//
// Ce fichier exécute RÉELLEMENT le chargement de chaque section admin, pour un
// administrateur général, sur une vraie base : la garde de permission est
// traversée, puis le contrôleur est appelé, puis la forme de la réponse est
// vérifiée. Une section qui renverrait un refus, une erreur, ou une réponse
// vide alors que la donnée existe est donc attrapée ici — et non découverte
// dans l'interface.

const GENERAL = { adminScope: ["super_admin"] };

// Traverse la garde de permission exactement comme Express le ferait, puis
// appelle le contrôleur. Retourne la réponse pour inspection.
async function callAsGeneralAdmin(scope, controller, { query = {}, params = {}, body = {} } = {}, admin) {
  const { req, res } = mockReqRes({ user: admin, query, params, body });
  if (scope) {
    const next = vi.fn();
    requireAdminScope(scope)(req, res, next);
    if (!next.mock.calls.length) {
      throw new Error(`Permission « ${scope} » refusée à l'administrateur général (statut ${res.statusCode}).`);
    }
  }
  await controller(req, res);
  return res;
}

describe("Sections d'administration — chargement réel en tant qu'admin général", () => {
  it("Comptes : liste les utilisateurs (section signalée vide)", async () => {
    const admin = await createUser({ role: "admin", ...GENERAL });
    await createUser({ role: "client" });
    await createUser({ role: "partenaire" });

    const { getUsers } = await import("../controllers/usersController.js");
    const res = await callAsGeneralAdmin("users", getUsers, { query: { limit: "200" } }, admin);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(Array.isArray(res.body.users), "la réponse doit contenir un tableau `users`").toBe(true);
    expect(res.body.users.length).toBeGreaterThanOrEqual(3);
    expect(res.body.total).toBeGreaterThanOrEqual(3);
  });

  it("Vue d'ensemble : statistiques", async () => {
    const admin = await createUser({ role: "admin", ...GENERAL });
    const { getAdminStats } = await import("../controllers/usersController.js");
    const res = await callAsGeneralAdmin(null, getAdminStats, {}, admin);

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.body).toBeTruthy();
  });

  it("Réservations : liste les commandes", async () => {
    const admin  = await createUser({ role: "admin", ...GENERAL });
    const client = await createUser({ role: "client" });
    const vehicle = await createVehicleDoc();
    await Booking.create({
      type: "location", client: client._id, vehicle: vehicle._id,
      clientInfo: { firstName: "Jean", lastName: "Client", email: "j@t.test" },
      adminValidation: { status: "approved" },
    });

    const { getAllBookings } = await import("../controllers/bookingController.js");
    const res = await callAsGeneralAdmin("bookings", getAllBookings, { query: { limit: "200" } }, admin);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(Array.isArray(res.body.bookings)).toBe(true);
    expect(res.body.bookings.length).toBeGreaterThanOrEqual(1);
  });

  it("Catalogue : annonces (toutes, y compris non publiées)", async () => {
    const admin = await createUser({ role: "admin", ...GENERAL });
    await createVehicleDoc({ title: "Annonce publiée" });
    await createVehicleDoc({ title: "Annonce en attente", status: "pending" });

    const { getVehicles } = await import("../controllers/vehicleController.js");
    const res = await callAsGeneralAdmin(null, getVehicles, { query: { status: "all", limit: "100", search: "Annonce" } }, admin);

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(Array.isArray(res.body.vehicles)).toBe(true);
    expect(res.body.vehicles.length).toBeGreaterThanOrEqual(2);
  });

  it("Rôles & Permissions : liste les comptes admin", async () => {
    const admin = await createUser({ role: "admin", ...GENERAL });
    await createUser({ role: "admin", adminScope: ["finance"] });

    const { getAdminAccounts } = await import("../controllers/usersController.js");
    const { req, res } = mockReqRes({ user: admin, query: {} });
    await getAdminAccounts(req, res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    const accounts = res.body.admins || res.body.users || res.body.accounts;
    expect(Array.isArray(accounts), "la réponse doit contenir la liste des comptes admin").toBe(true);
    expect(accounts.length).toBeGreaterThanOrEqual(2);
  });

  it("Pièces d'identité : file d'attente accessible", async () => {
    const admin = await createUser({ role: "admin", ...GENERAL });
    const { getPendingIdentities } = await import("../controllers/usersController.js");
    const res = await callAsGeneralAdmin("kyc", getPendingIdentities, {}, admin);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it("Un admin RESTREINT est bien refusé sur les sections hors de son périmètre", async () => {
    // Contre-épreuve : si ce test échoue, la restriction ne s'applique pas et
    // les tests ci-dessus ne prouveraient rien sur l'admin général.
    const financier = await createUser({ role: "admin", adminScope: ["finance"] });
    const { req, res } = mockReqRes({ user: financier });
    const next = vi.fn();
    requireAdminScope("users")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
