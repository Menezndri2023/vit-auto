import { describe, it, expect, beforeEach, vi } from "vitest";

// Pièces : ImageKit bouchonné (aucun envoi réel).
vi.mock("../config/imagekit.js", async (orig) => ({
  ...(await orig()),
  uploadDocument: vi.fn(async () => ({ url: "https://ik.example/vit-auto/docs/litiges/piece.pdf" })),
}));

const { validateTransaction, resolveDispute, respondToDispute } = await import("../controllers/bookingController.js");
const L = await import("../controllers/logistiqueController.js");
const { listerLitiges, listerLitigesCible, message } = await import("../controllers/litigeController.js");
const { reprendreLitigesExistants } = await import("../services/litigeService.js");
const { default: Booking } = await import("../models/Booking.js");
const { default: Litige } = await import("../models/Litige.js");
const { default: Prestataire } = await import("../models/Prestataire.js");
const { createUser, createVehicleDoc } = await import("./helpers/fixtures.js");
const { mockReqRes } = await import("./helpers/mockReqRes.js");

// ═══════════════════════════════════════════════════════════════════════════
// RÉCLAMATIONS DES RÉSERVATIONS ET DE LA LOGISTIQUE (2026-11-01)
// ═══════════════════════════════════════════════════════════════════════════
// Même modèle que l'Import/Export : dossier, échanges, pièces, décision écrite.
// Les étapes existantes (« contestée », « litige ») restent posées par leurs
// propres écrans ; la décision de l'équipe y clôt la réclamation.

const appel = async (fn, { user, body = {}, params = {}, query = {} }) => {
  const m = mockReqRes({ user, body, params, query });
  m.res.setHeader = () => {};
  await fn(m.req, m.res);
  return m.res;
};
const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };

async function reservation(overrides = {}) {
  const client = await createUser({ role: "client" });
  const partner = await createUser({ role: "partenaire" });
  const vehicle = await createVehicleDoc({ owner: partner._id });
  const booking = await Booking.create({
    type: "location", status: "waiting_client_validation", client: client._id, clientInfo,
    adminValidation: { status: "approved" }, vehicle: vehicle._id,
    location: { startDate: new Date("2027-03-01"), endDate: new Date("2027-03-03"), days: 2 },
    montantBase: 20000, montantTotal: 20000, commissionRate: 0.1, commissionAmount: 2000, partnerPayout: 18000,
    ...overrides,
  });
  return { client, partner, booking };
}

beforeEach(async () => { await Litige.init(); });

describe("Réservations", () => {
  it("la contestation du client ouvre un dossier de réclamation ; le partenaire y répond ; la résolution le clôt", async () => {
    const { client, partner, booking } = await reservation();
    const admin = await createUser({ role: "admin" });
    const id = String(booking._id);

    const c = await appel(validateTransaction, { user: client, params: { id }, body: { action: "dispute", disputeReason: "Véhicule rendu avec une jante abîmée avant ma prise en main." } });
    expect(c.statusCode).toBe(200);
    let litige = await Litige.findOne({ "transaction.type": "reservation", "transaction.id": booking._id }).lean();
    expect(litige).toMatchObject({ partieOuvrante: "acheteur", etat: "opened", ouvert: true, motif: "autre" });
    expect(litige.description).toMatch(/jante abîmée/);
    expect(litige.contexte.statutCommercial).toBe("disputed");

    // Le partenaire voit le dossier et répond : la réponse y est recopiée.
    const vue = await appel(listerLitigesCible, { user: partner, params: { type: "reservation", id } });
    expect(vue.statusCode).toBe(200);
    expect(vue.body).toMatchObject({ partie: "vendeur" });
    await appel(respondToDispute, { user: partner, params: { id }, body: { message: "Jante déjà signalée à l'état des lieux de départ." } });
    litige = await Litige.findById(litige._id).lean();
    expect(litige.messages.map((m) => [m.partie, m.texte])).toEqual([["vendeur", "Jante déjà signalée à l'état des lieux de départ."]]);

    // Un tiers n'y a pas accès.
    const tiers = await createUser({ role: "client" });
    expect((await appel(listerLitigesCible, { user: tiers, params: { type: "reservation", id } })).statusCode).toBe(403);

    const r = await appel(resolveDispute, { user: admin, params: { id }, body: { resolution: "completed", note: "État des lieux de départ probant." } });
    expect(r.statusCode).toBe(200);
    litige = await Litige.findById(litige._id).lean();
    expect(litige).toMatchObject({ etat: "closed", ouvert: false });
    expect(litige.issue).toMatchObject({ decision: "Prestation validée", justification: "État des lieux de départ probant." });
    expect(litige.actions.at(-1).quoi).toBe("cloture_par_decision");
  });

  it("une seconde contestation après résolution ouvre un nouveau dossier, jamais deux ouverts à la fois", async () => {
    const { client, booking } = await reservation();
    const id = String(booking._id);
    await appel(validateTransaction, { user: client, params: { id }, body: { action: "dispute", disputeReason: "Premier problème signalé." } });
    // Rejouée (double clic, reprise) : le dossier existant est rendu, pas dupliqué.
    const { ouvrirLitigeCible } = await import("../services/litigeService.js");
    const b = await Booking.findById(id).populate("vehicle", "owner");
    await ouvrirLitigeCible("reservation", b, client, { description: "doublon" });
    expect(await Litige.countDocuments({ "transaction.id": booking._id })).toBe(1);
  });

  it("les parties échangent par la route commune ; un admin limité à l'Import/Export n'instruit pas une réservation", async () => {
    const { client, booking } = await reservation();
    const id = String(booking._id);
    await appel(validateTransaction, { user: client, params: { id }, body: { action: "dispute", disputeReason: "Kilométrage facturé supérieur au réel." } });
    const litige = await Litige.findOne({ "transaction.id": booking._id });
    expect((await appel(message, { user: client, params: { litigeId: String(litige._id) }, body: { texte: "Photo du compteur jointe." } })).statusCode).toBe(200);

    const adminIE = await createUser({ role: "admin", adminScope: ["import_export"] });
    expect((await appel(listerLitigesCible, { user: adminIE, params: { type: "reservation", id } })).statusCode).toBe(403);
    expect((await appel(message, { user: adminIE, params: { litigeId: String(litige._id) }, body: { texte: "…" } })).statusCode).toBe(403);
    const listeIE = await appel(listerLitiges, { user: adminIE, query: {} });
    expect(listeIE.body.litiges.map((l) => l.transaction.type)).not.toContain("reservation");

    const adminResa = await createUser({ role: "admin", adminScope: ["bookings"] });
    const liste = await appel(listerLitiges, { user: adminResa, query: {} });
    expect(liste.body.litiges).toHaveLength(1);
    expect(liste.body.litiges[0].cible).toMatchObject({ libelle: "Réservation", statut: "disputed" });
  });
});

describe("Logistique", () => {
  it("le litige logistique ouvre un dossier ; l'intervention de l'admin le clôt avec sa note", async () => {
    const client = await createUser({ role: "client", emailVerified: true });
    const admin = await createUser({ role: "admin" });
    const userP = await createUser({ role: "prestataire" });
    const prest = await Prestataire.create({ user: userP._id, raisonSociale: "Atlas Transport", types: ["transporteur"], pays: ["FR", "MA"] });
    const cree = await appel(L.creerDemande, { user: client, body: {
      typeBesoin: "vehicule", depart: { pays: "FR", ville: "Marseille" }, arrivee: { pays: "MA", ville: "Casablanca" },
      marchandise: { vehicule: { marque: "Peugeot", modele: "3008", annee: 2021, roulant: true } }, contact: { telephone: "+212600000000" },
    } });
    const id = cree.body.demande._id;
    await appel(L.qualifierDemande, { user: admin, params: { id }, body: { decision: "valider" } });
    await appel(L.solliciterPrestataires, { user: admin, params: { id }, body: { prestataires: [prest._id] } });
    const devis = await appel(L.soumettreDevis, { user: userP, params: { id }, body: {
      montant: 1200, devise: "EUR", inclus: "Transport", exclus: "Douane", delaiJoursMin: 7, delaiJoursMax: 12,
      valideJusquau: new Date(Date.now() + 10 * 86400000).toISOString(), modalitesPaiement: "Virement", conditionsAnnulation: "Sans frais",
    } });
    await appel(L.accepterDevis, { user: client, params: { id, devisId: devis.body.demande.mesDevis.at(-1)._id } });
    for (const statut of ["commande_confirmee", "en_preparation", "en_transport"]) await appel(L.avancerEtape, { user: userP, params: { id }, body: { statut } });

    await appel(L.ouvrirLitige, { user: client, params: { id }, body: { motif: "Véhicule rayé à la livraison" } });
    let litige = await Litige.findOne({ "transaction.type": "logistique", "transaction.id": id }).lean();
    expect(litige).toMatchObject({ partieOuvrante: "acheteur", description: "Véhicule rayé à la livraison", ouvert: true });
    // Le prestataire retenu est la partie « vendeur ».
    expect((await appel(listerLitigesCible, { user: userP, params: { type: "logistique", id } })).body.partie).toBe("vendeur");

    await appel(L.interventionAdmin, { user: admin, params: { id }, body: { statut: "cloturee", note: "Accord amiable entre les parties" } });
    litige = await Litige.findById(litige._id).lean();
    expect(litige).toMatchObject({ etat: "closed", issue: { justification: "Accord amiable entre les parties" } });
  });
});

describe("Reprise des réclamations ouvertes avant le 2026-11-01", () => {
  it("chaque réservation contestée reçoit son dossier daté, avec la réponse du partenaire ; rejouée, rien n'est dupliqué", async () => {
    const ouverte = new Date("2026-10-20T10:00:00Z");
    const { booking } = await reservation({
      status: "disputed",
      clientValidation: { validatedAt: null, disputedAt: ouverte, disputeReason: "Ancien litige." },
      partnerDisputeResponse: { message: "Réponse d'origine.", respondedAt: new Date("2026-10-21T10:00:00Z") },
    });
    const avant = await Booking.findById(booking._id).lean();

    expect(await reprendreLitigesExistants()).toMatchObject({ reservations: 1 });
    expect(await reprendreLitigesExistants()).toMatchObject({ reservations: 1 });
    const dossiers = await Litige.find({ "transaction.id": booking._id }).lean();
    expect(dossiers).toHaveLength(1);
    expect(dossiers[0].ouvertLe.toISOString()).toBe(ouverte.toISOString());
    expect(dossiers[0].messages).toHaveLength(1);
    expect(dossiers[0].messages[0]).toMatchObject({ partie: "vendeur", texte: "Réponse d'origine." });
    // La réservation elle-même n'est pas modifiée.
    const apres = await Booking.findById(booking._id).lean();
    expect(apres.status).toBe("disputed");
    expect(apres.updatedAt?.getTime()).toBe(avant.updatedAt?.getTime());
  });
});
