import { describe, it, expect } from "vitest";
import {
  getMyNotifications, markAsRead, markAllAsRead, deleteNotification, sendAdminNotification,
} from "../controllers/notificationController.js";
import Notification from "../models/Notification.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

describe("getMyNotifications", () => {
  it("compte les non lues et isole par utilisateur", async () => {
    const user1 = await createUser();
    const user2 = await createUser();
    await Notification.create({ user: user1._id, type: "system", titre: "A", message: "m", lu: false });
    await Notification.create({ user: user1._id, type: "system", titre: "B", message: "m", lu: true });
    await Notification.create({ user: user2._id, type: "system", titre: "C", message: "m", lu: false });

    const { req, res } = mockReqRes({ user: user1 });
    await getMyNotifications(req, res);
    expect(res.body.notifications).toHaveLength(2);
    expect(res.body.nonLues).toBe(1);
  });
});

describe("markAsRead / deleteNotification — isolation par propriétaire", () => {
  it("un utilisateur ne peut pas marquer lue la notification d'un autre", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const notif = await Notification.create({ user: owner._id, type: "system", titre: "A", message: "m" });

    const { req, res } = mockReqRes({ user: stranger, params: { id: notif._id.toString() } });
    await markAsRead(req, res);
    expect(res.statusCode).toBe(404);

    const reloaded = await Notification.findById(notif._id);
    expect(reloaded.lu).toBe(false);
  });

  it("le propriétaire peut marquer sa notification comme lue", async () => {
    const owner = await createUser();
    const notif = await Notification.create({ user: owner._id, type: "system", titre: "A", message: "m" });
    const { req, res } = mockReqRes({ user: owner, params: { id: notif._id.toString() } });
    await markAsRead(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.notification.lu).toBe(true);
  });

  it("un utilisateur ne peut pas supprimer la notification d'un autre", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const notif = await Notification.create({ user: owner._id, type: "system", titre: "A", message: "m" });

    const { req, res } = mockReqRes({ user: stranger, params: { id: notif._id.toString() } });
    await deleteNotification(req, res);
    expect(await Notification.findById(notif._id)).not.toBeNull();
  });

  it("markAllAsRead ne touche que les notifications de l'appelant", async () => {
    const user1 = await createUser();
    const user2 = await createUser();
    await Notification.create({ user: user1._id, type: "system", titre: "A", message: "m", lu: false });
    await Notification.create({ user: user2._id, type: "system", titre: "B", message: "m", lu: false });

    const { req, res } = mockReqRes({ user: user1 });
    await markAllAsRead(req, res);
    expect(res.statusCode).toBe(200);

    expect(await Notification.countDocuments({ user: user1._id, lu: false })).toBe(0);
    expect(await Notification.countDocuments({ user: user2._id, lu: false })).toBe(1);
  });
});

describe("sendAdminNotification", () => {
  it("400 si titre ou message manquant", async () => {
    const { req, res } = mockReqRes({ body: { titre: "Titre seul" } });
    await sendAdminNotification(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("cible uniquement le rôle demandé et exclut les comptes désactivés", async () => {
    await createUser({ role: "client", isActive: true });
    await createUser({ role: "partenaire", isActive: true });
    await createUser({ role: "client", isActive: false });

    const { req, res } = mockReqRes({ body: { titre: "Maintenance", message: "Ce soir 22h", targetRole: "client" } });
    await sendAdminNotification(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.sent).toBe(1);
  });

  it("targetRole='all' envoie à tous les comptes actifs", async () => {
    await createUser({ role: "client", isActive: true });
    await createUser({ role: "partenaire", isActive: true });

    const { req, res } = mockReqRes({ body: { titre: "Info", message: "m", targetRole: "all" } });
    await sendAdminNotification(req, res);
    expect(res.body.sent).toBe(2);
  });

  it("404 si aucun destinataire ne correspond", async () => {
    const { req, res } = mockReqRes({ body: { titre: "Info", message: "m", targetRole: "admin" } });
    await sendAdminNotification(req, res);
    expect(res.statusCode).toBe(404);
  });
});
