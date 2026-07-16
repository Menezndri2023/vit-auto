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

async function createBookingBetween(client, ownerId) {
  const vehicle = await Vehicle.create({ title: "Toyota Corolla", type: "location", owner: ownerId });
  return Booking.create({
    type: "location",
    clientInfo: { firstName: client.firstName, lastName: client.lastName, email: client.email },
    client: client._id,
    vehicle: vehicle._id,
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
