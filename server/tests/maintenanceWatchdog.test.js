import { describe, it, expect } from "vitest";
import { createPart } from "../controllers/partController.js";
import { submitIdentity } from "../controllers/usersController.js";
import { calculerEtatMaintenance, lignesDigestMaintenance, ACTION_REFUS_PUBLICATION } from "../utils/maintenanceWatchdog.js";
import AuditLog from "../models/AuditLog.js";
import SparePart from "../models/SparePart.js";
import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Incident du 2026-10-05 : un partenaire « pièces » (particulier, identité en
// examen) publie, le serveur refuse, rien n'est enregistré nulle part et
// l'administrateur ne trouve pas l'annonce. La veille de maintenance doit
// désormais rendre ce refus visible, et compter ce qui attend.
const IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const piece = () => ({
  category: "FREINAGE", title: "Plaquettes avant Bosch", condition: "neuf",
  price: 40, currency: "USD", priceEntered: 40, priceEntryCurrency: "USD", stock: 2,
  shipping: { mode: "forfait", forfaitUSD: 5, deliveryDaysMin: 1, deliveryDaysMax: 3 },
  ville: "Abidjan", images: [IMG],
});
const check = (checks, id) => checks.find((c) => c.id === id);

describe("Veille de maintenance — publications refusées", () => {
  it("un refus de publication est journalisé et remonte dans la veille, avec le titre et le motif", async () => {
    const p = await createUser({
      role: "partenaire", sellerType: "particulier", partnerActivity: "pieces", country: "CI",
      kycStatus: "A_REVOIR_MANUELLEMENT", kycSubmittedAt: new Date(),
    });
    const { req, res } = mockReqRes({ user: p, body: piece() });
    await createPart(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("KYC_REQUIRED");
    expect(await SparePart.countDocuments()).toBe(0);

    // Le journal n'est pas attendu par la réponse : on le guette (la première
    // écriture de la collection crée ses index et peut prendre un moment).
    let log = null;
    for (let i = 0; i < 50 && !log; i++) {
      log = await AuditLog.findOne({ action: ACTION_REFUS_PUBLICATION });
      if (!log) await new Promise((r) => setTimeout(r, 100));
    }
    expect(log).toBeTruthy();
    expect(log.success).toBe(false);
    expect(log.resource).toBe("SparePart");
    expect(log.changes.after.titre).toBe("Plaquettes avant Bosch");
    expect(log.errorMessage).toMatch(/KYC_REQUIRED/);

    const checks = await calculerEtatMaintenance(new Date());
    const c = check(checks, "publications_refusees");
    expect(c.valeur).toBe(1);
    expect(c.niveau).toBe("attention");
    expect(lignesDigestMaintenance(checks).some((l) => l.includes("Publications refusées"))).toBe(true);
  });
});

describe("Veille de maintenance — files d'attente et identité", () => {
  it("compte les annonces en attente depuis plus de 24 h, pas les récentes", async () => {
    const owner = await createUser({ role: "partenaire" });
    const ancien = new Date(Date.now() - 3 * 24 * 3600000);
    await Vehicle.collection.insertMany([
      { title: "Ancienne", status: "pending", owner: owner._id, createdAt: ancien },
      { title: "Récente",  status: "pending", owner: owner._id, createdAt: new Date() },
    ]);
    const c = check(await calculerEtatMaintenance(new Date()), "moderation_vehicules");
    expect(c.valeur).toBe(1);
  });

  it("n'alerte pas sur la lecture des pièces pour des comptes semés sans lecture (démo)", async () => {
    await createUser({ role: "client", kycStatus: "VERIFIE", kycSubmittedAt: new Date(), kycOcrData: { ocrConfidence: 0 } });
    const c = check(await calculerEtatMaintenance(new Date()), "ocr_identite");
    expect(c.niveau).toBe("ok");
  });

  it("signale critique quand plusieurs vrais dossiers n'ont aucune lecture réussie", async () => {
    for (let i = 0; i < 3; i++) {
      await createUser({ role: "client", kycSubmittedAt: new Date(), kycOcrData: { documentType: "cni", ocrConfidence: 0 } });
    }
    const c = check(await calculerEtatMaintenance(new Date()), "ocr_identite");
    expect(c.niveau).toBe("critique");
  });

  it("liste les dossiers d'identité en attente depuis plus de 24 h, sans les comptes de test", async () => {
    const vieux = new Date(Date.now() - 2 * 24 * 3600000);
    await createUser({ role: "partenaire", firstName: "Sangare", kycStatus: "A_REVOIR_MANUELLEMENT", kycSubmittedAt: vieux });
    await createUser({ role: "partenaire", firstName: "Test", isTestAccount: true, kycStatus: "EN_ATTENTE", kycSubmittedAt: vieux });
    const c = check(await calculerEtatMaintenance(new Date()), "kyc_en_attente");
    expect(c.valeur).toBe(1);
    expect(c.detail).toMatch(/Sangare/);
  });
});

describe("Pièce d'identité depuis la page Profil", () => {
  it("met à jour une seule face sans effacer les autres photos déjà envoyées", async () => {
    const u = await createUser({ role: "partenaire" });
    let m = mockReqRes({ user: u, body: { type: "cni", number: "CI0012345", frontImage: IMG, backImage: IMG, selfie: IMG } });
    await submitIdentity(m.req, m.res);
    expect(m.res.statusCode).toBe(200);
    const avant = (await User.findById(u._id)).identity;
    expect(avant.backImage).toBeTruthy();
    expect(avant.selfie).toBeTruthy();

    // Nouvelle photo du recto seulement.
    m = mockReqRes({ user: u, body: { type: "cni", number: "CI0012345", frontImage: IMG } });
    await submitIdentity(m.req, m.res);
    expect(m.res.statusCode).toBe(200);
    const apres = (await User.findById(u._id)).identity;
    expect(apres.backImage).toBe(avant.backImage);
    expect(apres.selfie).toBe(avant.selfie);
    expect(apres.status).toBe("pending");
  });

  it("ne stocke plus la photo en clair dans le document utilisateur", async () => {
    const u = await createUser({ role: "client" });
    const m = mockReqRes({ user: u, body: { type: "passport", number: "AB123456", frontImage: IMG } });
    await submitIdentity(m.req, m.res);
    const enBase = await User.collection.findOne({ _id: u._id });
    expect(enBase.identity.frontImage.startsWith("data:")).toBe(false);
  });
});
