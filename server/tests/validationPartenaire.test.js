import { describe, it, expect } from "vitest";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import PartnerCertification from "../models/PartnerCertification.js";
import { documentsExiges, evaluerPartenaire } from "../services/validationPartenaire.js";
import { checkAndSendPartnerReminders } from "../utils/partnerReminders.js";
import { refusDePublication } from "../utils/publishingGate.js";
import { createUser, createDriverDoc } from "./helpers/fixtures.js";

// Règle de l'exploitant (2026-10-09) : les pièces exigées dépendent du métier
// et de l'entité du partenaire ; réunies (et le contact confirmé), le
// partenaire est validé et ne reçoit plus aucune relance de documents.
const IL_Y_A_10_JOURS = new Date(Date.now() - 10 * 864e5);

describe("documents exigés selon le métier et l'entité", () => {
  it("chauffeur : permis + CV seulement, quelle que soit son entité", () => {
    for (const entityType of ["particulier", "professionnel", "entreprise"]) {
      expect(documentsExiges({ partnerActivity: "chauffeur", entityType })).toEqual(["contact", "permis", "cv"]);
    }
  });
  it("particulier : identité ; professionnel : identité + registre ; entreprise : registre + représentant", () => {
    expect(documentsExiges({ partnerActivity: "loueur", entityType: "particulier" })).toEqual(["contact", "identite"]);
    expect(documentsExiges({ partnerActivity: "vendeur", entityType: "professionnel" })).toEqual(["contact", "identite", "registre"]);
    expect(documentsExiges({ partnerActivity: "loisirs", entityType: "entreprise" })).toEqual(["contact", "registre", "identite_representant"]);
    expect(documentsExiges({ partnerActivity: "exportateur", entityType: "concessionnaire" })).toEqual(["contact", "registre", "identite_representant"]);
  });
  it("plusieurs métiers : les exigences se cumulent", () => {
    expect(documentsExiges({ partnerActivity: "loueur", partnerActivities: ["chauffeur"], entityType: "particulier" })).toEqual(["contact", "permis", "cv", "identite"]);
  });
});

describe("validation automatique", () => {
  it("une entreprise devient validée avec son registre et l'identité de son représentant, et publie", async () => {
    const u = await createUser({ role: "partenaire", partnerActivity: "loueur", entityType: "entreprise", sellerType: "entreprise", emailVerified: true, certificationBadge: "none" });
    expect((await evaluerPartenaire(u._id)).manquants).toEqual(["registre", "identite_representant"]);
    await PartnerCertification.create({ userId: u._id, level1: { registrationDoc: { data: "https://ik.example/rccm.pdf" } } });
    await User.updateOne({ _id: u._id }, { $set: { kycStatus: "VERIFIE" } });
    const r = await evaluerPartenaire(u._id);
    expect(r.statut).toBe("valide");
    const apres = await User.findById(u._id);
    expect(apres.validationPartenaire.mode).toBe("auto");
    expect(refusDePublication(apres)).toBeNull();
    expect(await Notification.exists({ user: u._id, titre: "✅ Compte partenaire validé" })).toBeTruthy();
  });

  it("une fiche chauffeur en attente est publiée dès que le partenaire est validé ; une fiche rejetée reste rejetée", async () => {
    const u = await createUser({ role: "partenaire", partnerActivity: "chauffeur", entityType: "particulier", emailVerified: false });
    const enAttente = await createDriverDoc({ owner: u._id, status: "pending", cv: "https://ik.example/cv.pdf", licenseDocument: { frontImage: "https://ik.example/permis.jpg" } });
    const rejetee = await createDriverDoc({ owner: u._id, status: "rejected", cv: "https://ik.example/cv.pdf", licenseDocument: { frontImage: "https://ik.example/permis.jpg" } });
    expect((await evaluerPartenaire(u._id)).manquants).toEqual(["contact"]);
    await User.updateOne({ _id: u._id }, { $set: { emailVerified: true } });
    expect((await evaluerPartenaire(u._id)).statut).toBe("valide");
    const Driver = (await import("../models/Driver.js")).default;
    expect((await Driver.findById(enAttente._id).lean()).status).toBe("approved");
    expect((await Driver.findById(rejetee._id).lean()).status).toBe("rejected");
  });
});

describe("relances de documents", () => {
  it("une seule relance, avec les pièces propres au partenaire, sans doublon d'e-mail ; aucune au partenaire validé", async () => {
    const chauffeur = await createUser({ role: "partenaire", partnerActivity: "chauffeur", entityType: "particulier", emailVerified: true, createdAt: IL_Y_A_10_JOURS });
    const valide = await createUser({ role: "partenaire", isFounder: true, partnerActivity: "loueur", entityType: "entreprise", createdAt: IL_Y_A_10_JOURS });
    const test = await createUser({ role: "partenaire", isTestAccount: true, partnerActivity: "loueur", entityType: "particulier", createdAt: IL_Y_A_10_JOURS });
    await checkAndSendPartnerReminders();

    const notifs = await Notification.find({ user: chauffeur._id, type: "dossier_partenaire" }).lean();
    expect(notifs).toHaveLength(1);
    expect(notifs[0].message).toContain("Permis de conduire");
    expect(notifs[0].message).toContain("CV");
    expect(notifs[0].message).not.toMatch(/registre|RCCM|identité/i);
    expect(notifs[0].skipEmail).toBe(true);   // l'e-mail dédié part seul, pas en double
    expect(await Notification.exists({ user: valide._id, type: "dossier_partenaire" })).toBeNull();
    expect(await Notification.exists({ user: test._id, type: "dossier_partenaire" })).toBeNull();
  });

  it("trois relances au plus pour la même liste de pièces ; le compteur repart quand la liste change", async () => {
    const u = await createUser({ role: "partenaire", partnerActivity: "loueur", entityType: "professionnel", emailVerified: true, createdAt: IL_Y_A_10_JOURS });
    for (let i = 0; i < 5; i++) {
      await checkAndSendPartnerReminders();
      await User.updateOne({ _id: u._id }, { $set: { "validationPartenaire.relances.derniere": IL_Y_A_10_JOURS } });
    }
    expect(await Notification.countDocuments({ user: u._id, type: "dossier_partenaire" })).toBe(3);

    await User.updateOne({ _id: u._id }, { $set: { kycStatus: "VERIFIE" } });   // il reste le registre seulement
    await checkAndSendPartnerReminders();
    const derniere = await Notification.findOne({ user: u._id, type: "dossier_partenaire" }).sort({ createdAt: -1 }).lean();
    expect(await Notification.countDocuments({ user: u._id, type: "dossier_partenaire" })).toBe(4);
    expect(derniere.message).toContain("Registre de commerce");
    expect(derniere.message).not.toContain("Pièce d'identité");
  });
});
