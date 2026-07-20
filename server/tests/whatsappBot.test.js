import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Le bot appelle l'API Claude réelle (@anthropic-ai/sdk) et l'envoi WhatsApp
// réel (Meta Cloud API, via CommunicationService) — les deux sont mockés pour
// ne jamais faire de vrai appel réseau/facturé en test.
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  // Doit être une "function" (pas une flèche) : le service instancie avec `new`.
  default: vi.fn().mockImplementation(function AnthropicMock() {
    return { messages: { create: mockCreate } };
  }),
}));

const mockSendViaWhatsApp = vi.fn();
vi.mock("../services/communication/CommunicationService.js", () => ({
  sendViaWhatsApp: mockSendViaWhatsApp,
}));

const { generateBotReply } = await import("../services/whatsappBotService.js");
const {
  verifyWebhook, receiveWebhook,
  adminListConversations, adminGetConversation, adminReply, adminUpdateStatus,
} = await import("../controllers/whatsappController.js");
const { default: WhatsAppConversation } = await import("../models/WhatsAppConversation.js");
const { default: Notification } = await import("../models/Notification.js");
const { createUser } = await import("./helpers/fixtures.js");
const { mockReqRes } = await import("./helpers/mockReqRes.js");

const claudeJsonResponse = (reply, escalate = false, escalationReason = null, stop_reason = "end_turn") => ({
  stop_reason,
  content: [{ type: "text", text: JSON.stringify({ reply, escalate, escalationReason }) }],
});

const wompiPayload = (from, text, name = "Jean Prospect") => Buffer.from(JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{
    id: "waba_1",
    changes: [{
      field: "messages",
      value: {
        messaging_product: "whatsapp",
        contacts: [{ profile: { name } }],
        messages: [{ from, type: "text", text: { body: text } }],
      },
    }],
  }],
}));

beforeEach(() => {
  mockCreate.mockReset();
  mockSendViaWhatsApp.mockReset();
  mockSendViaWhatsApp.mockResolvedValue({ sent: true, provider: "whatsapp_api", messageId: "wamid.test" });
  delete process.env.WHATSAPP_APP_SECRET;
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("generateBotReply", () => {
  it("sans ANTHROPIC_API_KEY configurée, répond un repli sûr et escalade", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await generateBotReply([{ role: "user", content: "Bonjour" }]);
    expect(result.escalate).toBe(true);
    expect(result.escalationReason).toBe("bot_non_configure");
  });

  it("parse la réponse JSON structurée de Claude", async () => {
    mockCreate.mockResolvedValueOnce(claudeJsonResponse("Bonjour ! Le programme Founding Partner...", false, null));
    const result = await generateBotReply([{ role: "user", content: "C'est quoi le programme partenaire ?" }]);
    expect(result.reply).toMatch(/Founding Partner/);
    expect(result.escalate).toBe(false);
  });

  it("bascule en repli sûr si stop_reason=refusal", async () => {
    mockCreate.mockResolvedValueOnce({ stop_reason: "refusal", content: [] });
    const result = await generateBotReply([{ role: "user", content: "..." }]);
    expect(result.escalate).toBe(true);
    expect(result.escalationReason).toBe("refus_securite");
  });

  it("bascule en repli sûr si l'appel API échoue", async () => {
    mockCreate.mockRejectedValueOnce(new Error("network down"));
    const result = await generateBotReply([{ role: "user", content: "..." }]);
    expect(result.escalate).toBe(true);
    expect(result.escalationReason).toBe("erreur_technique");
  });
});

describe("verifyWebhook", () => {
  it("renvoie le challenge si le token correspond", () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "secret-verify";
    const { req, res } = mockReqRes({ query: { "hub.mode": "subscribe", "hub.verify_token": "secret-verify", "hub.challenge": "12345" } });
    verifyWebhook(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.send).toHaveBeenCalledWith("12345");
  });

  it("403 si le token ne correspond pas", () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "secret-verify";
    const { req, res } = mockReqRes({ query: { "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "12345" } });
    verifyWebhook(req, res);
    expect(res.sendStatus).toHaveBeenCalledWith(403);
  });
});

describe("receiveWebhook", () => {
  it("ignore un message dont la signature ne correspond pas à WHATSAPP_APP_SECRET", async () => {
    process.env.WHATSAPP_APP_SECRET = "app-secret";
    const body = wompiPayload("225070000001", "Bonjour");
    const { req, res } = mockReqRes({});
    req.body = body;
    req.headers = { "x-hub-signature-256": "sha256=invalide" };
    await receiveWebhook(req, res);
    expect(res.sendStatus).toHaveBeenCalledWith(200);
    expect(await WhatsAppConversation.findOne({ phone: "225070000001" })).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("accepte un message avec une signature valide", async () => {
    process.env.WHATSAPP_APP_SECRET = "app-secret";
    const body = wompiPayload("225070000002", "Bonjour");
    const signature = "sha256=" + crypto.createHmac("sha256", "app-secret").update(body).digest("hex");
    mockCreate.mockResolvedValueOnce(claudeJsonResponse("Bonjour, comment puis-je vous aider ?", false, null));

    const { req, res } = mockReqRes({});
    req.body = body;
    req.headers = { "x-hub-signature-256": signature };
    await receiveWebhook(req, res);

    const conversation = await WhatsAppConversation.findOne({ phone: "225070000002" });
    expect(conversation.messages).toHaveLength(2);
    expect(conversation.status).toBe("bot");
  });

  it("crée une conversation, répond via le bot et envoie la réponse par WhatsApp", async () => {
    mockCreate.mockResolvedValueOnce(claudeJsonResponse("Le programme Founding Partner est réservé à 20 partenaires par pays.", false, null));
    const body = wompiPayload("225070000003", "Parlez-moi du programme Founding Partner");
    const { req, res } = mockReqRes({});
    req.body = body;
    req.headers = {};
    await receiveWebhook(req, res);

    const conversation = await WhatsAppConversation.findOne({ phone: "225070000003" });
    expect(conversation.contactName).toBe("Jean Prospect");
    expect(conversation.messages[0]).toMatchObject({ role: "user", content: "Parlez-moi du programme Founding Partner" });
    expect(conversation.messages[1]).toMatchObject({ role: "assistant" });
    expect(conversation.status).toBe("bot");
    expect(mockSendViaWhatsApp).toHaveBeenCalledWith(expect.objectContaining({ to: "225070000003" }));
  });

  it("escalade et notifie les admins quand le bot juge la demande hors périmètre", async () => {
    const admin = await createUser({ role: "admin" });
    mockCreate.mockResolvedValueOnce(claudeJsonResponse("Je transmets votre demande à un conseiller.", true, "negociation_commerciale"));

    const body = wompiPayload("225070000004", "Je veux une commission à 0%");
    const { req, res } = mockReqRes({});
    req.body = body;
    req.headers = {};
    await receiveWebhook(req, res);

    const conversation = await WhatsAppConversation.findOne({ phone: "225070000004" });
    expect(conversation.status).toBe("escalated");
    expect(conversation.escalationReason).toBe("negociation_commerciale");

    const notif = await Notification.findOne({ user: admin._id });
    expect(notif).not.toBeNull();
    expect(notif.titre).toMatch(/WhatsApp/);
  });

  it("une conversation déjà escaladée n'est plus traitée par le bot", async () => {
    await WhatsAppConversation.create({
      phone: "225070000005", status: "escalated",
      messages: [{ role: "user", content: "précédent" }],
    });

    const body = wompiPayload("225070000005", "Nouveau message");
    const { req, res } = mockReqRes({});
    req.body = body;
    req.headers = {};
    await receiveWebhook(req, res);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSendViaWhatsApp).not.toHaveBeenCalled();
    const conversation = await WhatsAppConversation.findOne({ phone: "225070000005" });
    expect(conversation.messages).toHaveLength(2);
    expect(conversation.status).toBe("escalated");
  });
});

describe("adminListConversations / adminGetConversation", () => {
  it("filtre par statut", async () => {
    await WhatsAppConversation.create({ phone: "225070000010", status: "bot" });
    await WhatsAppConversation.create({ phone: "225070000011", status: "escalated" });

    const { req, res } = mockReqRes({ query: { status: "escalated" } });
    await adminListConversations(req, res);
    expect(res.body.conversations).toHaveLength(1);
    expect(res.body.conversations[0].phone).toBe("225070000011");
  });

  it("404 pour une conversation inexistante", async () => {
    const { req, res } = mockReqRes({ params: { id: "000000000000000000000000" } });
    await adminGetConversation(req, res);
    expect(res.statusCode).toBe(404);
  });
});

describe("adminReply", () => {
  it("400 si le message est vide", async () => {
    const conversation = await WhatsAppConversation.create({ phone: "225070000020" });
    const { req, res } = mockReqRes({ params: { id: conversation._id.toString() }, body: { message: "  " } });
    await adminReply(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("envoie la réponse et l'ajoute à l'historique avec le rôle admin", async () => {
    const conversation = await WhatsAppConversation.create({ phone: "225070000021" });
    const { req, res } = mockReqRes({ params: { id: conversation._id.toString() }, body: { message: "Un conseiller va vous appeler." } });
    await adminReply(req, res);
    expect(res.statusCode).toBe(200);
    expect(mockSendViaWhatsApp).toHaveBeenCalledWith(expect.objectContaining({ to: "225070000021", text: "Un conseiller va vous appeler." }));

    const reloaded = await WhatsAppConversation.findById(conversation._id);
    expect(reloaded.messages[0]).toMatchObject({ role: "admin", content: "Un conseiller va vous appeler." });
  });

  it("502 si l'envoi WhatsApp échoue", async () => {
    mockSendViaWhatsApp.mockResolvedValueOnce({ sent: false, error: "not_configured" });
    const conversation = await WhatsAppConversation.create({ phone: "225070000022" });
    const { req, res } = mockReqRes({ params: { id: conversation._id.toString() }, body: { message: "Test" } });
    await adminReply(req, res);
    expect(res.statusCode).toBe(502);
  });
});

describe("adminUpdateStatus", () => {
  it("rejette un statut invalide", async () => {
    const conversation = await WhatsAppConversation.create({ phone: "225070000030" });
    const { req, res } = mockReqRes({ params: { id: conversation._id.toString() }, body: { status: "en_pause" } });
    await adminUpdateStatus(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("repasse en 'bot' et efface le motif d'escalade", async () => {
    const conversation = await WhatsAppConversation.create({
      phone: "225070000031", status: "escalated", escalatedAt: new Date(), escalationReason: "test",
    });
    const { req, res } = mockReqRes({ params: { id: conversation._id.toString() }, body: { status: "bot" } });
    await adminUpdateStatus(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.conversation.status).toBe("bot");
    expect(res.body.conversation.escalationReason).toBeNull();
  });
});
