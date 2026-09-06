import { describe, it, expect } from "vitest";
import { createDriver } from "../controllers/driverController.js";
import Driver from "../models/Driver.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Même logique d'accès que vehicleController.createVehicle (voir
// vehicle.create.test.js) — portes KYC/certification/suspension partagées,
// pas de plafond "particulier" ni de détection de doublon ici en revanche.
// profilePhoto et cv sont désormais toujours exigés (voir createDriver) — inclus par défaut.
const FAKE_DOC_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

// Restructuration réservation (2026-09) : la pièce d'identité et le permis
// sont désormais joints DIRECTEMENT à la création du profil (voir
// driverController.processDriverDocuments) — remplace l'ancien mur qui exigeait
// un User.identity/driverLicenseOcr déjà VÉRIFIÉ PAR UN ADMIN au préalable via
// /kyc (missingDriverDocs, supprimé). Le profil part en modération standard
// (status "pending") sans jamais attendre cette vérification a priori.
const minimalDriver = (overrides = {}) => ({
  firstName: "Chauffeur", lastName: "Test", title: "Chauffeur pro Abidjan",
  tarif: 30000, disponibilite: "Temps plein", zone: "Abidjan", experience: "5 ans",
  profilePhoto: "https://cdn.example.test/driver-profile.jpg",
  cv: "https://cdn.example.test/driver-cv.pdf",
  identityDocument: { type: "cni", frontImage: FAKE_DOC_IMAGE },
  licenseDocument: { frontImage: FAKE_DOC_IMAGE },
  ...overrides,
});

describe("driverController.createDriver — contrôle d'accès à la publication", () => {
  it("refuse un rôle client", async () => {
    const client = await createUser({ role: "client" });
    const { req, res } = mockReqRes({ user: client, body: minimalDriver() });
    await createDriver(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("autorise un Founding Partner sans KYC ni certification", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true, sellerType: "particulier" });
    const { req, res } = mockReqRes({ user: founder, body: minimalDriver() });
    await createDriver(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.body.driver.status).toBe("pending");
    const saved = await Driver.findById(res.body.driver._id);
    expect(saved.owner.toString()).toBe(founder._id.toString());
  });

  it("bloque un particulier non-fondateur sans KYC vérifié (KYC_REQUIRED)", async () => {
    const seller = await createUser({ role: "partenaire", sellerType: "particulier", kycStatus: "EN_ATTENTE" });
    const { req, res } = mockReqRes({ user: seller, body: minimalDriver() });
    await createDriver(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.code).toBe("KYC_REQUIRED");
  });

  it("bloque un professionnel sans badge de certification (CERTIFICATION_REQUIRED)", async () => {
    const seller = await createUser({ role: "partenaire", sellerType: "professionnel", certificationBadge: "none" });
    const { req, res } = mockReqRes({ user: seller, body: minimalDriver() });
    await createDriver(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.code).toBe("CERTIFICATION_REQUIRED");
  });

  it("ne relit jamais sellerType depuis req.body une fois déjà fixé (anti-contournement)", async () => {
    // Un compte "entreprise" (certification complète requise) ne doit pas pouvoir
    // se déclarer "particulier" dans le body pour ne passer que le KYC léger.
    const seller = await createUser({ role: "partenaire", sellerType: "entreprise", certificationBadge: "none", kycStatus: "VERIFIE" });
    const { req, res } = mockReqRes({ user: seller, body: minimalDriver({ typePubliant: "particulier" }) });
    await createDriver(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.code).toBe("CERTIFICATION_REQUIRED");
  });

  it("refuse de publier sans pièce d'identité jointe (DRIVER_DOCS_REQUIRED)", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true });
    const { req, res } = mockReqRes({ user: founder, body: minimalDriver({ identityDocument: undefined }) });
    await createDriver(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.code).toBe("DRIVER_DOCS_REQUIRED");
  });

  it("refuse de publier sans permis de conduire joint (DRIVER_DOCS_REQUIRED)", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true });
    const { req, res } = mockReqRes({ user: founder, body: minimalDriver({ licenseDocument: undefined }) });
    await createDriver(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.code).toBe("DRIVER_DOCS_REQUIRED");
  });

  it("accepte le profil dès que les documents sont joints — jamais besoin d'une vérification admin préalable (restructuration 2026-09)", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true });
    const { req, res } = mockReqRes({ user: founder, body: minimalDriver() });
    await createDriver(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.body.driver.status).toBe("pending");
    const saved = await Driver.findById(res.body.driver._id);
    expect(saved.identityDocument.frontImage).toBeTruthy();
    expect(saved.licenseDocument.frontImage).toBeTruthy();
  });

  it("les champs serveur (owner, status, country) ne sont jamais pris depuis req.body", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true, country: "CI" });
    const intruderId = (await createUser())._id.toString();
    const { req, res } = mockReqRes({
      user: founder,
      body: minimalDriver({ owner: intruderId, status: "approved", country: "FR" }),
    });
    await createDriver(req, res);

    expect(res.body.driver.owner.toString()).toBe(founder._id.toString());
    expect(res.body.driver.status).toBe("pending");
    expect(res.body.driver.country).toBe("CI");
  });
});
