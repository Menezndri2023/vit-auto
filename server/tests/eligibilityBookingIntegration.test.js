import { describe, it, expect } from "vitest";
import { createBooking } from "../controllers/bookingController.js";
import { createUser, createVehicleDoc, makeTestPartnerBusiness } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };

describe("Booking Engine — Éligibilité (intégration createBooking)", () => {
  it("bloque une réservation RENTAL_VERIFIED sans permis vérifié, même avec un compte et une identité vérifiés", async () => {
    const owner  = await createUser({ role: "partenaire" });
    const client = await createUser({ role: "client", emailVerified: true, kycStatus: "VERIFIE" });
    const vehicle = await createVehicleDoc({ owner: owner._id, pricePerDay: 1000, requiredVerificationLevel: "RENTAL_VERIFIED" });
    const { req, res } = mockReqRes({
      user: client,
      body: {
        type: "location", clientInfo, vehicleId: vehicle._id.toString(),
        location: { days: 2, startDate: "2027-08-01", endDate: "2027-08-03" },
      },
    });
    await createBooking(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("LICENSE_NOT_VERIFIED");
  });

  it("accepte une réservation RENTAL_VERIFIED avec identité et permis vérifiés", async () => {
    const owner  = await createUser({ role: "partenaire" });
    const client = await createUser({
      role: "client", emailVerified: true, kycStatus: "VERIFIE",
      driverLicenseOcr: { licenseNumber: "L123", isExpired: false },
    });
    const vehicle = await createVehicleDoc({ owner: owner._id, pricePerDay: 1000, requiredVerificationLevel: "RENTAL_VERIFIED" });
    const { req, res } = mockReqRes({
      user: client,
      body: {
        type: "location", clientInfo, vehicleId: vehicle._id.toString(),
        location: { days: 2, startDate: "2027-08-05", endDate: "2027-08-07" },
      },
    });
    await createBooking(req, res);
    expect(res.statusCode).not.toBe(403);
  });

  it("applique la politique de location de l'entité partenaire (âge minimum) à un véhicule sans exigence propre", async () => {
    const owner    = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(owner._id, { rentalPolicy: { minimumAge: 30 } });
    const vehicle  = await createVehicleDoc({ owner: owner._id, business: business._id, pricePerDay: 1000 });
    const client   = await createUser({
      role: "client", emailVerified: true,
      birthDate: new Date(Date.now() - 22 * 365.25 * 86400000), // ~22 ans
    });
    const { req, res } = mockReqRes({
      user: client,
      body: {
        type: "location", clientInfo, vehicleId: vehicle._id.toString(),
        location: { days: 2, startDate: "2027-08-10", endDate: "2027-08-12" },
      },
    });
    await createBooking(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("AGE_BELOW_MINIMUM");
  });

  it("laisse passer une réservation quand le client dépasse l'âge minimum de la politique partenaire", async () => {
    const owner    = await createUser({ role: "partenaire" });
    const business = await makeTestPartnerBusiness(owner._id, { rentalPolicy: { minimumAge: 30 } });
    const vehicle  = await createVehicleDoc({ owner: owner._id, business: business._id, pricePerDay: 1000 });
    const client   = await createUser({
      role: "client", emailVerified: true,
      birthDate: new Date(Date.now() - 35 * 365.25 * 86400000),
    });
    const { req, res } = mockReqRes({
      user: client,
      body: {
        type: "location", clientInfo, vehicleId: vehicle._id.toString(),
        location: { days: 2, startDate: "2027-08-15", endDate: "2027-08-17" },
      },
    });
    await createBooking(req, res);
    expect(res.statusCode).not.toBe(403);
  });
});
