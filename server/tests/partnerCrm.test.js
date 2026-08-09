import { describe, it, expect } from "vitest";
import {
  adminCreate,
  adminList,
  adminUpdateStatut,
  adminUpdate,
  adminLink,
  adminGetOne,
  autoLinkProspect,
} from "../controllers/partnerCrmController.js";
import PartnerCrm from "../models/PartnerCrm.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";
import Booking from "../models/Booking.js";

describe("CRM Partenaires — pipeline de prospection", () => {
  it("crée un prospect avec le statut LEAD par défaut et un historique initial", async () => {
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({
      user: admin,
      body: { entreprise: "Total Energies CI", pays: "ci", ville: "Abidjan", secteur: "Carburant" },
    });
    await adminCreate(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.crm.statut).toBe("LEAD");
    expect(res.body.crm.pays).toBe("CI");
    expect(res.body.crm.statusHistory).toHaveLength(1);
    expect(res.body.crm.statusHistory[0].statut).toBe("LEAD");
    expect(res.body.crm.referenceNumber).toMatch(/^VA-CRM-\d{4}-\d{3}$/);
  });

  it("refuse la création sans nom d'entreprise", async () => {
    const admin = await createUser({ role: "admin" });
    const { req, res } = mockReqRes({ user: admin, body: { pays: "CI" } });
    await adminCreate(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("fait progresser le pipeline et pose dateInscription automatiquement à l'entrée dans INSCRIT", async () => {
    const admin = await createUser({ role: "admin" });
    const crm = await PartnerCrm.create({ entreprise: "NSIA Assurances", statut: "NEGOCIATION" });

    const { req, res } = mockReqRes({ user: admin, params: { id: crm._id.toString() }, body: { statut: "INSCRIT" } });
    await adminUpdateStatut(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.statut).toBe("INSCRIT");
    expect(res.body.dateInscription).toBeTruthy();

    const reloaded = await PartnerCrm.findById(crm._id);
    expect(reloaded.statusHistory.map((h) => h.statut)).toContain("INSCRIT");
    expect(reloaded.dateInscription).toBeTruthy();
  });

  it("rejette un statut hors pipeline", async () => {
    const admin = await createUser({ role: "admin" });
    const crm = await PartnerCrm.create({ entreprise: "Hyundai Motors" });
    const { req, res } = mockReqRes({ user: admin, params: { id: crm._id.toString() }, body: { statut: "GAGNE" } });
    await adminUpdateStatut(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("filtre la liste par statut, pays et responsable commercial", async () => {
    const admin = await createUser({ role: "admin" });
    const commercial = await createUser({ role: "admin" });
    await PartnerCrm.create({ entreprise: "BYD Maroc", pays: "MA", statut: "LEAD", assignedTo: commercial._id });
    await PartnerCrm.create({ entreprise: "BYD CI", pays: "CI", statut: "QUALIFIE" });
    await PartnerCrm.create({ entreprise: "Autre CI", pays: "CI", statut: "LEAD" });

    const { req, res } = mockReqRes({ user: admin, query: { pays: "CI", statut: "LEAD" } });
    await adminList(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].entreprise).toBe("Autre CI");

    const { req: req2, res: res2 } = mockReqRes({ user: admin, query: { assignedTo: commercial._id.toString() } });
    await adminList(req2, res2);
    expect(res2.body.items).toHaveLength(1);
    expect(res2.body.items[0].entreprise).toBe("BYD Maroc");
  });

  it("met à jour les champs contrat/commission/services", async () => {
    const admin = await createUser({ role: "admin" });
    const crm = await PartnerCrm.create({ entreprise: "Wafabank" });
    const { req, res } = mockReqRes({
      user: admin,
      params: { id: crm._id.toString() },
      body: {
        commission: { taux: 8, notes: "Négocié en direct" },
        contrat: { reference: "CTR-2026-01", url: "https://example.test/contrat.pdf" },
        services: ["assurance", "financement"],
      },
    });
    await adminUpdate(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.crm.commission.taux).toBe(8);
    expect(res.body.crm.contrat.reference).toBe("CTR-2026-01");
    expect(res.body.crm.services).toEqual(["assurance", "financement"]);
  });

  it("lie manuellement un prospect à un compte existant et bascule INSCRIT", async () => {
    const admin = await createUser({ role: "admin" });
    const partnerUser = await createUser({ role: "partenaire" });
    const crm = await PartnerCrm.create({ entreprise: "Auto Import CI", statut: "NEGOCIATION" });

    const { req, res } = mockReqRes({
      user: admin,
      params: { id: crm._id.toString() },
      body: { userId: partnerUser._id.toString() },
    });
    await adminLink(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.crm.statut).toBe("INSCRIT");
    expect(String(res.body.crm.linkedUserId)).toBe(String(partnerUser._id));
  });

  it("calcule les stats live (annonces, transactions, CA) une fois lié à un compte réel", async () => {
    const admin = await createUser({ role: "admin" });
    const partnerUser = await createUser({ role: "partenaire" });
    const vehicle = await createVehicleDoc({ owner: partnerUser._id });
    await Booking.create({
      type: "location", status: "completed", vehicle: vehicle._id,
      adminValidation: { status: "approved" },
      clientInfo: { firstName: "Jean", lastName: "Client", email: "jean@example.test", passportNumber: "P123" },
      montantTotal: 150000,
    });
    const crm = await PartnerCrm.create({ entreprise: "Auto Import CI", linkedUserId: partnerUser._id, statut: "ACTIF" });

    const { req, res } = mockReqRes({ user: admin, params: { id: crm._id.toString() } });
    await adminGetOne(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.liveStats.nombreAnnonces).toBe(1);
    expect(res.body.liveStats.transactionsCount).toBe(1);
    expect(res.body.liveStats.chiffreAffairesGenere).toBe(150000);
  });

  it("autoLinkProspect rattache un prospect existant par email lors de l'inscription, sans jamais lever d'erreur si aucun match", async () => {
    const crm = await PartnerCrm.create({ entreprise: "Concession Renault", contactEmail: "contact@renault-ci.test", statut: "QUALIFIE" });
    const newUser = await createUser({ role: "partenaire", email: "contact@renault-ci.test" });

    await autoLinkProspect({ email: "contact@renault-ci.test", userId: newUser._id });

    const reloaded = await PartnerCrm.findById(crm._id);
    expect(String(reloaded.linkedUserId)).toBe(String(newUser._id));
    expect(reloaded.statut).toBe("INSCRIT");
    expect(reloaded.dateInscription).toBeTruthy();

    // Aucun prospect ne correspond à cet email — ne doit jamais lever.
    await expect(autoLinkProspect({ email: "inconnu@example.test", userId: newUser._id })).resolves.not.toThrow();
  });
});
