import { describe, it, expect } from "vitest";
import { refusDePerimetre } from "../utils/perimetre.js";
import { refusDeQuota, annoncesActives, fondateurActif } from "../services/quotaAnnonces.js";
import { FIN_IMMUNITE_QUOTAS, PLAN_QUOTA_ANNONCES, PLAN_SECTEURS } from "../constants/planFeatures.js";
import { secteursDuPartenaire, estUniquementLoisirs, secteurPourTypeVehicule } from "../constants/partnerTaxonomy.js";
import { createVehicle } from "../controllers/vehicleController.js";
import { createActivity } from "../controllers/activityController.js";
import { createDriver } from "../controllers/driverController.js";
import { createListing } from "../controllers/importExportController.js";
import { mesSecteurs, demanderSecteur, adminListerDemandes, adminTraiterDemande } from "../controllers/partnerSectorController.js";
import PartnerSectorRequest from "../models/PartnerSectorRequest.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { createUser, createVehicleDoc, createActivityDoc, createDriverDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Un instant APRÈS la fin de l'immunité de lancement : c'est là que les quotas
// s'appliquent. Tous les tests de quota passent cette date explicitement —
// « aujourd'hui » est immunisé par construction.
const APRES_IMMUNITE = new Date(FIN_IMMUNITE_QUOTAS.getTime() + 24 * 3600 * 1000);

const partenaire = (overrides = {}) =>
  createUser({ role: "partenaire", isFounder: true, sellerType: "particulier", ...overrides });

const abonner = (user, plan) => Subscription.create({
  vendor: user._id, plan,
  planDetails: { startDate: new Date(), isActive: true, priceUSD: 19.99, endDate: new Date(Date.now() + 30 * 86400000) },
});

describe("Secteurs d'un compte (taxonomie)", () => {
  it("réunit le secteur d'inscription et les secteurs accordés, sans doublon", () => {
    expect(secteursDuPartenaire({ partnerActivity: "loueur", partnerActivities: ["loueur", "vendeur"] })).toEqual(["loueur", "vendeur"]);
    expect(secteursDuPartenaire({})).toEqual([]);
    expect(estUniquementLoisirs({ partnerActivity: "loisirs" })).toBe(true);
    expect(estUniquementLoisirs({ partnerActivity: "loisirs", partnerActivities: ["loueur"] })).toBe(false);
    expect(estUniquementLoisirs({})).toBe(false);
  });

  it("relie le type d'annonce véhicule à son secteur", () => {
    expect(secteurPourTypeVehicule("location")).toBe("loueur");
    expect(secteurPourTypeVehicule("vente")).toBe("vendeur");
    expect(secteurPourTypeVehicule("autre")).toBeNull();
  });
});

describe("Garde de périmètre — le serveur refuse ce que le dashboard masque", () => {
  it("laisse passer un admin et un compte historique sans secteur", () => {
    expect(refusDePerimetre({ role: "admin" }, "loisirs")).toBeNull();
    expect(refusDePerimetre({ role: "partenaire" }, "loisirs")).toBeNull();
  });

  it("refuse un secteur non couvert avec le code SECTEUR_REQUIS", () => {
    const r = refusDePerimetre({ role: "partenaire", partnerActivity: "loisirs" }, "loueur", "publier une annonce");
    expect(r.code).toBe("SECTEUR_REQUIS");
    expect(r.secteur).toBe("loueur");
    expect(r.message).toMatch(/Location/);
  });

  it("un partenaire loisirs ne publie ni véhicule, ni chauffeur, ni annonce d'export", async () => {
    const plongee = await partenaire({ partnerActivity: "loisirs" });

    let { req, res } = mockReqRes({ user: plongee, body: { title: "Toyota", type: "location" } });
    await createVehicle(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("SECTEUR_REQUIS");

    ({ req, res } = mockReqRes({ user: plongee, body: { name: "Moi", licenseNumber: "X" } }));
    await createDriver(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("SECTEUR_REQUIS");

    ({ req, res } = mockReqRes({ user: plongee, body: {} }));
    await createListing(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("SECTEUR_REQUIS");
  });

  it("un loueur ne publie pas d'activité, mais publie une location — et une vente une fois le secteur accordé", async () => {
    const loueur = await partenaire({ partnerActivity: "loueur" });

    let { req, res } = mockReqRes({ user: loueur, body: { title: "Plongée", price: 50 } });
    await createActivity(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("SECTEUR_REQUIS");

    ({ req, res } = mockReqRes({ user: loueur, body: { title: "Clio", type: "vente" } }));
    await createVehicle(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("SECTEUR_REQUIS");

    ({ req, res } = mockReqRes({ user: loueur, body: { title: "Clio", type: "location" } }));
    await createVehicle(req, res);
    expect(res.statusCode).not.toBe(403);
    expect(res.body.vehicle).toBeTruthy();

    loueur.partnerActivities = ["vendeur"];
    ({ req, res } = mockReqRes({ user: loueur, body: { title: "Clio", type: "vente" } }));
    await createVehicle(req, res);
    expect(res.statusCode).not.toBe(403);
  });
});

describe("Quota d'annonces par secteur et par plan", () => {
  it("compte uniquement les annonces actives (en attente ou approuvées) du secteur demandé", async () => {
    const p = await partenaire({ partnerActivity: "loueur", partnerActivities: ["vendeur", "loisirs", "chauffeur"] });
    await createVehicleDoc({ owner: p._id, type: "location", status: "approved" });
    await createVehicleDoc({ owner: p._id, type: "location", status: "pending" });
    await createVehicleDoc({ owner: p._id, type: "location", status: "archived" });
    await createVehicleDoc({ owner: p._id, type: "vente", status: "approved" });
    await createActivityDoc({ owner: p._id, status: "approved" });
    await createDriverDoc({ owner: p._id, status: "rejected" });

    expect(await annoncesActives(p._id, "loueur")).toBe(2);
    expect(await annoncesActives(p._id, "vendeur")).toBe(1);
    expect(await annoncesActives(p._id, "loisirs")).toBe(1);
    expect(await annoncesActives(p._id, "chauffeur")).toBe(0);
    expect(await annoncesActives(p._id, "inconnu")).toBe(0);
  });

  it("n'applique aucun quota avant la fin de l'immunité de lancement", async () => {
    const p = await partenaire({ partnerActivity: "loueur" });
    for (let i = 0; i < PLAN_QUOTA_ANNONCES.free + 2; i++) await createVehicleDoc({ owner: p._id, type: "location", status: "approved" });
    expect(await refusDeQuota(p, "loueur", new Date())).toBeNull();
    expect(await refusDeQuota(p, "loueur", new Date(FIN_IMMUNITE_QUOTAS.getTime() - 1000))).toBeNull();
  });

  it("après l'immunité, bloque un compte gratuit au quota du plan, et seulement dans ce secteur", async () => {
    const p = await partenaire({ partnerActivity: "loueur", partnerActivities: ["vendeur"] });
    for (let i = 0; i < PLAN_QUOTA_ANNONCES.free; i++) await createVehicleDoc({ owner: p._id, type: "location", status: "approved" });

    const refus = await refusDeQuota(p, "loueur", APRES_IMMUNITE);
    expect(refus.code).toBe("QUOTA_ANNONCES");
    expect(refus.quota).toBe(PLAN_QUOTA_ANNONCES.free);
    expect(refus.plan).toBe("free");
    // Le secteur Vente, lui, est vide : pas de refus.
    expect(await refusDeQuota(p, "vendeur", APRES_IMMUNITE)).toBeNull();
  });

  it("le quota suit le plan effectif du compte", async () => {
    const p = await partenaire({ partnerActivity: "loueur" });
    await abonner(p, "business");
    for (let i = 0; i < PLAN_QUOTA_ANNONCES.free + 1; i++) await createVehicleDoc({ owner: p._id, type: "location", status: "approved" });
    // Au-dessus du quota gratuit, en dessous du quota Business.
    expect(await refusDeQuota(p, "loueur", APRES_IMMUNITE)).toBeNull();
  });

  it("un plan sans limite et un Partenaire Fondateur en cours ne sont jamais bloqués", async () => {
    const premium = await partenaire({ partnerActivity: "loueur" });
    await abonner(premium, "exportateur");
    for (let i = 0; i < PLAN_QUOTA_ANNONCES.business + 1; i++) await createVehicleDoc({ owner: premium._id, type: "location", status: "approved" });
    expect(await refusDeQuota(premium, "loueur", APRES_IMMUNITE)).toBeNull();

    const fondateur = await partenaire({ partnerActivity: "loueur" });
    await PartnerOnboarding.create({ userId: fondateur._id, isFoundingPartner: true, legalEntityType: "entreprise", commissions: { lockedAt: new Date() } });
    for (let i = 0; i < PLAN_QUOTA_ANNONCES.free; i++) await createVehicleDoc({ owner: fondateur._id, type: "location", status: "approved" });
    expect(await fondateurActif(fondateur._id)).toBe(true);
    expect(await refusDeQuota(fondateur, "loueur", APRES_IMMUNITE)).toBeNull();
  });

  it("un dossier fondateur sans date de signature n'exempte pas, et l'exemption expire après douze mois", async () => {
    const sansDate = await partenaire({ partnerActivity: "loueur" });
    await PartnerOnboarding.create({ userId: sansDate._id, isFoundingPartner: true, legalEntityType: "entreprise" });
    expect(await fondateurActif(sansDate._id)).toBe(false);

    const expire = await partenaire({ partnerActivity: "loueur" });
    await PartnerOnboarding.create({ userId: expire._id, isFoundingPartner: true, legalEntityType: "entreprise", commissions: { lockedAt: new Date(Date.now() - 400 * 86400000) } });
    expect(await fondateurActif(expire._id)).toBe(false);
  });

  it("un membre d'équipe consomme le quota du titulaire", async () => {
    const titulaire = await partenaire({ partnerActivity: "loueur" });
    const agent = await partenaire({ partnerActivity: "loueur", teamOf: titulaire._id, teamRole: "gestionnaire" });
    for (let i = 0; i < PLAN_QUOTA_ANNONCES.free; i++) await createVehicleDoc({ owner: titulaire._id, type: "location", status: "approved" });
    expect((await refusDeQuota(agent, "loueur", APRES_IMMUNITE))?.code).toBe("QUOTA_ANNONCES");
  });

  it("la matrice des plans est cohérente : plus le palier est haut, plus il permet", () => {
    const ordre = ["free", "individuel_plus", "business", "exportateur"];
    const val = (v) => (v === null ? Infinity : v);
    for (let i = 1; i < ordre.length; i++) {
      expect(val(PLAN_QUOTA_ANNONCES[ordre[i]])).toBeGreaterThanOrEqual(val(PLAN_QUOTA_ANNONCES[ordre[i - 1]]));
      expect(val(PLAN_SECTEURS[ordre[i]])).toBeGreaterThanOrEqual(val(PLAN_SECTEURS[ordre[i - 1]]));
    }
  });
});

describe("Demande d'ajout de secteur", () => {
  it("un partenaire gratuit ne cumule pas : refus PLAN_REQUIS dès le deuxième secteur", async () => {
    const p = await partenaire({ partnerActivity: "loueur" });
    const { req, res } = mockReqRes({ user: p, body: { secteur: "vendeur", motif: "Je vends aussi" } });
    await demanderSecteur(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("PLAN_REQUIS");
    expect(await PartnerSectorRequest.countDocuments()).toBe(0);
  });

  it("un abonné Business dépose sa demande ; l'administration est notifiée ; pas de doublon en attente", async () => {
    const admin = await createUser({ role: "admin" });
    const p = await partenaire({ partnerActivity: "loueur" });
    await abonner(p, "business");

    let { req, res } = mockReqRes({ user: p, body: { secteur: "vendeur", motif: "Je vends aussi" } });
    await demanderSecteur(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.demande.status).toBe("pending");
    const notifAdmin = await Notification.findOne({ user: admin._id, type: "sector_requested" });
    expect(notifAdmin).toBeTruthy();

    ({ req, res } = mockReqRes({ user: p, body: { secteur: "vendeur" } }));
    await demanderSecteur(req, res);
    expect(res.statusCode).toBe(409);

    ({ req, res } = mockReqRes({ user: p, body: { secteur: "loueur" } }));
    await demanderSecteur(req, res);
    expect(res.statusCode).toBe(409);

    ({ req, res } = mockReqRes({ user: p, body: { secteur: "n-importe-quoi" } }));
    await demanderSecteur(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("refuse un client, et un membre d'équipe qui n'est pas le titulaire", async () => {
    const client = await createUser({ role: "client" });
    let { req, res } = mockReqRes({ user: client, body: { secteur: "vendeur" } });
    await demanderSecteur(req, res);
    expect(res.statusCode).toBe(403);

    const titulaire = await partenaire({ partnerActivity: "loueur" });
    const agent = await partenaire({ partnerActivity: "loueur", teamOf: titulaire._id, teamRole: "gestionnaire" });
    ({ req, res } = mockReqRes({ user: agent, body: { secteur: "vendeur" } }));
    await demanderSecteur(req, res);
    expect(res.statusCode).toBe(403);
  });

  it("approbation admin : le secteur s'ajoute au compte, le partenaire est notifié, la demande ne se retraite pas", async () => {
    const admin = await createUser({ role: "admin" });
    const p = await partenaire({ partnerActivity: "loueur" });
    await abonner(p, "business");
    const demande = await PartnerSectorRequest.create({ user: p._id, secteur: "vendeur" });

    let { req, res } = mockReqRes({ user: admin, query: {} });
    await adminListerDemandes(req, res);
    expect(res.body.demandes.map((d) => String(d._id))).toContain(String(demande._id));

    ({ req, res } = mockReqRes({ user: admin, params: { id: String(demande._id) }, body: { decision: "approve" } }));
    await adminTraiterDemande(req, res);
    expect(res.statusCode).toBe(200);
    const relu = await User.findById(p._id).lean();
    expect(relu.partnerActivities).toContain("vendeur");
    expect(secteursDuPartenaire(relu)).toEqual(["loueur", "vendeur"]);
    expect(await Notification.findOne({ user: p._id, type: "sector_approved" })).toBeTruthy();

    ({ req, res } = mockReqRes({ user: admin, params: { id: String(demande._id) }, body: { decision: "reject" } }));
    await adminTraiterDemande(req, res);
    expect(res.statusCode).toBe(409);
  });

  it("l'approbation revérifie le plan : un abonnement expiré entre-temps bloque l'ouverture", async () => {
    const admin = await createUser({ role: "admin" });
    const p = await partenaire({ partnerActivity: "loueur" });
    const demande = await PartnerSectorRequest.create({ user: p._id, secteur: "vendeur" });
    const { req, res } = mockReqRes({ user: admin, params: { id: String(demande._id) }, body: { decision: "approve" } });
    await adminTraiterDemande(req, res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("PLAN_REQUIS");
    expect((await User.findById(p._id).lean()).partnerActivities).toEqual([]);
    expect((await PartnerSectorRequest.findById(demande._id)).status).toBe("pending");
  });

  it("refus admin : motif transmis au partenaire, compte inchangé", async () => {
    const admin = await createUser({ role: "admin" });
    const p = await partenaire({ partnerActivity: "loueur" });
    const demande = await PartnerSectorRequest.create({ user: p._id, secteur: "exportateur" });
    const { req, res } = mockReqRes({ user: admin, params: { id: String(demande._id) }, body: { decision: "reject", note: "Dossier export incomplet" } });
    await adminTraiterDemande(req, res);
    expect(res.statusCode).toBe(200);
    const notif = await Notification.findOne({ user: p._id, type: "sector_rejected" });
    expect(notif.message).toMatch(/Dossier export incomplet/);
    expect((await User.findById(p._id).lean()).partnerActivities).toEqual([]);
  });

  it("compte historique sans secteur : le premier secteur accordé devient le secteur principal", async () => {
    const admin = await createUser({ role: "admin" });
    const ancien = await partenaire({ partnerActivity: null });
    let { req, res } = mockReqRes({ user: ancien, body: { secteur: "loisirs" } });
    await demanderSecteur(req, res);
    expect(res.statusCode).toBe(201);

    ({ req, res } = mockReqRes({ user: admin, params: { id: String(res.body.demande._id) }, body: { decision: "approve" } }));
    await adminTraiterDemande(req, res);
    expect(res.statusCode).toBe(200);
    const relu = await User.findById(ancien._id).lean();
    expect(relu.partnerActivity).toBe("loisirs");
    expect(estUniquementLoisirs(relu)).toBe(true);
  });

  it("mesSecteurs décrit le plan, l'immunité et l'occupation de chaque secteur", async () => {
    const p = await partenaire({ partnerActivity: "loueur" });
    await createVehicleDoc({ owner: p._id, type: "location", status: "approved" });
    const { req, res } = mockReqRes({ user: p });
    await mesSecteurs(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.plan).toBe("free");
    expect(res.body.maxSecteurs).toBe(PLAN_SECTEURS.free);
    expect(res.body.immuniteJusquau).toBeTruthy();
    expect(res.body.secteurs).toEqual([{ secteur: "loueur", label: "Location", actives: 1, quota: null }]);
    expect(res.body.secteursDisponibles.map((s) => s.id)).not.toContain("loueur");
  });
});
