import { describe, it, expect } from "vitest";
import { getDrivers } from "../controllers/driverController.js";
import Driver from "../models/Driver.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// getDrivers est mis en cache en mémoire par filtre (server/utils/catalogCache.js,
// TTL 30s) — chaque test utilise une `zone` distincte pour éviter de lire le
// résultat mis en cache par un test précédent au lieu de la vraie requête Mongo.
const makeDriver = async (owner, zone, overrides = {}) => Driver.create({
  owner: owner._id, firstName: "Jean", lastName: "Chauffeur", title: "Chauffeur pro",
  disponibilite: "Temps plein", zone, experience: "5 ans",
  tarif: 20000, status: "approved",
  ...overrides,
});

describe("getDrivers — fiche publique chauffeur (identityVerified/licenseVerified/cv)", () => {
  it("expose identityVerified/licenseVerified=true quand l'identité et le permis du propriétaire sont vérifiés", async () => {
    const owner = await createUser({
      role: "partenaire",
      identity: { type: "cni", status: "verified" },
      driverLicenseOcr: { licenseNumber: "LIC12345", frontImage: "data:image/jpeg;base64,xx", isExpired: false },
    });
    await makeDriver(owner, "ZoneVerifiee1", { cv: "https://example.test/cv.pdf" });

    const { req, res } = mockReqRes({ query: { zone: "ZoneVerifiee1" } });
    await getDrivers(req, res);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].identityVerified).toBe(true);
    expect(res.body[0].licenseVerified).toBe(true);
    expect(res.body[0].cv).toBe("https://example.test/cv.pdf");
  });

  it("expose identityVerified/licenseVerified=false quand rien n'est vérifié, sans jamais faire planter la requête", async () => {
    const owner = await createUser({ role: "partenaire" });
    await makeDriver(owner, "ZoneNonVerifiee1");

    const { req, res } = mockReqRes({ query: { zone: "ZoneNonVerifiee1" } });
    await getDrivers(req, res);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].identityVerified).toBe(false);
    expect(res.body[0].licenseVerified).toBe(false);
  });

  it("licenseVerified=false si le permis est expiré", async () => {
    const owner = await createUser({
      role: "partenaire",
      identity: { type: "cni", status: "verified" },
      driverLicenseOcr: { licenseNumber: "LIC999", frontImage: "data:image/jpeg;base64,xx", isExpired: true },
    });
    await makeDriver(owner, "ZoneExpiree1");

    const { req, res } = mockReqRes({ query: { zone: "ZoneExpiree1" } });
    await getDrivers(req, res);

    expect(res.body[0].licenseVerified).toBe(false);
  });

  it("ne fuit jamais les images/documents bruts du propriétaire (identity/driverLicenseOcr)", async () => {
    const owner = await createUser({
      role: "partenaire",
      identity: { type: "cni", status: "verified", frontImage: "SECRET_FRONT", backImage: "SECRET_BACK", selfie: "SECRET_SELFIE", number: "SECRET_NUMBER" },
      driverLicenseOcr: { licenseNumber: "LIC12345", frontImage: "SECRET_LICENSE_FRONT", backImage: "SECRET_LICENSE_BACK", isExpired: false },
    });
    await makeDriver(owner, "ZoneFuite1");

    const { req, res } = mockReqRes({ query: { zone: "ZoneFuite1" } });
    await getDrivers(req, res);

    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("SECRET_FRONT");
    expect(raw).not.toContain("SECRET_BACK");
    expect(raw).not.toContain("SECRET_SELFIE");
    expect(raw).not.toContain("SECRET_NUMBER");
    expect(raw).not.toContain("SECRET_LICENSE_FRONT");
    expect(raw).not.toContain("SECRET_LICENSE_BACK");
    expect(res.body[0].owner.identity).toBeUndefined();
    expect(res.body[0].owner.driverLicenseOcr).toBeUndefined();
    // firstName/phone du propriétaire restent exposés (déjà le cas avant ce changement)
    expect(res.body[0].owner.firstName).toBe(owner.firstName);
  });
});
