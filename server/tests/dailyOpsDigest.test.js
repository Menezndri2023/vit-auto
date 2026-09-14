import { describe, it, expect } from "vitest";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";
import PartnerSectorRequest from "../models/PartnerSectorRequest.js";
import { digestDu, calculerDigest, composerDigest, envoyerDigestQuotidien } from "../utils/dailyOpsDigest.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";

const clientInfo = { firstName: "Awa", lastName: "K.", email: "awa@example.test" };
const matin = () => { const d = new Date(); d.setHours(9, 0, 0, 0); return d; };

describe("Digest quotidien des admins", () => {
  it("est dû une fois par jour, à partir de 7 h", () => {
    const a9h = matin();
    expect(digestDu(null, a9h)).toBe(true);
    expect(digestDu(new Date(a9h.getTime() - 86400000), a9h)).toBe(true);   // hier → dû
    expect(digestDu(new Date(a9h.getTime() - 3600000), a9h)).toBe(false);   // déjà envoyé ce matin
    const a6h = new Date(a9h); a6h.setHours(6);
    expect(digestDu(null, a6h)).toBe(false);
  });

  it("liste ce qui attend une action et n'envoie rien quand tout est traité", async () => {
    const admin = await createUser({ role: "admin", adminScopes: ["super_admin"] });
    const partner = await createUser({ role: "partenaire" });
    const client = await createUser({ role: "client" });
    const vehicle = await createVehicleDoc({ owner: partner._id });
    const now = matin();

    // Rien à traiter : marqueur posé, aucune notification.
    let r = await envoyerDigestQuotidien(now);
    expect(r.sent).toBe(false); expect(r.vide).toBe(true);
    expect(await Notification.countDocuments({ user: admin._id })).toBe(0);

    // Le lendemain : une demande sans réponse depuis 30 h, un litige, une alerte fraude, une demande de secteur.
    const demain = new Date(now.getTime() + 86400000);
    await Booking.create([
      { type: "location", vehicle: vehicle._id, client: client._id, clientInfo, status: "pending", adminValidation: { status: "approved" }, partnerNotifiedAt: new Date(demain - 30 * 3600000), montantTotal: 50, reference: "VIT-LOC-2026-000901" },
      { type: "location", vehicle: vehicle._id, client: client._id, clientInfo, status: "disputed", adminValidation: { status: "approved" }, montantTotal: 50, reference: "VIT-LOC-2026-000902" },
      { type: "location", vehicle: vehicle._id, client: client._id, clientInfo, status: "confirmed", adminValidation: { status: "approved" }, montantTotal: 50, reference: "VIT-LOC-2026-000903", fraudCheck: { riskLevel: "high", flags: ["compte_tres_recent"], checkedAt: new Date(demain - 3600000) } },
    ]);
    await PartnerSectorRequest.create({ user: partner._id, secteur: "pieces", status: "pending" });

    const digest = await calculerDigest(demain);
    expect(digest.sansReponse).toBe(1);
    expect(digest.sansReponseRefs).toEqual(["VIT-LOC-2026-000901"]);
    expect(digest.litiges).toBe(1);
    expect(digest.fraudes).toBe(1);
    expect(digest.secteurs).toBe(1);
    const lignes = composerDigest(digest);
    expect(lignes).toHaveLength(4);

    r = await envoyerDigestQuotidien(demain);
    expect(r.sent).toBe(true);
    const notif = await Notification.findOne({ user: admin._id });
    expect(notif.titre).toMatch(/À traiter aujourd'hui — 4 point/);
    expect(notif.message).toMatch(/VIT-LOC-2026-000901/);
    expect(notif.message).toMatch(/litige/);
    // Pas de second envoi le même jour.
    expect((await envoyerDigestQuotidien(new Date(demain.getTime() + 3600000))).sent).toBe(false);
  });
});
