import { describe, it, expect, vi } from "vitest";
import router from "../routes/partnerCrm.js";
import { adminCreate, adminList, adminStats, adminGetOne, adminUpdate, adminUpdateStatut, adminAddEchange, adminLink } from "../controllers/partnerCrmController.js";
import PartnerCrm from "../models/PartnerCrm.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// CRM partenaires — suivi commercial (2026-10-28) : journal des échanges,
// prochaine action, abandon motivé, doublons possibles, portée « partners ».
// ═══════════════════════════════════════════════════════════════════════════

const appel = async (fn, opts) => { const m = mockReqRes(opts); await fn(m.req, m.res); return m.res; };

describe("CRM partenaires — permissions", () => {
  it("chaque route exige la portée « partners » : un admin KYC est refusé, un admin partenaires passe", () => {
    const routes = router.stack.filter((l) => l.route);
    expect(routes.length).toBeGreaterThan(5);
    for (const l of routes) {
      const chaine = l.route.stack.map((s) => s.handle);
      const garde = chaine.find((h, i) => i > 1 && i < chaine.length - 1 && h.length === 3);
      expect(garde, l.route.path).toBeTruthy();
      const essayer = (adminScope) => { const m = mockReqRes({ user: { role: "admin", adminScope } }); const next = vi.fn(); garde(m.req, m.res, next); return { next, res: m.res }; };
      const refus = essayer(["kyc"]);
      expect(refus.next, `${l.route.path} ouvert à un admin KYC`).not.toHaveBeenCalled();
      if (l.route.methods.delete) continue;                       // suppression : admin général seul
      expect(essayer(["partners"]).next).toHaveBeenCalled();
    }
  });
});

describe("CRM partenaires — doublons possibles", () => {
  it("signale une fiche au même e-mail, au même téléphone (format différent) ou au même nom, et un compte existant", async () => {
    const admin = await createUser({ role: "admin" });
    await PartnerCrm.create({ entreprise: "Garage Atlas", contactEmail: "contact@atlas.ma", contactTel: "+212 6 61 23 45 67" });
    await createUser({ role: "partenaire", email: "dir@sahara-cars.ma" });

    const r1 = await appel(adminCreate, { user: admin, body: { entreprise: "Autre", contactTel: "0661-234567" } });
    expect(r1.statusCode).toBe(409);
    expect(r1.body.doublons[0]).toMatchObject({ type: "prospect", motifs: ["contactTel"] });

    const r2 = await appel(adminCreate, { user: admin, body: { entreprise: "  garage atlas " } });
    expect(r2.body.doublons[0].motifs).toEqual(["entreprise"]);

    const r3 = await appel(adminCreate, { user: admin, body: { entreprise: "Sahara Cars", contactEmail: "DIR@sahara-cars.ma" } });
    expect(r3.body.doublons).toEqual([expect.objectContaining({ type: "compte", motifs: ["email"] })]);

    const forcee = await appel(adminCreate, { user: admin, body: { entreprise: "Garage Atlas", confirmerDoublon: true } });
    expect(forcee.statusCode).toBe(201);
    const libre = await appel(adminCreate, { user: admin, body: { entreprise: "Nouveau Loueur", contactEmail: "x@nouveau.ma" } });
    expect(libre.statusCode).toBe(201);

    const fiche = await appel(adminGetOne, { user: admin, params: { id: String(forcee.body.crm._id) } });
    expect(fiche.body.doublons.map((d) => d.libelle)).toEqual([expect.stringContaining("Garage Atlas")]);
  });
});

describe("CRM partenaires — suivi", () => {
  it("journal des échanges : ajout daté, dernier contact et prochaine action mis à jour ; pas d'échange futur ni vide", async () => {
    const admin = await createUser({ role: "admin" });
    const crm = await PartnerCrm.create({ entreprise: "Loueur Sud" });
    const echeance = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const r = await appel(adminAddEchange, { user: admin, params: { id: String(crm._id) },
      body: { canal: "whatsapp", resume: "Intéressé, attend la grille", prochaineAction: "Envoyer la grille", nextFollowUpDate: echeance } });
    expect(r.statusCode).toBe(201);
    const apres = await PartnerCrm.findById(crm._id).lean();
    expect(apres.echanges).toHaveLength(1);
    expect(apres.echanges[0]).toMatchObject({ canal: "whatsapp", resume: "Intéressé, attend la grille" });
    expect(String(apres.echanges[0].par)).toBe(String(admin._id));
    expect(apres).toMatchObject({ lastContactChannel: "whatsapp", prochaineAction: "Envoyer la grille" });

    expect((await appel(adminAddEchange, { user: admin, params: { id: String(crm._id) }, body: { resume: " " } })).statusCode).toBe(400);
    expect((await appel(adminAddEchange, { user: admin, params: { id: String(crm._id) },
      body: { resume: "plus tard", date: new Date(Date.now() + 5 * 86400000) } })).statusCode).toBe(400);

    await appel(adminUpdate, { user: admin, params: { id: String(crm._id) }, body: { prochaineAction: "Rappeler lundi" } });
    expect((await PartnerCrm.findById(crm._id).lean()).prochaineAction).toBe("Rappeler lundi");
  });

  it("abandon : motif obligatoire, exclu des relances ; un compte lié le remet dans le pipeline", async () => {
    const admin = await createUser({ role: "admin" });
    const crm = await PartnerCrm.create({ entreprise: "Perdu SARL", nextFollowUpDate: new Date(Date.now() - 86400000) });
    await PartnerCrm.create({ entreprise: "À relancer", nextFollowUpDate: new Date(Date.now() - 86400000) });
    await PartnerCrm.create({ entreprise: "Plus tard", nextFollowUpDate: new Date(Date.now() + 9 * 86400000) });

    expect((await appel(adminUpdateStatut, { user: admin, params: { id: String(crm._id) }, body: { statut: "ABANDONNE" } })).statusCode).toBe(400);
    const ok = await appel(adminUpdateStatut, { user: admin, params: { id: String(crm._id) }, body: { statut: "ABANDONNE", motif: "Pas de flotte" } });
    expect(ok.body).toMatchObject({ statut: "ABANDONNE", motifAbandon: "Pas de flotte" });

    const relances = await appel(adminList, { user: admin, query: { aRelancer: "1" } });
    expect(relances.body.items.map((i) => i.entreprise)).toEqual(["À relancer"]);
    const stats = await appel(adminStats, { user: admin });
    expect(stats.body).toMatchObject({ aRelancer: 1, byStatut: { ABANDONNE: 1 } });

    const p = await createUser({ role: "partenaire" });
    await appel(adminLink, { user: admin, params: { id: String(crm._id) }, body: { userId: String(p._id) } });
    const relie = await PartnerCrm.findById(crm._id).lean();
    expect(relie).toMatchObject({ statut: "INSCRIT", motifAbandon: null });
  });

  it("les indicateurs d'activation viennent du calcul réel, pas de l'étape saisie", async () => {
    const admin = await createUser({ role: "admin" });
    const actif = await createUser({ role: "partenaire", firstName: "A", lastName: "B", country: "MA", phone: "+212600000001",
      emailVerified: true, validationPartenaire: { statut: "valide" } });
    await createVehicleDoc({ owner: actif._id });
    const nu = await createUser({ role: "partenaire" });
    await PartnerCrm.create({ entreprise: "Vraiment actif", statut: "QUALIFIE", linkedUserId: actif._id });
    await PartnerCrm.create({ entreprise: "Déclaré actif", statut: "ACTIF", linkedUserId: nu._id });
    const stats = await appel(adminStats, { user: admin });
    expect(stats.body.activationReelle).toMatchObject({ comptesLies: 2, active: 1, inscrit: 1 });
  });
});
