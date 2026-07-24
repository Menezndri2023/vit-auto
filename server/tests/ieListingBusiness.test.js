import { describe, it, expect } from "vitest";
import { createListing, updateListing } from "../controllers/importExportController.js";
import ImportExportListing from "../models/ImportExportListing.js";
import PartnerBusiness from "../models/PartnerBusiness.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ImportExportListing n'avait aucune notion d'entreprise — un exportateur avec
// plusieurs PartnerBusiness ne pouvait attribuer aucune annonce export à une
// entité précise. Manque réel trouvé en audit.
const minimalListingBody = (overrides = {}) => ({
  title: "Toyota Land Cruiser", make: "Toyota", model: "Land Cruiser", year: 2021,
  sourceCountry: "Émirats Arabes Unis", price: 25000, availableIn: ["Côte d'Ivoire"],
  ...overrides,
});

describe("importExportController — attribution business", () => {
  it("attribue l'annonce à l'entreprise choisie (businessId)", async () => {
    const founder = await createUser({ isFounder: true });
    const business = await PartnerBusiness.create({ owner: founder._id, companyName: "Alpha Export", country: "SN", ville: "Dakar" });

    const { req, res } = mockReqRes({ user: founder, body: minimalListingBody({ businessId: business._id.toString() }) });
    await createListing(req, res);
    expect(res.statusCode).toBe(201);

    const saved = await ImportExportListing.findById(res.body.listing._id);
    expect(saved.business.toString()).toBe(business._id.toString());
  });

  it("refuse un businessId qui n'appartient pas au partenaire", async () => {
    const founder = await createUser({ isFounder: true });
    const stranger = await createUser({ isFounder: true });
    const business = await PartnerBusiness.create({ owner: stranger._id, companyName: "Alpha Export", country: "SN", ville: "Dakar" });

    const { req, res } = mockReqRes({ user: founder, body: minimalListingBody({ businessId: business._id.toString() }) });
    await createListing(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("crée sans entreprise quand businessId est omis", async () => {
    const founder = await createUser({ isFounder: true });
    const { req, res } = mockReqRes({ user: founder, body: minimalListingBody() });
    await createListing(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.listing.business).toBeFalsy();
  });

  it("permet de modifier l'entreprise attribuée via updateListing", async () => {
    const founder = await createUser({ isFounder: true });
    const business = await PartnerBusiness.create({ owner: founder._id, companyName: "Alpha Export", country: "SN", ville: "Dakar" });

    const create = mockReqRes({ user: founder, body: minimalListingBody() });
    await createListing(create.req, create.res);
    const listingId = create.res.body.listing._id.toString();

    const { req, res } = mockReqRes({ user: founder, params: { id: listingId }, body: { businessId: business._id.toString() } });
    await updateListing(req, res);
    expect(res.statusCode).toBe(200);

    const saved = await ImportExportListing.findById(listingId);
    expect(saved.business.toString()).toBe(business._id.toString());
  });
});
