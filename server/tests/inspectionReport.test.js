import { describe, it, expect } from "vitest";
import { createInspectionReport, getInspectionReport } from "../controllers/ieTransactionController.js";
import { createVehicleInspectionReport, getVehicleInspectionReport } from "../controllers/inspectionController.js";
import InspectionReport from "../models/InspectionReport.js";
import Vehicle from "../models/Vehicle.js";
import ImportExportListing from "../models/ImportExportListing.js";
import { createUser, createListing, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const BASE_REPORT = {
  overallRating: "bon",
  engine: { rating: "excellent", notes: "RAS" },
  defects: [{ description: "Rayure aile avant", severity: "mineur" }],
};

describe("InspectionReport — schéma polymorphe (listing OU vehicle)", () => {
  it("refuse un rapport sans cible (ni listing ni vehicle)", async () => {
    const partner = await createUser();
    await expect(InspectionReport.create({ partner, overallRating: "bon" })).rejects.toThrow();
  });

  it("refuse un rapport avec les deux cibles à la fois", async () => {
    const partner = await createUser();
    const listing = await createListing();
    const vehicle = await createVehicleDoc();
    await expect(
      InspectionReport.create({ partner, listing: listing._id, vehicle: vehicle._id, overallRating: "bon" })
    ).rejects.toThrow();
  });

  it("un seul rapport par listing (index unique partiel)", async () => {
    await InspectionReport.init(); // attend la construction des index avant de tester leur application
    const partner = await createUser();
    const listing = await createListing({ partner });
    await InspectionReport.create({ partner, listing: listing._id, overallRating: "bon" });
    await expect(InspectionReport.create({ partner, listing: listing._id, overallRating: "moyen" })).rejects.toThrow();
  });

  it("un seul rapport par vehicle (index unique partiel), n'entre pas en collision avec les rapports listing", async () => {
    await InspectionReport.init();
    const partner = await createUser();
    const vehicle = await createVehicleDoc({ owner: partner._id });
    const listing = await createListing({ partner });
    // Les deux premiers rapports (cibles différentes) coexistent sans collision.
    await InspectionReport.create({ partner, vehicle: vehicle._id, overallRating: "bon" });
    await InspectionReport.create({ partner, listing: listing._id, overallRating: "bon" });
    // Un second rapport sur le même véhicule est rejeté.
    await expect(InspectionReport.create({ partner, vehicle: vehicle._id, overallRating: "moyen" })).rejects.toThrow();
  });
});

describe("Rapport d'inspection — flux Import/Export (non régressé par la généralisation)", () => {
  it("crée puis récupère un rapport lié à une annonce", async () => {
    const partner = await createUser();
    const listing = await createListing({ partner: partner._id });

    const create = mockReqRes({ user: partner, params: { id: listing._id.toString() }, body: BASE_REPORT });
    await createInspectionReport(create.req, create.res);
    expect(create.res.statusCode).toBe(201);
    expect(create.res.body.report.listing.toString()).toBe(listing._id.toString());
    expect(create.res.body.report.vehicle).toBeFalsy();

    const updatedListing = await ImportExportListing.findById(listing._id);
    expect(updatedListing.inspectionReport.toString()).toBe(create.res.body.report._id.toString());

    const get = mockReqRes({ params: { id: listing._id.toString() } });
    await getInspectionReport(get.req, get.res);
    expect(get.res.body.report.overallRating).toBe("bon");
  });

  it("un second appel du même partenaire met à jour le rapport existant plutôt que d'en créer un second", async () => {
    const partner = await createUser();
    const listing = await createListing({ partner: partner._id });

    const first = mockReqRes({ user: partner, params: { id: listing._id.toString() }, body: BASE_REPORT });
    await createInspectionReport(first.req, first.res);

    const second = mockReqRes({ user: partner, params: { id: listing._id.toString() }, body: { ...BASE_REPORT, overallRating: "excellent" } });
    await createInspectionReport(second.req, second.res);
    expect(second.res.body.report._id.toString()).toBe(first.res.body.report._id.toString());
    expect(second.res.body.report.overallRating).toBe("excellent");

    const count = await InspectionReport.countDocuments({ listing: listing._id });
    expect(count).toBe(1);
  });
});

describe("Rapport d'inspection — flux Vehicle (nouveau, généralisation)", () => {
  it("refuse si l'appelant n'est pas propriétaire du véhicule", async () => {
    const owner = await createUser();
    const other = await createUser();
    const vehicle = await createVehicleDoc({ owner: owner._id });

    const { req, res } = mockReqRes({ user: other, params: { id: vehicle._id.toString() }, body: BASE_REPORT });
    await createVehicleInspectionReport(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("crée puis récupère un rapport lié à un véhicule, met à jour Vehicle.inspectionReport", async () => {
    const owner = await createUser();
    const vehicle = await createVehicleDoc({ owner: owner._id });

    const create = mockReqRes({ user: owner, params: { id: vehicle._id.toString() }, body: BASE_REPORT });
    await createVehicleInspectionReport(create.req, create.res);
    expect(create.res.statusCode).toBe(201);
    expect(create.res.body.report.vehicle.toString()).toBe(vehicle._id.toString());
    expect(create.res.body.report.listing).toBeFalsy();

    const updatedVehicle = await Vehicle.findById(vehicle._id);
    expect(updatedVehicle.inspectionReport.toString()).toBe(create.res.body.report._id.toString());

    const get = mockReqRes({ params: { id: vehicle._id.toString() } });
    await getVehicleInspectionReport(get.req, get.res);
    expect(get.res.body.report.defects).toHaveLength(1);
  });

  it("getVehicleInspectionReport renvoie null si aucun rapport n'existe", async () => {
    const vehicle = await createVehicleDoc();
    const { req, res } = mockReqRes({ params: { id: vehicle._id.toString() } });
    await getVehicleInspectionReport(req, res);
    expect(res.body.report).toBeNull();
  });

  it("un second appel du même propriétaire met à jour le rapport existant plutôt que d'en créer un second", async () => {
    const owner = await createUser();
    const vehicle = await createVehicleDoc({ owner: owner._id });

    const first = mockReqRes({ user: owner, params: { id: vehicle._id.toString() }, body: BASE_REPORT });
    await createVehicleInspectionReport(first.req, first.res);

    const second = mockReqRes({ user: owner, params: { id: vehicle._id.toString() }, body: { ...BASE_REPORT, overallRating: "mauvais" } });
    await createVehicleInspectionReport(second.req, second.res);
    expect(second.res.body.report._id.toString()).toBe(first.res.body.report._id.toString());

    const count = await InspectionReport.countDocuments({ vehicle: vehicle._id });
    expect(count).toBe(1);
  });
});
