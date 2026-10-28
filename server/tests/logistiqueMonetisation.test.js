import { describe, it, expect, beforeEach, vi } from "vitest";

// L'envoi d'e-mail est observé, jamais réel (le fournisseur est en mode
// console dans les tests ; on vérifie en plus qui serait prévenu).
vi.mock("../config/email.js", async (orig) => ({ ...(await orig()), sendEmail: vi.fn(async () => ({ messageId: "test" })) }));

const { sendEmail } = await import("../config/email.js");
const L = await import("../controllers/logistiqueController.js");
const { getPublicConfig } = await import("../controllers/pricingController.js");
const Prestataire = (await import("../models/Prestataire.js")).default;
const PricingConfig = (await import("../models/PricingConfig.js")).default;
const CommissionLedger = (await import("../models/CommissionLedger.js")).default;
const { DEFAULT_PRICING_CONFIG } = await import("../config/defaultPricingConfig.js");
const { createUser } = await import("./helpers/fixtures.js");
const { mockReqRes } = await import("./helpers/mockReqRes.js");

// ═══════════════════════════════════════════════════════════════════════════
// Monétisation logistique : DÉSACTIVÉE (exploitant, 2026-10-28) — mesurée,
// jamais facturée. Valeur des transactions ≠ revenu de VIT AUTO.
// ═══════════════════════════════════════════════════════════════════════════

const appel = async (fn, { user, body = {}, params = {} }) => {
  const m = mockReqRes({ user, body, params });
  m.res.setHeader = () => {};
  await fn(m.req, m.res);
  return m.res;
};
const DEMANDE = { typeBesoin: "pieces", depart: { pays: "CN", ville: "Guangzhou" }, arrivee: { pays: "CI", ville: "Abidjan" }, marchandise: { description: "3 palettes de filtres" }, contact: { telephone: "+2250700000000" } };
const DEVIS = (montant) => ({ montant, devise: "USD", valideJusquau: new Date(Date.now() + 9 * 86400000).toISOString() });

let client; let admin; let p1;
beforeEach(async () => {
  sendEmail.mockClear();
  await PricingConfig.create({ ...DEFAULT_PRICING_CONFIG, key: "global" });
  client = await createUser({ role: "client", emailVerified: true });
  admin = await createUser({ role: "admin" });
  const u = await createUser({ role: "prestataire" });
  p1 = { user: u, prest: await Prestataire.create({ user: u._id, raisonSociale: "Canton Freight", types: ["transitaire"], pays: ["CN", "CI"] }) };
});

async function operationConclue(montant = 2400) {
  const id = (await appel(L.creerDemande, { user: client, body: DEMANDE })).body.demande._id;
  await appel(L.qualifierDemande, { user: admin, params: { id }, body: { decision: "valider" } });
  await appel(L.solliciterPrestataires, { user: admin, params: { id }, body: { prestataires: [p1.prest._id] } });
  const devisId = (await appel(L.soumettreDevis, { user: p1.user, params: { id }, body: DEVIS(montant) })).body.demande.mesDevis.at(-1)._id;
  await appel(L.accepterDevis, { user: client, params: { id, devisId } });
  for (const statut of ["commande_confirmee", "en_preparation", "en_transport", "livraison_declaree"]) {
    await appel(L.avancerEtape, { user: p1.user, params: { id }, body: { statut } });
  }
  await appel(L.confirmerLivraison, { user: client, params: { id } });
  return id;
}

describe("Monétisation logistique désactivée", () => {
  it("la configuration en vigueur dit explicitement : gratuit, aucune commission, aucun taux, aucun frais", async () => {
    const i = await L.calculerIndicateurs();
    expect(i.monetisation).toMatchObject({ active: false, modeEconomique: "FREE_REFERRAL", commissionActive: false, taux: null, fraisMiseEnRelationUSD: null });
    const m = mockReqRes({});
    await getPublicConfig(m.req, m.res);
    expect(m.res.body.logistique).toMatchObject({ modeEconomique: "FREE_REFERRAL", commissionActive: false, taux: null, fraisMiseEnRelationUSD: null });
  });

  it("une opération conclue : sa valeur est mesurée, le revenu VIT AUTO lu dans le registre reste 0", async () => {
    // Une commission d'un AUTRE pôle ne doit pas être comptée comme revenu logistique.
    await CommissionLedger.create({ transactionType: "booking", transactionId: "autre-pole", partner: client._id, grossAmount: 100, commissionRate: 10, commissionAmount: 10, netAmount: 90, currency: "USD", status: "confirmed" }).catch(() => null);
    await operationConclue(2400);
    const i = await L.calculerIndicateurs();
    expect(i.demandes).toMatchObject({ qualifiees: 1, devisAcceptes: 1, commandesConfirmees: 1, operationsConclues: 1, annulations: 0, litiges: 0 });
    expect(i.prestataires.devisRecus).toBe(1);
    expect(i.montantsDeclares).toEqual({ devis: { USD: 2400 }, commandes: { USD: 2400 }, conclues: { USD: 2400 } });
    expect(i.revenusVitAuto).toMatchObject({ montantUSD: 0, ecritures: 0 });
    expect(await CommissionLedger.countDocuments({ transactionType: { $nin: ["booking"] } })).toBe(0);
  });

  it("annulations et litiges sont comptés", async () => {
    const id1 = (await appel(L.creerDemande, { user: client, body: DEMANDE })).body.demande._id;
    await appel(L.annulerDemande, { user: client, params: { id: id1 }, body: { motif: "Commande annulée côté fournisseur" } });
    const id2 = await operationConclue(900);
    await appel(L.ouvrirLitige, { user: client, params: { id: id2 }, body: { motif: "Un carton manquant" } });
    const i = await L.calculerIndicateurs();
    expect(i.demandes.annulations).toBe(1);
    expect(i.demandes.litiges).toBe(1);
    expect(i.motifs.annulation).toContain("Commande annulée côté fournisseur");
  });

  it("les événements déclencheurs potentiels sont mesurés et tous inactifs", async () => {
    await operationConclue();
    const { evenementsDeclencheursPotentiels: ev } = await L.calculerIndicateurs();
    expect(ev.map((e) => e.code)).toEqual(["demande_qualifiee", "devis_accepte", "commande_confirmee", "transport_commence", "operation_conclue"]);
    expect(ev.every((e) => e.actif === false)).toBe(true);
    expect(ev.every((e) => e.nombre === 1)).toBe(true);
  });

  it("l'export CSV montre la monétisation inactive", async () => {
    const r = await appel(L.exporterIndicateurs, { user: admin });
    expect(r.body).toContain("monetisation.active");
    expect(r.body).toContain("FREE_REFERRAL");
    expect(r.body).toMatch(/evenementPotentiel\.operation_conclue\.nombre \(inactif\)/);
  });
});

describe("E-mails logistiques", () => {
  it("le prestataire sollicité, puis le client à chaque devis, sont prévenus par e-mail ; le texte saisi est échappé", async () => {
    const id = (await appel(L.creerDemande, { user: client, body: { ...DEMANDE, depart: { pays: "CN", ville: "<script>x</script>Canton" } } })).body.demande._id;
    await appel(L.qualifierDemande, { user: admin, params: { id }, body: { decision: "valider" } });
    sendEmail.mockClear();
    await appel(L.solliciterPrestataires, { user: admin, params: { id }, body: { prestataires: [p1.prest._id] } });
    await vi.waitFor(() => expect(sendEmail.mock.calls.some(([e]) => e.to === p1.user.email)).toBe(true));
    const mail = sendEmail.mock.calls.find(([e]) => e.to === p1.user.email)[0];
    expect(mail.html).not.toContain("<script>x</script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toMatch(/aucune commission ni aucun frais/);

    sendEmail.mockClear();
    await appel(L.soumettreDevis, { user: p1.user, params: { id }, body: DEVIS(500) });
    await vi.waitFor(() => expect(sendEmail.mock.calls.some(([e]) => e.to === client.email)).toBe(true));
  });

  it("aucun e-mail si le destinataire a désactivé ses confirmations", async () => {
    await client.updateOne({ notif_bookingConfirmations: false });
    sendEmail.mockClear();
    await appel(L.creerDemande, { user: client, body: DEMANDE });
    await new Promise((r) => setTimeout(r, 150));
    expect(sendEmail.mock.calls.some(([e]) => e.to === client.email)).toBe(false);
  });
});
