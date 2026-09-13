import { describe, it, expect } from "vitest";
import SalesLead from "../models/SalesLead.js";
import Notification from "../models/Notification.js";
import * as svc from "../services/salesLeadService.js";
import { runSalesLeadScheduler } from "../utils/salesLeadScheduler.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";

// Règles de clôture ajoutées lors de la vérification complète du 2026-09-13 :
// une vente confirmée ferme les autres demandes sur le même véhicule ; une
// demande sans réponse du vendeur, ou dont la fenêtre d'attribution est
// écoulée, ne reste pas ouverte indéfiniment.
const body = (phone) => ({ firstName: "Awa", phone, city: "Abidjan", date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), slot: "morning", consent: true });

describe("Demande d'essai — clôtures automatiques", () => {
  it("la vente confirmée ferme les autres demandes ouvertes sur le véhicule et prévient leurs clients", async () => {
    const admin = await createUser({ role: "admin", adminScopes: ["super_admin"] });
    const partner = await createUser({ role: "partenaire", phone: "+2250700000401", country: "CI" });
    const vehicle = await createVehicleDoc({ owner: partner._id, type: "vente", priceForSale: 8000, pricePerDay: undefined, country: "CI" });
    const client2 = await createUser({ role: "client", phone: "+2250700000502", emailVerified: true, country: "CI" });
    const { lead: a } = await svc.createLead({ vehicleId: vehicle._id.toString(), body: body("+2250700000501") });
    const { lead: b } = await svc.createLead({ vehicleId: vehicle._id.toString(), user: client2, body: body("+2250700000502") });
    await svc.partnerAccept(a, { actorId: partner._id, time: "10:00" });
    await svc.declareSale(a, { actorId: partner._id, finalPrice: 9000, currency: "USD" });
    await svc.confirmSale(a, { actorId: admin._id });

    const bb = await SalesLead.findById(b._id);
    expect(bb.status).toBe("LOST");
    expect(bb.lostReason).toBe("Véhicule vendu à un autre client");
    expect(bb.history.at(-1).metadata.soldVia).toBe(a.reference);
    expect(await Notification.findOne({ user: client2._id, titre: /plus disponible/ })).toBeTruthy();
  });

  it("le planificateur clôture une demande sans réponse depuis staleAfterDays et une attribution écoulée", async () => {
    await createUser({ role: "admin", adminScopes: ["super_admin"] });
    const partner = await createUser({ role: "partenaire", phone: "+2250700000402", country: "CI" });
    const vehicle = await createVehicleDoc({ owner: partner._id, type: "vente", priceForSale: 8000, pricePerDay: undefined, country: "CI" });
    const { lead: muet } = await svc.createLead({ vehicleId: vehicle._id.toString(), body: body("+2250700000601") });
    const { lead: expire } = await svc.createLead({ vehicleId: vehicle._id.toString(), body: body("+2250700000602") });
    await svc.partnerAccept(expire, { actorId: partner._id, time: "10:00" });
    const { lead: sain } = await svc.createLead({ vehicleId: vehicle._id.toString(), body: body("+2250700000603") });

    await SalesLead.updateOne({ _id: muet._id }, { $set: { updatedAt: new Date(Date.now() - 15 * 86400000) } }, { timestamps: false });
    await SalesLead.updateOne({ _id: expire._id }, { $set: { "attribution.expiresAt": new Date(Date.now() - 1000) } });

    const stats = await runSalesLeadScheduler();
    expect(stats.closed).toBe(2);
    expect((await SalesLead.findById(muet._id)).lostReason).toBe("Sans réponse du vendeur");
    expect((await SalesLead.findById(expire._id)).lostReason).toBe("Fenêtre d'attribution écoulée sans vente");
    expect((await SalesLead.findById(sain._id)).status).toBe("SENT_TO_PARTNER");
    // Idempotent : rien de plus au cycle suivant.
    expect((await runSalesLeadScheduler()).closed).toBeUndefined();
  });
});
