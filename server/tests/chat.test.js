import { describe, it, expect } from "vitest";
import { getOrCreateChat, getMessages, sendMessage, getUnreadCount } from "../controllers/chatController.js";
import Chat from "../models/Chat.js";
import Booking from "../models/Booking.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";
// Vehicle est populé par getOrCreateChat/findAccessibleChat — sans cet import,
// MissingSchemaError (piège d'isolation déjà documenté dans review.test.js).
import "../models/Vehicle.js";
import "../models/Driver.js";
import Vehicle from "../models/Vehicle.js";

// `adminValidation: "approved"` par défaut : depuis l'activation de la
// messagerie (2026-09), une conversation client↔partenaire n'est ouvrable que
// sur une réservation déjà validée par un admin — sinon le partenaire serait
// notifié d'une demande qu'il n'est pas censé connaître (gate admin,
// audit 2026-08). Les cas non validés sont testés explicitement plus bas.
async function createBookingBetween(client, ownerId, overrides = {}) {
  const vehicle = await Vehicle.create({ title: "Toyota Corolla", type: "location", owner: ownerId });
  return Booking.create({
    type: "location",
    clientInfo: { firstName: client.firstName, lastName: client.lastName, email: client.email, passportNumber: "P1234567" },
    client: client._id,
    vehicle: vehicle._id,
    adminValidation: { status: "approved" },
    ...overrides,
  });
}

describe("chatController.getOrCreateChat", () => {
  it("refuse un type de chat invalide", async () => {
    const client = await createUser();
    const { req, res } = mockReqRes({ user: client, body: { type: "n_importe_quoi" } });
    await getOrCreateChat(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("ne dérive jamais le destinataire client_partner depuis le body — toujours de la réservation réelle", async () => {
    const client = await createUser();
    const owner = await createUser();
    const stranger = await createUser(); // tentative d'écrire à un tiers non lié à la réservation
    const booking = await createBookingBetween(client, owner._id);

    const { req, res } = mockReqRes({
      user: client,
      body: { type: "client_partner", bookingId: booking._id.toString(), targetId: stranger._id.toString() },
    });
    await getOrCreateChat(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const participantIds = res.body.chat.participants.map((p) => p._id.toString());
    expect(participantIds).toContain(owner._id.toString());
    expect(participantIds).not.toContain(stranger._id.toString());
  });

  it("renvoie 404 (jamais 403) qu'une réservation soit inexistante ou qu'elle n'implique pas l'appelant — anti-énumération", async () => {
    const client = await createUser();
    const owner = await createUser();
    const stranger = await createUser();
    const booking = await createBookingBetween(client, owner._id);

    const notFound = mockReqRes({ user: stranger, body: { type: "client_partner", bookingId: "000000000000000000000000" } });
    await getOrCreateChat(notFound.req, notFound.res);
    expect(notFound.res.status).toHaveBeenCalledWith(404);

    const notParty = mockReqRes({ user: stranger, body: { type: "client_partner", bookingId: booking._id.toString() } });
    await getOrCreateChat(notParty.req, notParty.res);
    expect(notParty.res.status).toHaveBeenCalledWith(404);
  });

  // Bug réel signalé par le partenaire : cliquer sur "Message au client" depuis
  // une ligne de commande locale (id numérique Date.now(), jamais fusionnée
  // avec son équivalent serveur) envoyait un bookingId non-ObjectId → CastError
  // à findById → 500 "Erreur serveur.". Doit être le même 404 générique qu'un
  // id inconnu (cohérence anti-énumération).
  it("renvoie 404 — jamais 500 — sur un bookingId qui n'est pas un ObjectId", async () => {
    const client = await createUser();
    for (const bad of ["abc123", "1757230000000", "../../etc/passwd"]) {
      const { req, res } = mockReqRes({ user: client, body: { type: "client_partner", bookingId: bad } });
      await getOrCreateChat(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.status).not.toHaveBeenCalledWith(500);
    }
  });

  it("refuse proprement une réservation sans compte client rattaché (pas de conversation à participant vide)", async () => {
    const owner   = await createUser();
    const client  = await createUser();
    const booking = await createBookingBetween(client, owner._id);
    await Booking.updateOne({ _id: booking._id }, { $set: { client: null } });

    const { req, res } = mockReqRes({ user: owner, body: { type: "client_partner", bookingId: booking._id.toString() } });
    await getOrCreateChat(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  it("renvoie 404 — jamais 500 — sur un id de conversation invalide", async () => {
    const client = await createUser();
    const get = mockReqRes({ user: client, params: { id: "pas-un-id" } });
    await getMessages(get.req, get.res);
    expect(get.res.status).toHaveBeenCalledWith(404);

    const send = mockReqRes({ user: client, params: { id: "pas-un-id" }, body: { content: "Bonjour" } });
    await sendMessage(send.req, send.res);
    expect(send.res.status).toHaveBeenCalledWith(404);
  });

  // Activation de la messagerie client↔partenaire (2026-09) : le bouton était
  // déjà masqué côté client tant que la réservation n'était pas validée, mais
  // rien ne l'empêchait côté serveur — un appel direct créait la conversation
  // ET notifiait le partenaire, lui révélant une demande encore en attente de
  // validation admin (contournement du gate de l'audit 2026-08).
  it("refuse d'ouvrir une conversation tant que la réservation n'est pas validée par un admin", async () => {
    const client  = await createUser();
    const owner   = await createUser();
    const booking = await createBookingBetween(client, owner._id, { adminValidation: { status: "pending" } });

    const { req, res } = mockReqRes({ user: client, body: { type: "client_partner", bookingId: booking._id.toString() } });
    await getOrCreateChat(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body.code).toBe("BOOKING_NOT_APPROVED");
    expect(await Chat.countDocuments({ booking: booking._id })).toBe(0);
  });

  it("refuse également au partenaire d'ouvrir la conversation avant validation admin", async () => {
    const client  = await createUser();
    const owner   = await createUser();
    const booking = await createBookingBetween(client, owner._id, { adminValidation: { status: "pending" } });

    const { req, res } = mockReqRes({ user: owner, body: { type: "client_partner", bookingId: booking._id.toString() } });
    await getOrCreateChat(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("refuse d'ouvrir une conversation sur une réservation annulée", async () => {
    const client  = await createUser();
    const owner   = await createUser();
    const booking = await createBookingBetween(client, owner._id, { status: "cancelled" });

    const { req, res } = mockReqRes({ user: client, body: { type: "client_partner", bookingId: booking._id.toString() } });
    await getOrCreateChat(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("ouvre la conversation sur tout le cycle de vie une fois validée, y compris après la remise", async () => {
    for (const status of ["confirmed", "waiting_client_validation", "disputed", "completed"]) {
      const client  = await createUser();
      const owner   = await createUser();
      const booking = await createBookingBetween(client, owner._id, { status });

      const { req, res } = mockReqRes({ user: client, body: { type: "client_partner", bookingId: booking._id.toString() } });
      await getOrCreateChat(req, res);

      expect(res.status).not.toHaveBeenCalledWith(409);
      expect(res.body.chat).toBeTruthy();
    }
  });

  it("refuse d'ouvrir une conversation avec soi-même", async () => {
    const owner = await createUser();
    const booking = await createBookingBetween(owner, owner._id); // owner = client ET propriétaire (cas dégénéré)
    const { req, res } = mockReqRes({ user: owner, body: { type: "client_partner", bookingId: booking._id.toString() } });
    await getOrCreateChat(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("réutilise la conversation existante au lieu d'en créer une seconde", async () => {
    const client = await createUser();
    const owner = await createUser();
    const booking = await createBookingBetween(client, owner._id);

    const first = mockReqRes({ user: client, body: { type: "client_partner", bookingId: booking._id.toString() } });
    await getOrCreateChat(first.req, first.res);
    const second = mockReqRes({ user: client, body: { type: "client_partner", bookingId: booking._id.toString() } });
    await getOrCreateChat(second.req, second.res);

    expect(first.res.body.chat._id.toString()).toBe(second.res.body.chat._id.toString());
    expect(await Chat.countDocuments({ type: "client_partner" })).toBe(1);
  });

  it("dirige un chat de support vers un admin actif", async () => {
    const client = await createUser();
    await createUser({ role: "admin", isActive: true });
    const { req, res } = mockReqRes({ user: client, body: { type: "client_support" } });
    await getOrCreateChat(req, res);

    expect(res.status).not.toHaveBeenCalledWith(404);
    const roles = res.body.chat.participants.map((p) => p.role);
    expect(roles).toContain("admin");
  });
});

// Faille de sécurité réelle corrigée (audit) : seule la route de LISTING
// (GET /api/chats/support) était protégée par requireAdminScope("support") —
// getMessages/sendMessage (via findAccessibleChat) ajoutaient N'IMPORTE QUEL
// admin comme participant d'une conversation support dès qu'il en connaissait
// l'ID, quel que soit son adminScope.
describe("chatController — scope 'support' sur les conversations support (sécurité)", () => {
  it("un admin SANS le scope 'support' ne peut pas lire une conversation support qu'il ne connaît pas déjà", async () => {
    await createUser({ role: "admin", isActive: true }); // getOrCreateChat exige un admin actif disponible
    const client = await createUser();
    const { req: cReq, res: cRes } = mockReqRes({ user: client, body: { type: "client_support" } });
    await getOrCreateChat(cReq, cRes);
    const chatId = cRes.body.chat._id.toString();

    const kycAdmin = await createUser({ role: "admin", adminScope: ["kyc"] });
    const { req, res } = mockReqRes({ user: kycAdmin, params: { id: chatId } });
    await getMessages(req, res);
    expect(res.statusCode).toBe(404);

    const chat = await Chat.findById(chatId);
    expect(chat.participants.map(String)).not.toContain(kycAdmin._id.toString());
  });

  it("un admin avec le scope 'support' explicite peut accéder à une conversation support inconnue", async () => {
    await createUser({ role: "admin", isActive: true });
    const client = await createUser();
    const { req: cReq, res: cRes } = mockReqRes({ user: client, body: { type: "client_support" } });
    await getOrCreateChat(cReq, cRes);
    const chatId = cRes.body.chat._id.toString();

    const supportAdmin = await createUser({ role: "admin", adminScope: ["support"] });
    const { req, res } = mockReqRes({ user: supportAdmin, params: { id: chatId } });
    await getMessages(req, res);
    expect(res.statusCode).not.toBe(404);

    const chat = await Chat.findById(chatId);
    expect(chat.participants.map(String)).toContain(supportAdmin._id.toString());
  });

  // Permissions explicites (2026-09) : l'ADMIN GÉNÉRAL passe partout, tandis
  // qu'un admin sans aucune permission n'accède plus à rien — auparavant un
  // adminScope vide valait « accès complet », donc tout compte admin
  // fraîchement promu pouvait lire les conversations de support.
  it("l'administrateur général accède à une conversation support, un admin restreint hors support non", async () => {
    await createUser({ role: "admin", isActive: true, adminScope: ["super_admin"] });
    const client = await createUser();
    const { req: cReq, res: cRes } = mockReqRes({ user: client, body: { type: "client_support" } });
    await getOrCreateChat(cReq, cRes);
    const chatId = cRes.body.chat._id.toString();

    const general = await createUser({ role: "admin", adminScope: ["super_admin"] });
    const ok = mockReqRes({ user: general, params: { id: chatId } });
    await getMessages(ok.req, ok.res);
    expect(ok.res.statusCode).not.toBe(404);

    // Un admin RESTREINT hors du domaine "support" n'accède pas aux
    // conversations ; un admin non restreint, lui, est administrateur général
    // et y accède (ses identifiants suffisent).
    const restreint = await createUser({ role: "admin", adminScope: ["finance"] });
    const refus = mockReqRes({ user: restreint, params: { id: chatId } });
    await getMessages(refus.req, refus.res);
    expect(refus.res.statusCode).toBe(404);

    const nonRestreint = await createUser({ role: "admin", adminScope: [] });
    const ok2 = mockReqRes({ user: nonRestreint, params: { id: chatId } });
    await getMessages(ok2.req, ok2.res);
    expect(ok2.res.statusCode).not.toBe(404);
  });
});

describe("chatController.sendMessage / getMessages / getUnreadCount", () => {
  it("refuse un message vide ou trop long", async () => {
    const client = await createUser();
    const owner = await createUser();
    const booking = await createBookingBetween(client, owner._id);
    const { req: cReq, res: cRes } = mockReqRes({ user: client, body: { type: "client_partner", bookingId: booking._id.toString() } });
    await getOrCreateChat(cReq, cRes);
    const chatId = cRes.body.chat._id.toString();

    const empty = mockReqRes({ user: client, params: { id: chatId }, body: { content: "   " } });
    await sendMessage(empty.req, empty.res);
    expect(empty.res.status).toHaveBeenCalledWith(400);

    const tooLong = mockReqRes({ user: client, params: { id: chatId }, body: { content: "x".repeat(2001) } });
    await sendMessage(tooLong.req, tooLong.res);
    expect(tooLong.res.status).toHaveBeenCalledWith(400);
  });

  it("incrémente le compteur non-lu du destinataire, remis à zéro après lecture", async () => {
    const client = await createUser();
    const owner = await createUser();
    const booking = await createBookingBetween(client, owner._id);
    const { req: cReq, res: cRes } = mockReqRes({ user: client, body: { type: "client_partner", bookingId: booking._id.toString() } });
    await getOrCreateChat(cReq, cRes);
    const chatId = cRes.body.chat._id.toString();

    const send = mockReqRes({ user: client, params: { id: chatId }, body: { content: "Bonjour !" } });
    await sendMessage(send.req, send.res);
    expect(send.res.status).not.toHaveBeenCalledWith(400);

    const unread = mockReqRes({ user: owner });
    await getUnreadCount(unread.req, unread.res);
    expect(unread.res.body.unread).toBe(1);

    // Le destinataire lit la conversation — remet son compteur à zéro
    const read = mockReqRes({ user: owner, params: { id: chatId } });
    await getMessages(read.req, read.res);
    expect(read.res.body.messages).toHaveLength(1);

    const unreadAfter = mockReqRes({ user: owner });
    await getUnreadCount(unreadAfter.req, unreadAfter.res);
    expect(unreadAfter.res.body.unread).toBe(0);
  });

  it("refuse l'accès aux messages d'une conversation dont on n'est pas participant", async () => {
    const client = await createUser();
    const owner = await createUser();
    const stranger = await createUser();
    const booking = await createBookingBetween(client, owner._id);
    const { req: cReq, res: cRes } = mockReqRes({ user: client, body: { type: "client_partner", bookingId: booking._id.toString() } });
    await getOrCreateChat(cReq, cRes);

    const { req, res } = mockReqRes({ user: stranger, params: { id: cRes.body.chat._id.toString() } });
    await getMessages(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
