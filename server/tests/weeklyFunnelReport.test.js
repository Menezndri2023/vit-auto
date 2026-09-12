import { describe, it, expect } from "vitest";
import Notification from "../models/Notification.js";
import SalesLead from "../models/SalesLead.js";
import CommunicationLog from "../models/CommunicationLog.js";
import { envoyerRapportHebdo, rapportDu, debutDeSemaine, composerMessage, calculerResume } from "../utils/weeklyFunnelReport.js";
import { verifierCommunications, analyserCanaux } from "../utils/communicationHealthCheck.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import * as svc from "../services/salesLeadService.js";

describe("Rapport hebdomadaire du funnel", () => {
  it("est dû une fois par semaine, à partir du lundi", () => {
    const mercredi = new Date("2026-09-16T10:00:00");
    expect(debutDeSemaine(mercredi).getDay()).toBe(1);
    expect(rapportDu(null, mercredi)).toBe(true);
    expect(rapportDu(new Date("2026-09-13T09:00:00"), mercredi)).toBe(true);  // dimanche précédent → dû
    expect(rapportDu(new Date("2026-09-14T09:00:00"), mercredi)).toBe(false); // déjà envoyé lundi
  });

  it("résume la semaine écoulée et liste ce qui reste à traiter", async () => {
    const admin = await createUser({ role: "admin", adminScopes: ["super_admin"] });
    const partner = await createUser({ role: "partenaire", phone: "+2250700000201", country: "CI", firstName: "Auto", lastName: "Center" });
    const vehicle = await createVehicleDoc({ owner: partner._id, type: "vente", priceForSale: 8000, pricePerDay: undefined, country: "CI" });
    const body = { firstName: "Awa", city: "Abidjan", date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), slot: "morning", consent: true };
    const { lead } = await svc.createLead({ vehicleId: vehicle._id.toString(), body: { ...body, phone: "+2250700000301" } });
    await svc.partnerAccept(lead, { actorId: partner._id, time: "10:00" });
    await svc.declareSale(lead, { actorId: partner._id, finalPrice: 9000, currency: "USD" });
    const { lead: enRetard } = await svc.createLead({ vehicleId: vehicle._id.toString(), body: { ...body, phone: "+2250700000302" } });
    // Semaine précédente : on antidate la création, et le second lead attend depuis 5 h.
    const ilYA = new Date(Date.now() - 3 * 86400000);
    await SalesLead.updateMany({}, { $set: { createdAt: ilYA } });
    await SalesLead.updateOne({ _id: enRetard._id }, { $set: { "milestones.sentToPartnerAt": new Date(Date.now() - 5 * 3600000) } });

    const maintenant = new Date(debutDeSemaine(new Date()).getTime() + 11 * 86400000); // jeudi de la semaine suivante
    const r = await envoyerRapportHebdo(maintenant);
    expect(r.sent).toBe(true);
    expect(r.resume.leads).toBe(2);
    expect(r.resume.essais).toBe(1);
    expect(r.resume.ventesAConfirmer).toBe(1);
    expect(r.resume.retards[0][0]).toBe("Auto Center");
    const notif = await Notification.findOne({ user: admin._id, titre: /Funnel vente/ });
    expect(notif.message).toMatch(/2 leads/);
    expect(notif.message).toMatch(/1 vente à confirmer/);
    expect(notif.message).toMatch(/Auto Center \(1\)/);
    // Pas de second envoi la même semaine.
    expect((await envoyerRapportHebdo(maintenant)).sent).toBe(false);
  });

  it("compose un message vide sans bruit", () => {
    const m = composerMessage({ leads: 0, aQualifier: 0, ventesAConfirmer: 0, retards: [] }, new Date("2026-09-07"), new Date("2026-09-14"));
    expect(m).toMatch(/aucune demande d'essai/);
  });
});

describe("Alerte sur les échecs d'envoi", () => {
  it("alerte une fois par jour et par canal quand les échecs dépassent les seuils", async () => {
    const admin = await createUser({ role: "admin", adminScopes: ["super_admin"] });
    const now = new Date();
    const rows = [];
    for (let i = 0; i < 6; i++) rows.push({ to: `+2250700000${i}`, channel: "sms", template: "generic", status: i < 4 ? "failed" : "sent", errorMessage: i < 4 ? "Twilio 21608" : null, createdAt: now });
    for (let i = 0; i < 10; i++) rows.push({ to: `u${i}@x.test`, channel: "email", template: "generic_notification", status: i === 0 ? "failed" : "sent", createdAt: now });
    await CommunicationLog.insertMany(rows);

    const canaux = await analyserCanaux(new Date(now.getTime() - 3600000));
    expect(canaux.map((c) => c.canal)).toEqual(["sms"]); // e-mail : 1/10, sous les seuils

    const r1 = await verifierCommunications();
    expect(r1.alertes).toBe(1);
    const notif = await Notification.findOne({ user: admin._id, titre: /SMS en échec/ });
    expect(notif.message).toMatch(/4 envois sur 6/);
    expect(notif.message).toMatch(/Twilio 21608/);
    expect((await verifierCommunications()).alertes).toBe(0);
  });
});
