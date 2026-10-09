import { describe, it, expect } from "vitest";
import { createDriver } from "../controllers/driverController.js";
import Driver from "../models/Driver.js";
import User from "../models/User.js";
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

  it("autorise un Founding Partner sans KYC ni certification ; permis + CV joints : profil publié", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true, sellerType: "particulier" });
    const { req, res } = mockReqRes({ user: founder, body: minimalDriver() });
    await createDriver(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.body.driver.status).toBe("approved");
    const saved = await Driver.findById(res.body.driver._id);
    expect(saved.owner.toString()).toBe(founder._id.toString());
  });

  // Règle de l'exploitant (2026-10-09) : un chauffeur fournit son permis et
  // son CV, rien d'autre — ni KYC préalable, ni pièce d'identité, ni
  // certification d'entreprise. Contact confirmé + permis + CV = compte validé
  // et fiche en ligne, sans attendre la modération.
  it("chauffeur au contact confirmé : permis + CV suffisent, le profil est en ligne et le compte validé", async () => {
    const seller = await createUser({ role: "partenaire", sellerType: "particulier", entityType: "particulier", partnerActivity: "chauffeur", kycStatus: "EN_ATTENTE", emailVerified: true });
    const { req, res } = mockReqRes({ user: seller, body: minimalDriver({ identityDocument: undefined }) });
    await createDriver(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body.driver.status).toBe("approved");
    const u = await User.findById(seller._id).lean();
    expect(u.validationPartenaire.statut).toBe("valide");
    expect(u.validationPartenaire.exiges).toEqual(["contact", "permis", "cv"]);
  });

  it("contact pas encore confirmé : profil enregistré, en attente (le permis et le CV sont là)", async () => {
    const seller = await createUser({ role: "partenaire", entityType: "particulier", partnerActivity: "chauffeur", emailVerified: false });
    const { req, res } = mockReqRes({ user: seller, body: minimalDriver() });
    await createDriver(req, res);

    expect(res.body.driver.status).toBe("pending");
    expect((await User.findById(seller._id).lean()).validationPartenaire.manquants).toEqual(["contact"]);
  });

  it("un chauffeur professionnel ou une entreprise n'a pas à certifier une entreprise pour sa fiche chauffeur", async () => {
    const seller = await createUser({ role: "partenaire", sellerType: "professionnel", entityType: "professionnel", partnerActivity: "chauffeur", certificationBadge: "none", emailVerified: true });
    const { req, res } = mockReqRes({ user: seller, body: minimalDriver({ identityDocument: undefined }) });
    await createDriver(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body.driver.status).toBe("approved");
  });

  it("refuse de publier sans permis de conduire joint (DRIVER_DOCS_REQUIRED)", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true });
    const { req, res } = mockReqRes({ user: founder, body: minimalDriver({ licenseDocument: undefined }) });
    await createDriver(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.code).toBe("DRIVER_DOCS_REQUIRED");
  });

  it("la pièce d'identité reste acceptée quand elle est jointe", async () => {
    const founder = await createUser({ role: "partenaire", isFounder: true });
    const { req, res } = mockReqRes({ user: founder, body: minimalDriver() });
    await createDriver(req, res);

    const saved = await Driver.findById(res.body.driver._id);
    expect(saved.identityDocument.frontImage).toBeTruthy();
    expect(saved.licenseDocument.frontImage).toBeTruthy();
  });

  it("les champs serveur (owner, status, country) ne sont jamais pris depuis req.body", async () => {
    // Contact non confirmé : le profil reste en attente — un « approved »
    // envoyé dans le corps de la requête ne doit rien y changer.
    const founder = await createUser({ role: "partenaire", country: "CI", emailVerified: false });
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
