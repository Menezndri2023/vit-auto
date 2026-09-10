import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { listKeys, createKey, revokeKey } from "../controllers/apiKeyController.js";
import { authenticateApiKey, exigePortee, hashCle } from "../middleware/apiKeyAuth.js";
import {
  apiListVehicles, apiGetVehicle, apiSetAvailability, apiListBookings, apiWhoAmI,
} from "../controllers/publicApiController.js";
import PartnerApiKey from "../models/PartnerApiKey.js";
import Subscription from "../models/Subscription.js";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const abonner = (user, plan) => Subscription.create({
  vendor: user._id, plan,
  planDetails: { startDate: new Date(), endDate: new Date(Date.now() + 30 * 86400000), isActive: true, priceUSD: 49.99 },
});

const exportateur = async () => {
  const u = await createUser({ role: "partenaire", country: "CI" });
  await abonner(u, "exportateur");
  return u;
};

const creerCle = async (user, body = {}) => {
  const { req, res } = mockReqRes({ user, body: { label: "ERP interne", ...body } });
  req.planEffectif = "exportateur";
  await createKey(req, res);
  return res;
};

const passer = async (mw, req, res) => {
  let suivant = false;
  await mw(req, res, () => { suivant = true; });
  return suivant;
};

const requeteApi = (secret, extra = {}) => {
  const { req, res } = mockReqRes(extra);
  req.headers = { "x-api-key": secret };
  return { req, res };
};

describe("Clés d'API — création et stockage", () => {
  it("le secret n'est affiché qu'une fois et n'est jamais stocké en clair", async () => {
    const u = await exportateur();
    const res = await creerCle(u);
    expect(res.statusCode).toBe(201);
    const secret = res.body.secret;
    expect(secret.startsWith("vit_")).toBe(true);

    const enBase = await PartnerApiKey.findById(res.body.cle._id).lean();
    expect(enBase.keyHash).not.toBe(secret);
    expect(enBase.keyHash).toBe(crypto.createHash("sha256").update(secret).digest("hex"));
    // Le document complet ne doit contenir le secret sous AUCUNE forme.
    expect(JSON.stringify(enBase)).not.toContain(secret.slice(4));

    // Ni la liste ni la vue ne le rendent : perdue, une clé se remplace, elle ne
    // se retrouve pas.
    const liste = mockReqRes({ user: u });
    liste.req.planEffectif = "exportateur";
    await listKeys(liste.req, liste.res);
    expect(JSON.stringify(liste.res.body)).not.toContain(secret);
    expect(liste.res.body.cles[0].prefixe).toMatch(/^vit_/);
  });

  it("la portée par défaut est en lecture seule", async () => {
    const u = await exportateur();
    const res = await creerCle(u);
    expect(res.body.cle.scopes).toEqual(["vehicles:read", "bookings:read"]);
    expect(res.body.cle.scopes).not.toContain("vehicles:write");
  });

  it("refuse une portée inventée, un nom vide, et plafonne les clés actives", async () => {
    const u = await exportateur();
    expect((await creerCle(u, { label: "  " })).statusCode).toBe(400);
    expect((await creerCle(u, { scopes: ["admin:*"] })).statusCode).toBe(400);
    expect((await creerCle(u, { scopes: [] })).statusCode).toBe(400);
    for (let i = 0; i < 5; i++) expect((await creerCle(u)).statusCode).toBe(201);
    expect((await creerCle(u)).statusCode).toBe(409);
  });

  it("la révocation est idempotente et ne touche pas les clés d'autrui", async () => {
    const a = await exportateur();
    const b = await exportateur();
    const { body } = await creerCle(a);

    const voleur = mockReqRes({ user: b, params: { id: String(body.cle._id) } });
    voleur.req.planEffectif = "exportateur";
    await revokeKey(voleur.req, voleur.res);
    expect(voleur.res.statusCode).toBe(404);
    expect((await PartnerApiKey.findById(body.cle._id).lean()).revokedAt).toBeNull();

    for (const _ of [1, 2]) {
      const { req, res } = mockReqRes({ user: a, params: { id: String(body.cle._id) } });
      req.planEffectif = "exportateur";
      await revokeKey(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.cle.revokedAt).toBeTruthy();
    }
  });
});

describe("Clés d'API — authentification", () => {
  it("accepte l'en-tête X-API-Key comme Authorization: Bearer", async () => {
    const u = await exportateur();
    const { body } = await creerCle(u);

    const a = requeteApi(body.secret);
    expect(await passer(authenticateApiKey, a.req, a.res)).toBe(true);
    expect(String(a.req.apiOwner._id)).toBe(String(u._id));

    const b = mockReqRes({});
    b.req.headers = { authorization: `Bearer ${body.secret}` };
    expect(await passer(authenticateApiKey, b.req, b.res)).toBe(true);
  });

  it("refuse l'absence de clé, une clé inventée et une clé révoquée", async () => {
    const u = await exportateur();
    const { body } = await creerCle(u);

    const sans = mockReqRes({});
    sans.req.headers = {};
    expect(await passer(authenticateApiKey, sans.req, sans.res)).toBe(false);
    expect(sans.res.statusCode).toBe(401);

    const faux = requeteApi("vit_totalement-invente");
    expect(await passer(authenticateApiKey, faux.req, faux.res)).toBe(false);
    expect(faux.res.body.error).toBe("cle_invalide");

    await PartnerApiKey.updateOne({ _id: body.cle._id }, { $set: { revokedAt: new Date() } });
    const revoquee = requeteApi(body.secret);
    expect(await passer(authenticateApiKey, revoquee.req, revoquee.res)).toBe(false);
    expect(revoquee.res.body.error).toBe("cle_invalide");
  });

  it("l'abonnement est revérifié À CHAQUE appel, pas seulement à la création", async () => {
    // Sans cela, une clé créée sous un plan Exportateur survivrait à son
    // échéance — l'API deviendrait un avantage acquis à vie.
    const u = await exportateur();
    const { body } = await creerCle(u);

    const avant = requeteApi(body.secret);
    expect(await passer(authenticateApiKey, avant.req, avant.res)).toBe(true);

    await Subscription.updateOne({ vendor: u._id }, { $set: { "planDetails.isActive": false } });
    const apres = requeteApi(body.secret);
    expect(await passer(authenticateApiKey, apres.req, apres.res)).toBe(false);
    expect(apres.res.body.error).toBe("plan_requis");
  });

  it("un compte désactivé ferme l'API, clé valide ou non", async () => {
    const u = await exportateur();
    const { body } = await creerCle(u);
    await User.updateOne({ _id: u._id }, { $set: { isActive: false } });
    const { req, res } = requeteApi(body.secret);
    expect(await passer(authenticateApiKey, req, res)).toBe(false);
    expect(res.body.error).toBe("compte_inactif");
  });

  it("une portée manquante bloque l'écriture, même avec une clé valide", async () => {
    const lecture = mockReqRes({});
    lecture.req.apiKey = { scopes: ["vehicles:read"] };
    expect(await passer(exigePortee("vehicles:write"), lecture.req, lecture.res)).toBe(false);
    expect(lecture.res.statusCode).toBe(403);
    expect(await passer(exigePortee("vehicles:read"), lecture.req, lecture.res)).toBe(true);
  });

  it("hashCle est stable et ne dépend pas de la casse du hachage", async () => {
    expect(hashCle("vit_abc")).toBe(hashCle("vit_abc"));
    expect(hashCle("vit_abc")).not.toBe(hashCle("vit_abd"));
  });
});

describe("API v1 — cloisonnement des données", () => {
  const clientInfo = { firstName: "Awa", lastName: "Koné", email: "awa@exemple.test" };

  it("ne renvoie que les véhicules du titulaire de la clé", async () => {
    const moi   = await exportateur();
    const autre = await exportateur();
    await createVehicleDoc({ owner: moi._id,   title: "Ma Hilux" });
    await createVehicleDoc({ owner: autre._id, title: "Hilux du voisin" });

    const { req, res } = mockReqRes({ query: {} });
    req.apiOwner = moi;
    await apiListVehicles(req, res);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].titre).toBe("Ma Hilux");
    // Le contrat exposé est stable et explicite — pas un document Mongoose brut.
    expect(Object.keys(res.body.data[0]).sort()).toEqual([
      "annee", "cree_le", "devise", "disponible", "id", "maj_le", "marque",
      "modele", "pays", "photo", "prix_jour", "prix_vente", "statut", "titre", "type", "ville", "vues",
    ].sort());
  });

  it("le véhicule d'un autre partenaire renvoie 404, jamais 403", async () => {
    // Un 403 confirmerait l'existence de la ressource — et permettrait
    // d'énumérer le parc d'un concurrent.
    const moi   = await exportateur();
    const autre = await exportateur();
    const v = await createVehicleDoc({ owner: autre._id });

    const { req, res } = mockReqRes({ params: { id: String(v._id) } });
    req.apiOwner = moi;
    await apiGetVehicle(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("ne renvoie que les réservations portant sur ses propres véhicules", async () => {
    const moi   = await exportateur();
    const autre = await exportateur();
    const aMoi   = await createVehicleDoc({ owner: moi._id });
    const aLautre = await createVehicleDoc({ owner: autre._id });
    await Booking.create({ type: "location", vehicle: aMoi._id, clientInfo, montantTotal: 120 });
    await Booking.create({ type: "location", vehicle: aLautre._id, clientInfo, montantTotal: 999 });

    const { req, res } = mockReqRes({ query: {} });
    req.apiOwner = moi;
    await apiListBookings(req, res);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].montant_total).toBe(120);
  });

  it("n'expose ni e-mail, ni téléphone, ni pièce d'identité du client", async () => {
    // Une clé volée ne doit pas se transformer en fichier client exportable.
    const moi = await exportateur();
    const v = await createVehicleDoc({ owner: moi._id });
    await Booking.create({
      type: "location", vehicle: v._id, montantTotal: 100,
      clientInfo: { ...clientInfo, phone: "+2250700000000", passportNumber: "CI1234567" },
    });

    const { req, res } = mockReqRes({ query: {} });
    req.apiOwner = moi;
    await apiListBookings(req, res);
    const brut = JSON.stringify(res.body);
    expect(brut).not.toContain("awa@exemple.test");
    expect(brut).not.toContain("+2250700000000");
    expect(brut).not.toContain("CI1234567");
    expect(res.body.data[0].client).toBe("Awa Koné"); // le nom suffit à rapprocher un dossier
  });

  it("un partenaire sans véhicule reçoit une liste vide, pas celle de tout le monde", async () => {
    // Une liste d'identifiants vide passée à `$in` renverrait zéro document
    // ici — mais l'oubli de ce cas est le motif classique qui, ailleurs,
    // produit un filtre vide et rend TOUTE la collection.
    const moi = await exportateur();
    const autre = await exportateur();
    const v = await createVehicleDoc({ owner: autre._id });
    await Booking.create({ type: "location", vehicle: v._id, clientInfo, montantTotal: 500 });

    const { req, res } = mockReqRes({ query: {} });
    req.apiOwner = moi;
    await apiListBookings(req, res);
    expect(res.body.total).toBe(0);
    expect(res.body.data).toEqual([]);
  });
});

describe("API v1 — écriture de disponibilité", () => {
  it("bascule la disponibilité d'un véhicule du titulaire", async () => {
    const moi = await exportateur();
    const v = await createVehicleDoc({ owner: moi._id, available: true });

    const { req, res } = mockReqRes({ params: { id: String(v._id) }, body: { available: false } });
    req.apiOwner = moi;
    await apiSetAvailability(req, res);
    expect(res.body.data.disponible).toBe(false);
    expect((await Vehicle.findById(v._id).lean()).available).toBe(false);
  });

  it("refuse une valeur non booléenne plutôt que de la coercer", async () => {
    // « available: "false" » vaut `true` en JavaScript : coercer rendrait le
    // véhicule disponible alors que l'intégration voulait le retirer.
    const moi = await exportateur();
    const v = await createVehicleDoc({ owner: moi._id, available: true });

    for (const valeur of ["false", 0, null, undefined]) {
      const { req, res } = mockReqRes({ params: { id: String(v._id) }, body: { available: valeur } });
      req.apiOwner = moi;
      await apiSetAvailability(req, res);
      expect(res.statusCode, String(valeur)).toBe(400);
    }
    expect((await Vehicle.findById(v._id).lean()).available).toBe(true);
  });

  it("ne peut pas modifier le véhicule d'un autre partenaire", async () => {
    const moi = await exportateur();
    const autre = await exportateur();
    const v = await createVehicleDoc({ owner: autre._id, available: true });

    const { req, res } = mockReqRes({ params: { id: String(v._id) }, body: { available: false } });
    req.apiOwner = moi;
    await apiSetAvailability(req, res);
    expect(res.statusCode).toBe(404);
    expect((await Vehicle.findById(v._id).lean()).available).toBe(true);
  });

  it("/me permet de vérifier une clé en un appel, sans exposer le compte", async () => {
    const moi = await exportateur();
    const { req, res } = mockReqRes({});
    req.apiOwner = moi;
    req.apiKey = { label: "ERP interne", scopes: ["vehicles:read"] };
    apiWhoAmI(req, res);
    expect(res.body.data.cle).toBe("ERP interne");
    expect(JSON.stringify(res.body)).not.toContain(moi.email);
  });
});

describe("API v1 — pagination", () => {
  it("plafonne la limite demandée et rejette les valeurs absurdes", async () => {
    const moi = await exportateur();
    for (let i = 0; i < 3; i++) await createVehicleDoc({ owner: moi._id });

    const cas = [
      [{ limit: "9999" }, 100],   // plafonné : sans cela, une intégration tirerait tout le parc d'un coup
      [{ limit: "0" },    50],    // valeur inutilisable → défaut
      [{ limit: "-5" },   50],
      [{ limit: "abc" },  50],
      [{ limit: "2" },    2],
    ];
    for (const [query, attendu] of cas) {
      const { req, res } = mockReqRes({ query });
      req.apiOwner = moi;
      await apiListVehicles(req, res);
      expect(res.body.limit, JSON.stringify(query)).toBe(attendu);
    }

    const { req, res } = mockReqRes({ query: { limit: "2", offset: "2" } });
    req.apiOwner = moi;
    await apiListVehicles(req, res);
    expect(res.body.total).toBe(3);
    expect(res.body.data).toHaveLength(1);
  });
});
