import { describe, it, expect, beforeEach } from "vitest";
import { getVehicles } from "../controllers/vehicleController.js";
import { getListings } from "../controllers/importExportController.js";
import { cacheClear } from "../utils/catalogCache.js";
import Vehicle from "../models/Vehicle.js";
import ImportExportListing from "../models/ImportExportListing.js";
import { createUser, createImporterProfile } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// LES ROUTES PUBLIQUES TIENNENT-ELLES LE VOLUME ?
// ═══════════════════════════════════════════════════════════════════════════
// Rien ne le vérifiait, et cela a coûté une journée entière : le catalogue
// Import/Export renvoyait 500 après 90 secondes, 211 annonces inaccessibles,
// découvert par accident. Les 1215 tests passaient — tous sur trois ou quatre
// documents minuscules, où une requête qui s'effondre à l'échelle réelle ne
// montre rien.
//
// CE QUI EST VÉRIFIÉ : le POIDS de la réponse, pas sa durée. Une assertion de
// temps serait instable (la même contention CPU qui a produit trois fausses
// alertes le 2026-09-09) et surtout trompeuse : sur une base en mémoire, une
// requête qui transfère 42 Mo reste rapide. C'est le volume transféré qui a
// fait tomber la production, et c'est lui qu'on mesure.

// Charge réaliste : une photo de véhicule en base64 pèse quelques centaines de
// kilo-octets. On en simule 200 Ko — assez pour que 20 annonces représentent
// 4 Mo si le champ n'est pas exclu, largement au-dessus du budget.
const IMAGE_LOURDE = `data:image/jpeg;base64,${"A".repeat(200 * 1024)}`;

const NB_ANNONCES = 40;
// Une page de liste ne doit jamais dépasser ce poids. 2 Mo laissent de la marge
// pour des titres, des descriptions et des URL d'images sur 20 annonces — mais
// interdisent d'y glisser une seule image encodée.
const BUDGET_PAGE_OCTETS = 2 * 1024 * 1024;

const poids = (payload) => Buffer.byteLength(JSON.stringify(payload), "utf8");

describe("Routes publiques — tenue en volume", () => {
  beforeEach(() => cacheClear());

  it("le catalogue véhicules ne renvoie pas d'images encodées dans le document", async () => {
    const owner = await createUser({ role: "partenaire" });
    await Vehicle.insertMany(
      Array.from({ length: NB_ANNONCES }, (_, i) => ({
        title: `Véhicule ${i}`, type: "location", pricePerDay: 50,
        status: "approved", available: true, owner: owner._id,
        images: [IMAGE_LOURDE],
      }))
    );

    const { req, res } = mockReqRes({ query: { limit: "20" } });
    await getVehicles(req, res);

    expect(res.body.vehicles).toHaveLength(20);
    expect(
      poids(res.body),
      `Une page de catalogue pèse ${(poids(res.body) / 1048576).toFixed(1)} Mo — des images sont transférées depuis la base.`
    ).toBeLessThan(BUDGET_PAGE_OCTETS);
  });

  it("le catalogue Import/Export ne transfère pas les photos du carrousel", async () => {
    // La panne exacte du 2026-09-09 : `photos` était rapatrié depuis Atlas puis
    // vidé en mémoire — après le transfert, donc trop tard.
    const partner = await createUser({ role: "partenaire" });
    const profile = await createImporterProfile(partner._id);
    await ImportExportListing.insertMany(
      Array.from({ length: NB_ANNONCES }, (_, i) => ({
        partner: partner._id, importerProfile: profile._id,
        title: `Import ${i}`, make: "Toyota", model: "Corolla", year: 2020,
        sourceCountry: "Chine", price: 10000, status: "approved",
        photos: [IMAGE_LOURDE, IMAGE_LOURDE],
        mainPhoto: `https://ik.imagekit.io/vitauto/photo-${i}.jpg`,
      }))
    );

    const { req, res } = mockReqRes({ query: { limit: "20" } });
    await getListings(req, res);

    expect(res.body.listings).toHaveLength(20);
    for (const l of res.body.listings) {
      expect(l.photos ?? [], "le carrousel ne doit jamais partir en vue liste").toEqual([]);
    }
    expect(
      poids(res.body),
      `Une page Import/Export pèse ${(poids(res.body) / 1048576).toFixed(1)} Mo — c'est ce qui a mis la route en 500.`
    ).toBeLessThan(BUDGET_PAGE_OCTETS);
  });

  it("conserve le compteur de photos sans transférer les photos", async () => {
    // Le compromis à ne pas perdre : le badge « 📷 N » a besoin du NOMBRE, pas
    // des images. Si ce test tombe, quelqu'un a rapatrié le tableau pour le
    // compter.
    const partner = await createUser({ role: "partenaire" });
    const profile = await createImporterProfile(partner._id);
    await ImportExportListing.create({
      partner: partner._id, importerProfile: profile._id,
      title: "Avec trois photos", make: "Toyota", model: "Corolla", year: 2020,
      sourceCountry: "Chine", price: 10000, status: "approved",
      photos: [IMAGE_LOURDE, IMAGE_LOURDE, IMAGE_LOURDE],
    });

    const { req, res } = mockReqRes({ query: { limit: "20" } });
    await getListings(req, res);

    expect(res.body.listings[0].photosCount).toBe(3);
    expect(poids(res.body)).toBeLessThan(BUDGET_PAGE_OCTETS);
  });

  it("écarte une vignette Import/Export restée encodée", async () => {
    // La conversion vers ImageKit à la création est non bloquante : une annonce
    // publiée pendant une indisponibilité du service garde son base64. Elle
    // s'affichera sans visuel — elle seule — au lieu d'alourdir la page pour
    // tout le monde.
    const partner = await createUser({ role: "partenaire" });
    const profile = await createImporterProfile(partner._id);
    await ImportExportListing.insertMany(
      Array.from({ length: 20 }, (_, i) => ({
        partner: partner._id, importerProfile: profile._id,
        title: `Import ${i}`, make: "Toyota", model: "Corolla", year: 2020,
        sourceCountry: "Chine", price: 10000, status: "approved",
        mainPhoto: IMAGE_LOURDE,
      }))
    );

    const { req, res } = mockReqRes({ query: { limit: "20" } });
    await getListings(req, res);

    for (const l of res.body.listings) expect(l.mainPhoto).toBeNull();
    expect(poids(res.body)).toBeLessThan(BUDGET_PAGE_OCTETS);
  });

  it("la pagination borne la réponse quelle que soit la taille du catalogue", async () => {
    // Un `limit` démesuré ne doit pas permettre de tirer tout le catalogue en
    // une requête — c'est ainsi qu'une route publique devient un levier de
    // saturation.
    const owner = await createUser({ role: "partenaire" });
    await Vehicle.insertMany(
      Array.from({ length: NB_ANNONCES }, (_, i) => ({
        title: `Véhicule ${i}`, type: "location", pricePerDay: 50,
        status: "approved", available: true, owner: owner._id,
      }))
    );

    const { req, res } = mockReqRes({ query: { limit: "100000" } });
    await getVehicles(req, res);

    expect(res.body.vehicles.length, "le plafond public est de 100 annonces par page").toBeLessThanOrEqual(100);
  });
});
