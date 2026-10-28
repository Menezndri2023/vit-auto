import { describe, it, expect } from "vitest";
import { mesProspects, prospectsAdmin } from "../controllers/prospectsController.js";
import { adminList, adminGetOne } from "../controllers/partnerCrmController.js";
import Lead from "../models/Lead.js";
import SalesLead from "../models/SalesLead.js";
import PartnerCrm from "../models/PartnerCrm.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// Prospects — vue unifiée sans fusion des données (2026-10-28)
// ═══════════════════════════════════════════════════════════════════════════

async function jeu() {
  const p = await createUser({ role: "partenaire" });
  const autre = await createUser({ role: "partenaire" });
  const v = await createVehicleDoc({ owner: p._id });
  await Lead.create({ partnerId: p._id, buyer: { name: "Moussa K", phone: "+22501020304" }, vehicle: { make: "Toyota", model: "Hilux" }, status: "negociation", budget: { incoterm: "FCA" } });
  await Lead.create({ partnerId: autre._id, buyer: { name: "Pas à moi" } });
  const masque = await SalesLead.create({ vehicle: v._id, partner: p._id, status: "SENT_TO_PARTNER",
    client: { firstName: "Awa", lastName: "Diallo", phone: "+221771234567", email: "awa@example.com" }, listingSnapshot: { title: "Kia Sportage" } });
  const revele = await SalesLead.create({ vehicle: v._id, partner: p._id, status: "SOLD", contact: { disclosedToPartnerAt: new Date() },
    client: { firstName: "Yao", lastName: "Kouame", phone: "+2250707070707", email: "yao@example.com" } });
  return { p, autre, masque, revele };
}

describe("Prospects — vue unifiée", () => {
  it("le partenaire voit SES prospects des deux sources, normalisés, sans coordonnées non révélées", async () => {
    const { p, masque, revele } = await jeu();
    const m = mockReqRes({ user: p });
    await mesProspects(m.req, m.res);
    const { prospects, synthese } = m.res.body;
    expect(synthese).toMatchObject({ total: 3, parSource: { partenaire: 1, vit_auto: 2 }, parEtape: { nouveau: 1, en_cours: 1, gagne: 1, perdu: 0 } });
    expect(prospects.find((x) => x.client.nom === "Pas à moi")).toBeUndefined();

    const crm = prospects.find((x) => x.source === "partenaire");
    expect(crm).toMatchObject({ etape: "en_cours", commissionVitAuto: false, objet: "Toyota Hilux" });

    const cache = prospects.find((x) => x.id === String(masque._id));
    expect(cache).toMatchObject({ source: "vit_auto", commissionVitAuto: true, coordonneesRevelees: false, etape: "nouveau" });
    expect(cache.client.email).toBeNull();
    expect(cache.client.telephone).not.toContain("1234567");
    expect(cache.client.nom).toBe("Awa D.");

    const vu = prospects.find((x) => x.id === String(revele._id));
    expect(vu).toMatchObject({ coordonneesRevelees: true, etape: "gagne" });
    expect(vu.client.email).toBe("yao@example.com");
  });

  it("filtres par étape et par source ; un client n'y a pas accès", async () => {
    const { p } = await jeu();
    const m = mockReqRes({ user: p, query: { source: "vit_auto", etape: "gagne" } });
    await mesProspects(m.req, m.res);
    expect(m.res.body.prospects).toHaveLength(1);
    const c = mockReqRes({ user: await createUser({ role: "client" }) });
    await mesProspects(c.req, c.res);
    expect(c.res.statusCode).toBe(403);
  });

  it("l'administrateur voit tout, coordonnées comprises, et peut filtrer par partenaire", async () => {
    const { p, masque } = await jeu();
    const tout = mockReqRes({ user: await createUser({ role: "admin" }) });
    await prospectsAdmin(tout.req, tout.res);
    expect(tout.res.body.synthese.total).toBe(4);
    expect(tout.res.body.prospects.find((x) => x.id === String(masque._id)).client.email).toBe("awa@example.com");
    const un = mockReqRes({ query: { partenaire: String(p._id) } });
    await prospectsAdmin(un.req, un.res);
    expect(un.res.body.synthese.total).toBe(3);
  });

  it("Lead accepte les onze règles Incoterms® 2020 et refuse un code inconnu", async () => {
    const p = await createUser({ role: "partenaire" });
    await expect(Lead.create({ partnerId: p._id, budget: { incoterm: "DPU" } })).resolves.toBeTruthy();
    await expect(Lead.create({ partnerId: p._id, budget: { incoterm: "DAT" } })).rejects.toThrow();
  });
});

describe("Pipeline de recrutement ↔ activation réelle", () => {
  it("un prospect CRM lié à un partenaire montre son statut d'activation calculé", async () => {
    const admin = await createUser({ role: "admin" });
    const p = await createUser({ role: "partenaire", firstName: "Ali", lastName: "B", country: "MA", phone: "+212600000000",
      emailVerified: true, validationPartenaire: { statut: "valide" } });
    const crm = await PartnerCrm.create({ entreprise: "Garage Ali", statut: "NEGOCIATION", linkedUserId: p._id });
    await PartnerCrm.create({ entreprise: "Sans compte" });

    const l = mockReqRes({ user: admin });
    await adminList(l.req, l.res);
    expect(l.res.body.items.find((i) => i.entreprise === "Garage Ali").activation).toMatchObject({ statut: "verifie", manquants: ["offresExploitables"], offres: 0 });
    expect(l.res.body.items.find((i) => i.entreprise === "Sans compte").activation).toBeUndefined();

    await createVehicleDoc({ owner: p._id });
    const g = mockReqRes({ user: admin, params: { id: String(crm._id) } });
    await adminGetOne(g.req, g.res);
    expect(g.res.body.activation.statut).toBe("active");
  });
});
