import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { getPendingIdentities } from "../controllers/usersController.js";
import { getAdminListings, getImporterProfiles } from "../controllers/importExportController.js";
import User from "../models/User.js";
import ImportExportListing from "../models/ImportExportListing.js";
import { createUser, createImporterProfile, createListing } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// QUATRE ONGLETS D'ADMINISTRATION EN PANNE EN PRODUCTION — 2026-09-11
// ═══════════════════════════════════════════════════════════════════════════
// Trouvés en parcourant le panneau CONNECTÉ dans un vrai navigateur. Aucune
// sonde plus simple ne les voyait : les mêmes routes interrogées sans
// paramètres, ou sur une base de test vide, répondent 200.
//
// Deux causes, toutes deux liées aux images stockées en base64 :
//
//  1. TRI SANS INDEX. MongoDB plafonne un tri en mémoire à 32 Mo. `users`
//     pèse 43 Mo pour 33 documents et `importexportlistings` 372 Mo pour 219 :
//     le tri dépassait le plafond et la requête échouait — « Sort exceeded
//     memory limit of 33554432 bytes ». Un tri servi par un index n'est pas
//     bloquant et échappe à cette limite.
//
//  2. IMAGES RENVOYÉES DANS UNE LISTE. Deux dossiers d'identité pesaient
//     12,6 Mo et 8,6 Mo : 20,8 Mo dans une seule réponse, 90 s puis 500.
//
// Ces tests ne peuvent pas reproduire 43 Mo de données — ils verrouillent la
// CAUSE : les index déclarés, et l'absence de base64 dans les réponses de
// liste. Un document de 2 Mo suffit à prouver qu'il n'est pas transmis.

const IMAGE = "data:image/jpeg;base64," + "A".repeat(2 * 1024 * 1024);

const contientDuBase64 = (valeur) =>
  JSON.stringify(valeur ?? null).includes("data:image");

describe("Les listes d'administration ne transportent pas les images en base64", () => {
  it("la revue des pièces d'identité renvoie les métadonnées, jamais les images", async () => {
    await createUser({
      role: "client", email: "piece@vitauto-fixtures.fr",
      identity: {
        type: "cni", number: "CI-123", status: "pending", submittedAt: new Date(),
        frontImage: IMAGE, backImage: IMAGE, selfie: IMAGE,
      },
    });

    const { req, res } = mockReqRes({ user: { id: "x", role: "admin" } });
    await getPendingIdentities(req, res);

    expect(res.statusCode, JSON.stringify(res.body).slice(0, 120)).toBe(200);
    const [u] = res.body.users;
    expect(u, "le dossier en attente doit être listé").toBeTruthy();
    // Ce dont l'admin a besoin pour trier ses dossiers reste là…
    expect(u.email).toBe("piece@vitauto-fixtures.fr");
    expect(u.identity.type).toBe("cni");
    expect(u.identity.submittedAt).toBeTruthy();
    // …et les mégaoctets d'images, non. Le panneau les charge dossier par
    // dossier via GET /api/kyc/admin/:userId.
    expect(contientDuBase64(res.body), "aucune image base64 dans la liste").toBe(false);
    expect(u.identity.frontImage).toBeUndefined();
  });

  it("la liste admin des annonces Import/Export n'interroge même pas les photos", async () => {
    const partenaire = await createUser({ role: "partenaire", email: "exp@vitauto-fixtures.fr" });
    await createListing({ partner: partenaire._id, photos: [IMAGE, IMAGE], mainPhoto: "https://cdn/x.jpg" });

    // Vérifier la RÉPONSE ne suffirait pas : le contrôleur vide aussi `photos`
    // après coup, donc le test passerait même sans projection — alors que les
    // 372 Mo seraient toujours lus en base et transférés. C'est la REQUÊTE
    // qu'il faut observer. (Validé à l'envers : sans `.select("-photos")`,
    // la projection relevée ici ne contient pas photos:0 et le test échoue.)
    const projections = [];
    const execOriginal = mongoose.Query.prototype.exec;
    mongoose.Query.prototype.exec = function exec(...args) {
      if (this.model?.modelName === "ImportExportListing" && this.op === "find") {
        projections.push(this.projection() || {});
      }
      return execOriginal.apply(this, args);
    };

    const { req, res } = mockReqRes({ user: { id: String(partenaire._id), role: "admin" }, query: { limit: 50 } });
    try { await getAdminListings(req, res); }
    finally { mongoose.Query.prototype.exec = execOriginal; }

    expect(res.statusCode, JSON.stringify(res.body).slice(0, 120)).toBe(200);
    expect(res.body.listings.length).toBe(1);
    // `mainPhoto` — la vignette réellement affichée — doit survivre.
    expect(res.body.listings[0].mainPhoto).toBe("https://cdn/x.jpg");
    expect(contientDuBase64(res.body), "aucune photo base64 dans la réponse").toBe(false);
    expect(projections.length, "la requête de liste doit avoir été observée").toBeGreaterThan(0);
    expect(projections.some((p) => p.photos === 0), "la requête doit exclure photos").toBe(true);
  });

  it("la liste des profils importateur ne renvoie pas les pièces justificatives", async () => {
    const u = await createUser({ role: "partenaire", email: "imp@vitauto-fixtures.fr" });
    await createImporterProfile(u._id, {
      companyName: "ACME Import",
      documents: { licenseImage: IMAGE, companyLogo: IMAGE },
    });

    const { req, res } = mockReqRes({ user: { id: String(u._id), role: "admin" }, query: { limit: 100 } });
    await getImporterProfiles(req, res);

    expect(res.statusCode, JSON.stringify(res.body).slice(0, 120)).toBe(200);
    expect(res.body.profiles.length).toBe(1);
    expect(res.body.profiles[0].companyName).toBe("ACME Import");
    expect(contientDuBase64(res.body), "aucun document base64 dans la liste").toBe(false);
  });
});

describe("Les tris des listes d'administration sont servis par un index", () => {
  // Sans index, MongoDB trie en mémoire, plafonné à 32 Mo. Sur ces trois
  // collections, dont les documents portent des images base64, le plafond est
  // atteint en production et la requête échoue. Vérifier la déclaration du
  // schéma est le seul moyen de l'attraper avant la mise en ligne : une base
  // de test vide trie sans difficulté quoi qu'il arrive.
  const clefsIndexees = (modele) =>
    modele.schema.indexes().map(([clefs]) => JSON.stringify(clefs));

  it("le tri de la liste KYC (kycSubmittedAt) est indexé", () => {
    expect(clefsIndexees(User)).toContain('{"kycSubmittedAt":-1}');
  });

  it("le filtre et le tri des pièces d'identité sont indexés", () => {
    expect(clefsIndexees(User)).toContain('{"identity.status":1,"identity.submittedAt":1}');
  });

  it("le tri des annonces Import/Export (createdAt seul) est indexé", () => {
    // L'index composé {status, createdAt} existe déjà mais ne peut PAS servir
    // ce tri : la liste admin n'applique aucun filtre de statut, et un index
    // composé n'est utilisable pour un tri que si les champs qui précèdent
    // sont contraints par une égalité.
    expect(clefsIndexees(ImportExportListing)).toContain('{"createdAt":-1}');
  });

  it("les index déclarés sont réellement construits en base", async () => {
    // Le schéma peut déclarer ce qu'il veut : si `autoIndex` était désactivé,
    // rien ne serait construit et la panne resterait entière.
    await User.init();
    const construits = (await mongoose.connection.db.collection(User.collection.name).indexes())
      .map((i) => JSON.stringify(i.key));
    expect(construits).toContain('{"kycSubmittedAt":-1}');
  });
});
