import { describe, it, expect } from "vitest";
import { confirmEscrowPayment, assignTransaction, markShipped, createReservation } from "../controllers/ieTransactionController.js";
import IETransaction from "../models/IETransaction.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import InspectionReport from "../models/InspectionReport.js";
import { createUser, createListing, createIETransaction } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Restructuration Import/Export (2026-09) : dès que les fonds sont sécurisés
// (in_escrow), le système propose automatiquement un transitaire actif pour
// le pays de destination, et rappelle au partenaire de fournir un rapport
// d'inspection s'il n'y en avait pas déjà un publié sur l'annonce avant achat
// (voir ieTransactionController.onEscrowSecured/buildInitialInspectionDoc).
describe("Import/Export — assignation transitaire/agent + rapport d'inspection", () => {
  it("assigne automatiquement le transitaire actif du pays de destination à la sécurisation des fonds", async () => {
    const client  = await createUser({ role: "client" });
    const partner = await createUser({ role: "client", isFounder: true });
    const admin   = await createUser({ role: "admin" });
    const listing = await createListing({ partner: partner._id });
    const tx = await createIETransaction({
      listing: listing._id, client: client._id, partner: partner._id,
      status: "payment_submitted", destCountry: "CI",
      finalOffer: { totalAmount: 25000, currency: "EUR", vehiclePrice: 25000 },
    });

    const transitaireUser = await createUser({ role: "partenaire", firstName: "Amara", lastName: "Koné" });
    await PartnerOnboarding.create({ userId: transitaireUser._id, partnerType: "transitaire_logistique", status: "actif", country: "CI" });

    const { req, res } = mockReqRes({ params: { id: tx._id.toString() }, user: admin });
    await confirmEscrowPayment(req, res);
    expect(res.status).not.toHaveBeenCalledWith(500);

    const updated = await IETransaction.findById(tx._id);
    expect(updated.status).toBe("in_escrow");
    expect(updated.assignment.mode).toBe("transitaire");
    expect(updated.assignment.assignedTo.toString()).toBe(transitaireUser._id.toString());
    expect(updated.assignment.autoAssigned).toBe(true);
  });

  it("ne casse jamais la confirmation de paiement quand aucun transitaire actif n'existe pour cette destination", async () => {
    const client  = await createUser({ role: "client" });
    const partner = await createUser({ role: "client", isFounder: true });
    const admin   = await createUser({ role: "admin" });
    const listing = await createListing({ partner: partner._id });
    const tx = await createIETransaction({
      listing: listing._id, client: client._id, partner: partner._id,
      status: "payment_submitted", destCountry: "ZZ",
      finalOffer: { totalAmount: 25000, currency: "EUR", vehiclePrice: 25000 },
    });

    const { req, res } = mockReqRes({ params: { id: tx._id.toString() }, user: admin });
    await confirmEscrowPayment(req, res);

    const updated = await IETransaction.findById(tx._id);
    expect(updated.status).toBe("in_escrow");
    expect(updated.assignment.assignedTo).toBeNull();
  });

  it("répartit par charge : le transitaire actif avec le moins de dossiers en cours reçoit la mission suivante", async () => {
    const admin = await createUser({ role: "admin" });
    const busyTransitaire = await createUser({ role: "partenaire", firstName: "Busy" });
    const freeTransitaire = await createUser({ role: "partenaire", firstName: "Free" });
    await PartnerOnboarding.create({ userId: busyTransitaire._id, partnerType: "transitaire_logistique", status: "actif", country: "CI" });
    await PartnerOnboarding.create({ userId: freeTransitaire._id, partnerType: "transitaire_logistique", status: "actif", country: "CI" });

    // Le transitaire "Busy" a déjà un dossier actif assigné.
    const partner1 = await createUser({ role: "client", isFounder: true });
    const listing1 = await createListing({ partner: partner1._id });
    await createIETransaction({
      listing: listing1._id, client: (await createUser())._id, partner: partner1._id,
      status: "in_escrow", destCountry: "CI",
      assignment: { mode: "transitaire", assignedTo: busyTransitaire._id, autoAssigned: true, assignedAt: new Date() },
    });

    // Nouvelle transaction à sécuriser — doit aller au transitaire libre.
    const client2  = await createUser({ role: "client" });
    const partner2 = await createUser({ role: "client", isFounder: true });
    const listing2 = await createListing({ partner: partner2._id });
    const tx2 = await createIETransaction({
      listing: listing2._id, client: client2._id, partner: partner2._id,
      status: "payment_submitted", destCountry: "CI",
      finalOffer: { totalAmount: 10000, currency: "EUR", vehiclePrice: 10000 },
    });

    const { req, res } = mockReqRes({ params: { id: tx2._id.toString() }, user: admin });
    await confirmEscrowPayment(req, res);

    const updated = await IETransaction.findById(tx2._id);
    expect(updated.assignment.assignedTo.toString()).toBe(freeTransitaire._id.toString());
  });

  it("un admin peut assigner manuellement un agent interne, et réassigner ensuite", async () => {
    const admin1 = await createUser({ role: "admin", firstName: "Admin1" });
    const admin2 = await createUser({ role: "admin", firstName: "Admin2" });
    const tx = await createIETransaction({ status: "in_escrow", destCountry: "CI" });

    const first = mockReqRes({ params: { id: tx._id.toString() }, user: admin1, body: { mode: "agent", assignedTo: admin1._id.toString() } });
    await assignTransaction(first.req, first.res);
    expect(first.res.status).not.toHaveBeenCalledWith(400);
    let updated = await IETransaction.findById(tx._id);
    expect(updated.assignment.mode).toBe("agent");
    expect(updated.assignment.assignedTo.toString()).toBe(admin1._id.toString());
    expect(updated.assignment.autoAssigned).toBe(false);

    const second = mockReqRes({ params: { id: tx._id.toString() }, user: admin1, body: { mode: "agent", assignedTo: admin2._id.toString(), note: "Congé admin1" } });
    await assignTransaction(second.req, second.res);
    updated = await IETransaction.findById(tx._id);
    expect(updated.assignment.assignedTo.toString()).toBe(admin2._id.toString());
    expect(updated.assignmentHistory).toHaveLength(1);
    expect(updated.assignmentHistory[0].assignedTo.toString()).toBe(admin1._id.toString());
  });

  it("refuse d'expédier tant qu'aucun rapport d'inspection n'a été fourni pour la transaction", async () => {
    const partner = await createUser({ role: "client", isFounder: true });
    const listing = await createListing({ partner: partner._id });
    const tx = await createIETransaction({
      listing: listing._id, partner: partner._id, status: "in_escrow",
    });

    const { req, res } = mockReqRes({ params: { id: tx._id.toString() }, user: partner, body: { carrier: "Maersk" } });
    await markShipped(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body.code).toBe("INSPECTION_REQUIRED");

    const stillInEscrow = await IETransaction.findById(tx._id);
    expect(stillInEscrow.status).toBe("in_escrow");
  });

  it("autorise l'expédition une fois le rapport d'inspection fourni", async () => {
    const partner = await createUser({ role: "client", isFounder: true });
    const listing = await createListing({ partner: partner._id });
    const tx = await createIETransaction({
      listing: listing._id, partner: partner._id, status: "in_escrow",
      documents: { inspectionDocs: { status: "fourni", url: "data:application/pdf;base64,xx" } },
    });

    const { req, res } = mockReqRes({ params: { id: tx._id.toString() }, user: partner, body: { carrier: "Maersk" } });
    await markShipped(req, res);
    expect(res.status).not.toHaveBeenCalledWith(409);

    const updated = await IETransaction.findById(tx._id);
    expect(updated.status).toBe("shipped");
  });

  it("pré-remplit le rapport d'inspection de la transaction si l'annonce en avait déjà un publié avant achat", async () => {
    const partner = await createUser({ role: "client", isFounder: true });
    const client  = await createUser({ role: "client", emailVerified: true });
    const listing = await createListing({ partner: partner._id });
    await InspectionReport.create({
      listing: listing._id, partner: partner._id, overallRating: "bon", status: "published",
    });

    const { req, res } = mockReqRes({ user: client, body: { listingId: listing._id.toString() } });
    await createReservation(req, res);
    expect(res.status).not.toHaveBeenCalledWith(404);

    const tx = await IETransaction.findOne({ listing: listing._id, client: client._id });
    expect(tx.documents.inspectionDocs.status).toBe("fourni");
  });
});
