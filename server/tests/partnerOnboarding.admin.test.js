import { describe, it, expect } from "vitest";
import { adminReject, adminRequestInfo, adminUpdateStatus } from "../controllers/partnerOnboardingController.js";
import { getSupportChats, sendMessage, getOrCreateChat } from "../controllers/chatController.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

describe("partnerOnboardingController — actions admin restantes", () => {
  it("adminReject exige une note et fait passer le dossier à 'rejete'", async () => {
    const partner = await createUser({ role: "partenaire" });
    const doc = await PartnerOnboarding.create({ userId: partner._id, status: "soumis" });
    const admin = await createUser({ role: "admin" });

    const noNote = mockReqRes({ user: admin, params: { id: doc._id.toString() }, body: {} });
    await adminReject(noNote.req, noNote.res);
    expect(noNote.res.status).toHaveBeenCalledWith(400);

    const { req, res } = mockReqRes({ user: admin, params: { id: doc._id.toString() }, body: { note: "Documents insuffisants" } });
    await adminReject(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);

    const updated = await PartnerOnboarding.findById(doc._id);
    expect(updated.status).toBe("rejete");
    expect(updated.adminReview.decision).toBe("rejected");
    expect(updated.adminReview.note).toBe("Documents insuffisants");
  });

  it("adminRequestInfo exige un message et fait passer le dossier à 'info_demandee'", async () => {
    const partner = await createUser({ role: "partenaire" });
    const doc = await PartnerOnboarding.create({ userId: partner._id, status: "soumis" });
    const admin = await createUser({ role: "admin" });

    const empty = mockReqRes({ user: admin, params: { id: doc._id.toString() }, body: {} });
    await adminRequestInfo(empty.req, empty.res);
    expect(empty.res.status).toHaveBeenCalledWith(400);

    const { req, res } = mockReqRes({ user: admin, params: { id: doc._id.toString() }, body: { infoRequested: "RCCM manquant" } });
    await adminRequestInfo(req, res);
    expect(res.status).not.toHaveBeenCalledWith(400);

    const updated = await PartnerOnboarding.findById(doc._id);
    expect(updated.status).toBe("info_demandee");
    expect(updated.adminReview.infoRequested).toBe("RCCM manquant");
  });

  it("adminUpdateStatus refuse un statut hors énumération", async () => {
    const partner = await createUser({ role: "partenaire" });
    const doc = await PartnerOnboarding.create({ userId: partner._id, status: "soumis" });
    const admin = await createUser({ role: "admin" });

    const { req, res } = mockReqRes({ user: admin, params: { id: doc._id.toString() }, body: { status: "banni" } });
    await adminUpdateStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("chatController.getSupportChats", () => {
  it("liste les conversations de support avec le bon indicateur needsReply", async () => {
    const client = await createUser();
    await createUser({ role: "admin", isActive: true });
    const admin2 = await createUser({ role: "admin" });

    const { req, res } = mockReqRes({ user: client, body: { type: "client_support" } });
    await getOrCreateChat(req, res);
    const chatId = res.body.chat._id.toString();

    // Le client envoie un message — aucun admin n'a encore répondu.
    const send = mockReqRes({ user: client, params: { id: chatId }, body: { content: "Besoin d'aide" } });
    await sendMessage(send.req, send.res);

    const list = mockReqRes({ user: admin2 });
    await getSupportChats(list.req, list.res);

    const entry = list.res.body.chats.find((c) => c._id.toString() === chatId);
    expect(entry).toBeTruthy();
    expect(entry.needsReply).toBe(true);
    expect(entry.requester?.role).not.toBe("admin");
  });
});
