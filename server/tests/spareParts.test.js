import { describe, it, expect } from "vitest";
import { createPart, getParts, updatePart, quoteShipping, updatePartStatus, deletePart, importParts } from "../controllers/partController.js";
import { createBooking, updateBookingStatus, validateTransaction, cancelBookingByClient } from "../controllers/bookingController.js";
import SparePart from "../models/SparePart.js";
import Booking from "../models/Booking.js";
import Notification from "../models/Notification.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";
import { calculerLivraisonPiece } from "../services/partShipping.js";
import CountryConfig from "../models/CountryConfig.js";
import ExchangeRate from "../models/ExchangeRate.js";

// Secteur « pièces détachées » (2026-09-14) : publication → commande livrée →
// confirmation → expédition → réception confirmée → commission.
const clientInfo = { firstName: "Awa", lastName: "Koné", email: "awa@example.test", phone: "+2250700000010" };
const IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const minimalPart = (extra = {}) => ({
  category: "FREINAGE", title: "Plaquettes avant Bosch", brand: "Bosch", reference: "0986424797",
  condition: "neuf", compatibility: [{ marque: "Volkswagen", modele: "Golf", anneeDebut: 2004, anneeFin: 2012 }],
  price: 40, currency: "MAD", priceEntered: 400, priceEntryCurrency: "MAD",
  stock: 5, shipping: { mode: "forfait", forfaitUSD: 5, freeAboveUSD: 200, deliveryDaysMin: 1, deliveryDaysMax: 3 },
  ville: "Casablanca", images: [IMG], ...extra,
});
const partenaire = (extra = {}) => createUser({ role: "partenaire", isFounder: true, partnerActivity: "pieces", country: "MA", ...extra });
const client = () => createUser({ role: "client", emailVerified: true, country: "MA" });

async function publier(owner, extra = {}) {
  const { req, res } = mockReqRes({ user: owner, body: minimalPart(extra) });
  await createPart(req, res);
  expect(res.statusCode).toBe(201);
  const admin = await createUser({ role: "admin" });
  const ok = mockReqRes({ user: admin, params: { id: res.body.part._id.toString() }, body: { status: "approved" } });
  await updatePartStatus(ok.req, ok.res);
  return SparePart.findById(res.body.part._id);
}

describe("Pièces détachées — publication", () => {
  it("un partenaire du secteur publie une pièce en attente de modération, champs serveur imposés", async () => {
    const owner = await partenaire();
    const { req, res } = mockReqRes({ user: owner, body: minimalPart({ owner: "000000000000000000000000", status: "approved" }) });
    await createPart(req, res);
    expect(res.statusCode).toBe(201);
    const saved = await SparePart.findById(res.body.part._id);
    expect(saved.owner.toString()).toBe(owner._id.toString());
    expect(saved.status).toBe("pending");
    expect(saved.country).toBe("MA");
    expect(saved.compatibility[0].marque).toBe("Volkswagen");
    expect(saved.thumbnail).toBeTruthy();
  });

  it("refuse un rôle client, une catégorie inconnue, une importation sans pays d'origine et une annonce sans photo", async () => {
    const c = await client();
    let m = mockReqRes({ user: c, body: minimalPart() }); await createPart(m.req, m.res); expect(m.res.statusCode).toBe(403);
    const owner = await partenaire();
    m = mockReqRes({ user: owner, body: minimalPart({ category: "LICORNE" }) }); await createPart(m.req, m.res); expect(m.res.statusCode).toBe(400);
    m = mockReqRes({ user: owner, body: minimalPart({ saleMode: "import", importInfo: { leadTimeDays: 21, feesUSD: 30 } }) }); await createPart(m.req, m.res); expect(m.res.statusCode).toBe(400);
    m = mockReqRes({ user: owner, body: minimalPart({ images: [] }) }); await createPart(m.req, m.res); expect(m.res.statusCode).toBe(400);
  });

  it("un partenaire d'un autre secteur est refusé (SECTEUR_REQUIS)", async () => {
    const loueur = await createUser({ role: "partenaire", isFounder: true, partnerActivity: "loueur" });
    const { req, res } = mockReqRes({ user: loueur, body: minimalPart() });
    await createPart(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("SECTEUR_REQUIS");
  });

  it("le catalogue public ne liste que les pièces approuvées, filtrées par catégorie/marque/recherche", async () => {
    const owner = await partenaire();
    await publier(owner);
    await publier(owner, { title: "Filtre à huile Mann", category: "FILTRES_ENTRETIEN", reference: "W712", compatibility: [{ marque: "Peugeot", modele: "208" }] });
    const m0 = mockReqRes({ user: owner, body: minimalPart({ title: "Pas encore modérée" }) }); await createPart(m0.req, m0.res);

    let m = mockReqRes({ query: {} }); await getParts(m.req, m.res);
    expect(m.res.body).toHaveLength(2);
    m = mockReqRes({ query: { category: "FREINAGE" } }); await getParts(m.req, m.res);
    expect(m.res.body).toHaveLength(1); expect(m.res.body[0].reference).toBe("0986424797");
    m = mockReqRes({ query: { marque: "peugeot" } }); await getParts(m.req, m.res);
    expect(m.res.body).toHaveLength(1); expect(m.res.body[0].title).toMatch(/Mann/);
    m = mockReqRes({ query: { q: "W712" } }); await getParts(m.req, m.res);
    expect(m.res.body).toHaveLength(1);
    // Repli mondial étendu aux pièces le 2026-09-24 (règle de l'exploitant) :
    // aucune pièce livrable en Côte d'Ivoire, donc l'offre internationale
    // entière plutôt qu'une page vide. Ce test attendait 0 auparavant — c'était
    // précisément le comportement à corriger. Voir cataloguesSecteursRepliMondial.
    m = mockReqRes({ query: { country: "CI" } }); await getParts(m.req, m.res);
    expect(m.res.body).toHaveLength(2);
  });

  it("le propriétaire modifie stock, prix et pays desservis ; un autre partenaire est refusé", async () => {
    const owner = await partenaire();
    const autre = await partenaire();
    const part = await publier(owner);
    let m = mockReqRes({ user: autre, params: { id: part._id.toString() }, body: { stock: 0 } });
    await updatePart(m.req, m.res); expect(m.res.statusCode).toBe(403);
    m = mockReqRes({ user: owner, params: { id: part._id.toString() }, body: { stock: 12, price: 45, shipping: { mode: "gratuit", countries: ["CI"] } } });
    await updatePart(m.req, m.res); expect(m.res.statusCode).toBe(200);
    expect(m.res.body.part.stock).toBe(12); expect(m.res.body.part.price).toBe(45); expect(m.res.body.part.shipping.countries).toEqual(["CI"]);
    m = mockReqRes({ query: { country: "CI" } }); await getParts(m.req, m.res);
    expect(m.res.body).toHaveLength(1);
  });
});

describe("Pièces détachées — livraison et devis", () => {
  it("forfait, offerte au-delà d'un montant, gratuite, ou selon la distance (position requise)", async () => {
    const forfait = { price: 40, shipping: { mode: "forfait", forfaitUSD: 5, freeAboveUSD: 200 } };
    expect((await calculerLivraisonPiece(forfait, { quantity: 1 })).feeUSD).toBe(5);
    expect((await calculerLivraisonPiece(forfait, { quantity: 5 })).feeUSD).toBe(0);
    expect((await calculerLivraisonPiece({ price: 40, shipping: { mode: "gratuit" } })).feeUSD).toBe(0);
    const distance = { price: 40, shipping: { mode: "distance" }, coordonnees: { lat: 33.57, lng: -7.59 }, country: "MA" };
    expect((await calculerLivraisonPiece(distance, { quantity: 1 })).feeUSD).toBeNull();
    // Barème pays (devise locale) + taux de change vers l'USD, comme en prod.
    await CountryConfig.create({ code: "MA", name: "Maroc", defaultCurrency: "MAD", deliveryBaseRate: 30, deliveryRatePerKm: 5, deliveryMaxKm: 300 });
    await ExchangeRate.create({ code: "MAD", symbol: "DH", name: "Dirham", rateFromUSD: 10 });
    const avecPosition = await calculerLivraisonPiece(distance, { quantity: 1, clientLat: 33.60, clientLng: -7.62 });
    expect(avecPosition.distanceKm).toBeGreaterThan(0);
    // fee = round(30 + km × 5) MAD → USD au taux 10 ; arrondi à 2 décimales.
    expect(avecPosition.feeUSD).toBeGreaterThan(3);
    expect(avecPosition.feeUSD).toBeLessThan(6);
  });

  it("le devis public additionne pièce × quantité, frais d'importation et livraison, et calcule l'acompte", async () => {
    const owner = await partenaire();
    const part = await publier(owner, { saleMode: "import", importInfo: { originCountry: "DE", leadTimeDays: 21, feesUSD: 30, customsIncluded: true, depositPercent: 50 } });
    const { req, res } = mockReqRes({ params: { id: part._id.toString() }, query: { quantity: "2" } });
    await quoteShipping(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.sousTotalUSD).toBe(80);
    expect(res.body.importFeesUSD).toBe(30);
    expect(res.body.shipping.feeUSD).toBe(5);
    expect(res.body.totalUSD).toBe(115);
    expect(res.body.depositUSD).toBe(55); // 50 % de (80 + 30)
  });
});

describe("Pièces détachées — commande, de la transmission à la réception", () => {
  const commande = (c, part, extra = {}) => mockReqRes({
    user: c,
    body: {
      type: "piece", partId: part._id.toString(), clientInfo,
      piece: { quantity: 2, delivery: { address: "12 rue des Fleurs", ville: "Casablanca", country: "MA" } },
      payment: { method: "card" }, // ignoré : espèces à la livraison (TYPES_ESPECES_UNIQUEMENT)
      ...extra,
    },
  });

  it("crée la commande, réserve le stock, transmet directement au vendeur, commission sur la pièce seule (10 %)", async () => {
    const owner = await createUser({ role: "partenaire", partnerActivity: "pieces", country: "MA", certificationBadge: "verifie" });
    const part = await publier(owner);
    const c = await client();
    const { req, res } = commande(c, part);
    await createBooking(req, res);
    expect(res.statusCode).toBe(201);
    const b = await Booking.findById(res.body.booking._id);
    expect(b.type).toBe("piece");
    expect(b.reference).toMatch(/^VIT-PIECE-/);
    expect(b.part.toString()).toBe(part._id.toString());
    expect(b.piece.quantity).toBe(2);
    expect(b.montantBase).toBe(80);
    expect(b.piece.delivery.feeUSD).toBe(5);
    expect(b.montantTotal).toBe(85);
    expect(b.commissionRate).toBe(0.10);
    expect(b.commissionAmount).toBe(8);          // 10 % de 80, pas de 85
    expect(b.payment).toBeNull();                // jamais de paiement en ligne
    expect(b.adminValidation.status).toBe("approved");
    expect(b.adminValidation.validatedByType).toBe("SYSTEM");
    expect(b.partnerNotifiedAt).toBeTruthy();
    expect(b.piece.stockReserved).toBe(true);
    expect((await SparePart.findById(part._id)).stock).toBe(3);
    expect(await Notification.findOne({ user: owner._id, type: "booking_admin_approved" })).toBeTruthy();
  });

  it("refuse une adresse incomplète, un pays non desservi, une quantité sous le minimum et un stock insuffisant", async () => {
    const owner = await partenaire();
    const part = await publier(owner, { stock: 1, minOrderQty: 1 });
    const c = await client();
    let m = commande(c, part, { piece: { quantity: 1, delivery: { address: "x", ville: "", country: "MA" } } });
    await createBooking(m.req, m.res); expect(m.res.body.code).toBe("DELIVERY_ADDRESS_REQUIRED");
    m = commande(c, part, { piece: { quantity: 1, delivery: { address: "x", ville: "Abidjan", country: "CI" } } });
    await createBooking(m.req, m.res); expect(m.res.body.code).toBe("DELIVERY_COUNTRY_NOT_SERVED");
    m = commande(c, part); // quantité 2 > stock 1
    await createBooking(m.req, m.res); expect(m.res.statusCode).toBe(409); expect(m.res.body.code).toBe("PART_STOCK");
    const part2 = await publier(owner, { minOrderQty: 4, stock: 10 });
    m = commande(c, part2); await createBooking(m.req, m.res); expect(m.res.body.code).toBe("MIN_ORDER_QTY");
  });

  it("importation : frais d'importation et acompte portés par la commande, taux 7 %", async () => {
    const owner = await createUser({ role: "partenaire", partnerActivity: "pieces", country: "MA", certificationBadge: "verifie" });
    const part = await publier(owner, { saleMode: "import", stock: null, importInfo: { originCountry: "DE", leadTimeDays: 21, feesUSD: 30, customsIncluded: true, depositPercent: 50 } });
    const c = await client();
    const { req, res } = commande(c, part);
    await createBooking(req, res);
    expect(res.statusCode).toBe(201);
    const b = await Booking.findById(res.body.booking._id);
    expect(b.piece.saleMode).toBe("import");
    expect(b.piece.importFeesUSD).toBe(30);
    expect(b.piece.depositUSD).toBe(55);
    expect(b.montantTotal).toBe(115);
    expect(b.commissionRate).toBe(0.07);
    expect(b.commissionAmount).toBe(5.6);
    expect(b.piece.stockReserved).toBe(false); // stock non suivi
  });

  it("vendeur : confirme (acompte reçu), prépare, expédie avec suivi, livre → client confirme la réception → completed, vente comptée", async () => {
    const owner = await createUser({ role: "partenaire", partnerActivity: "pieces", country: "MA", certificationBadge: "verifie" });
    const part = await publier(owner);
    const c = await client();
    const cr = commande(c, part);
    await createBooking(cr.req, cr.res);
    const id = cr.res.body.booking._id.toString();

    const step = async (status, extra = {}) => {
      const m = mockReqRes({ user: owner, params: { id }, body: { status, ...extra } });
      await updateBookingStatus(m.req, m.res);
      expect(m.res.statusCode).toBe(200);
      return Booking.findById(id);
    };
    let b = await step("confirmed", { depositReceived: true });
    expect(b.status).toBe("confirmed");
    b = await step("preparing");
    b = await step("in_progress", { tracking: { carrier: "Amana", trackingNumber: "AM123456" } });
    expect(b.piece.tracking.carrier).toBe("Amana");
    expect(b.piece.tracking.shippedAt).toBeTruthy();
    b = await step("waiting_client_validation");
    expect(b.piece.tracking.deliveredAt).toBeTruthy();

    const v = mockReqRes({ user: c, params: { id }, body: { action: "validate" } });
    await validateTransaction(v.req, v.res);
    expect(v.res.statusCode).toBe(200);
    b = await Booking.findById(id);
    expect(b.status).toBe("completed");
    expect(b.piece.saleCounted).toBe(true);
    expect((await SparePart.findById(part._id)).ventes).toBe(2);
  });

  it("une location ne peut pas sauter de in_progress à waiting_client_validation (transition réservée aux pièces)", async () => {
    const owner = await createUser({ role: "partenaire" });
    const { createVehicleDoc } = await import("./helpers/fixtures.js");
    const vehicle = await createVehicleDoc({ owner: owner._id });
    const c = await client();
    const b = await Booking.create({ type: "location", vehicle: vehicle._id, client: c._id, clientInfo, status: "in_progress", adminValidation: { status: "approved" }, montantTotal: 100 });
    const m = mockReqRes({ user: owner, params: { id: b._id.toString() }, body: { status: "waiting_client_validation" } });
    await updateBookingStatus(m.req, m.res);
    expect(m.res.statusCode).toBe(409);
  });

  it("annulation par le client : le stock est restitué une seule fois", async () => {
    const owner = await createUser({ role: "partenaire", partnerActivity: "pieces", country: "MA", certificationBadge: "verifie" });
    const part = await publier(owner, { stock: 5 });
    const c = await client();
    const cr = commande(c, part);
    await createBooking(cr.req, cr.res);
    const id = cr.res.body.booking._id.toString();
    expect((await SparePart.findById(part._id)).stock).toBe(3);
    const m = mockReqRes({ user: c, params: { id }, body: { reasonCode: "changement_de_plans" } });
    await cancelBookingByClient(m.req, m.res);
    expect(m.res.statusCode).toBe(200);
    expect((await SparePart.findById(part._id)).stock).toBe(5);
    // Une seconde restitution (ex. admin) ne recrédite pas.
    const b = await Booking.findById(id);
    const { restituerStockPiece } = await import("../services/partStock.js");
    expect(await restituerStockPiece(b)).toBe(false);
    expect((await SparePart.findById(part._id)).stock).toBe(5);
  });

  it("une pièce déjà vendue est archivée à la suppression, jamais effacée", async () => {
    const owner = await createUser({ role: "partenaire", partnerActivity: "pieces", country: "MA", certificationBadge: "verifie" });
    const part = await publier(owner);
    await SparePart.updateOne({ _id: part._id }, { $set: { ventes: 1 } });
    const m = mockReqRes({ user: owner, params: { id: part._id.toString() } });
    await deletePart(m.req, m.res);
    expect(m.res.body.archived).toBe(true);
    expect((await SparePart.findById(part._id)).status).toBe("archived");
  });
});

describe("Pièces détachées — import CSV en masse", () => {
  const csv = [
    "titre;categorie;fabricant;reference;etat;prix;devise;stock;mode;pays_origine;delai_jours;frais_import;acompte;livraison;forfait_livraison;compatibilite;photos",
    "Plaquettes avant;Freinage;Bosch;0986424797;neuf;400;MAD;10;direct;;;;;forfait;40;Volkswagen Golf 2004-2012 | Seat Leon;https://ik.imagekit.io/vitauto/x.jpg",
    "Alternateur;Électrique / batterie;Valeo;439731;reconditionné;1600;MAD;;import;FR;15;250;50;gratuit;;Dacia Duster 2010-2018;https://ik.imagekit.io/vitauto/y.jpg",
    "Sans photo;Moteur;;;neuf;100;USD;1;direct;;;;;forfait;5;;",
    "Catégorie inconnue;Licorne;;;neuf;100;USD;1;direct;;;;;forfait;5;;https://ik.imagekit.io/vitauto/z.jpg",
  ].join("\n");
  const b64 = "data:text/csv;base64," + Buffer.from(csv, "utf8").toString("base64");

  it("crée les lignes valides en attente de validation, rapporte les autres ligne par ligne", async () => {
    const { importParts } = await import("../controllers/partController.js");
    const ExchangeRate = (await import("../models/ExchangeRate.js")).default;
    await ExchangeRate.create({ code: "MAD", symbol: "DH", name: "Dirham", rateFromUSD: 10 });
    const owner = await partenaire();
    const dry = mockReqRes({ user: owner, body: { fileBase64: b64, fileName: "pieces.csv", dryRun: true } });
    await importParts(dry.req, dry.res);
    expect(dry.res.statusCode).toBe(200);
    expect(dry.res.body.valides).toBe(2);
    expect(dry.res.body.erreurs.map((e) => e.ligne)).toEqual([4, 5]);
    expect(await SparePart.countDocuments({ owner: owner._id })).toBe(0);

    const { req, res } = mockReqRes({ user: owner, body: { fileBase64: b64, fileName: "pieces.csv" } });
    await importParts(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.crees).toBe(2);
    const parts = await SparePart.find({ owner: owner._id }).sort({ title: 1 }).lean();
    const alt = parts.find((p) => p.title === "Alternateur");
    expect(alt.status).toBe("pending");
    expect(alt.saleMode).toBe("import");
    expect(alt.importInfo.originCountry).toBe("FR");
    expect(alt.price).toBe(160);            // 1600 MAD → USD au taux 10
    expect(alt.currency).toBe("MAD");
    expect(alt.condition).toBe("reconditionne");
    expect(alt.shipping.mode).toBe("gratuit");
    const plaq = parts.find((p) => p.title === "Plaquettes avant");
    expect(plaq.compatibility).toHaveLength(2);
    expect(plaq.compatibility[0]).toMatchObject({ marque: "Volkswagen", modele: "Golf", anneeDebut: 2004, anneeFin: 2012 });
    expect(plaq.stock).toBe(10);
    expect(plaq.shipping.forfaitUSD).toBe(40);
  });

  it("un partenaire d'un autre secteur est refusé", async () => {
    const { importParts } = await import("../controllers/partController.js");
    const loueur = await createUser({ role: "partenaire", isFounder: true, partnerActivity: "loueur" });
    const { req, res } = mockReqRes({ user: loueur, body: { fileBase64: b64, fileName: "pieces.csv" } });
    await importParts(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("SECTEUR_REQUIS");
  });
});

// ── Alerte de stock bas (2026-09-26) ───────────────────────────────────────
//
// Premier outil propre au secteur « pièces », ouvert le 2026-09-14 et resté
// sans rien à vendre à un palier payant. Une pièce commandée mais
// indisponible, c'est une commande annulée : sur un catalogue de plusieurs
// centaines de références, personne ne surveille les compteurs à la main.
describe("Pièces détachées — alerte de stock bas", () => {
  const alertes = (ownerId) => Notification.find({
    user: ownerId, titre: { $in: ["⚠️ Stock bas", "⛔ Pièce épuisée"] },
  }).sort({ createdAt: 1 }).lean();

  it("prévient au FRANCHISSEMENT du seuil, une seule fois tant qu'on reste dessous", async () => {
    const owner = await partenaire();
    const piece = await publier(owner, { stock: 4 });
    await SparePart.updateOne({ _id: piece._id }, { $set: { seuilStockBas: 2 } });

    const c = await client();
    const commander = async (quantity) => {
      const { req, res } = mockReqRes({ user: c, body: {
        type: "piece", partId: piece._id.toString(), clientInfo,
        piece: { quantity, delivery: { address: "12 rue des Fleurs", ville: "Casablanca", country: "MA" } },
      } });
      await createBooking(req, res);
      return res;
    };

    // 4 → 3 : au-dessus du seuil, rien ne doit partir.
    expect((await commander(1)).statusCode).toBe(201);
    expect(await alertes(owner._id)).toHaveLength(0);

    // 3 → 2 : le seuil est atteint, une alerte part.
    expect((await commander(1)).statusCode).toBe(201);
    let vues = await alertes(owner._id);
    expect(vues).toHaveLength(1);
    expect(vues[0].message).toMatch(/seuil de 2/);

    // 2 → 1 : toujours sous le seuil, mais PAS de seconde alerte — sinon
    // chaque vente renotifierait et le partenaire cesserait de lire.
    expect((await commander(1)).statusCode).toBe(201);
    expect(await alertes(owner._id)).toHaveLength(1);
  });

  it("se réarme après un réassort saisi par le partenaire", async () => {
    const owner = await partenaire();
    const piece = await publier(owner, { stock: 1 });
    await SparePart.updateOne({ _id: piece._id }, { $set: { seuilStockBas: 1, alerteStockLe: new Date() } });

    const { req, res } = mockReqRes({
      user: owner, params: { id: piece._id.toString() },
      body: { stock: 20, images: [IMG] },
    });
    await updatePart(req, res);
    expect(res.statusCode).toBe(200);
    const apres = await SparePart.findById(piece._id).lean();
    expect(apres.stock).toBe(20);
    expect(apres.alerteStockLe).toBeNull();
  });

  it("une pièce sans suivi de stock (sur commande) n'alerte jamais", async () => {
    const owner = await partenaire();
    const piece = await publier(owner, { stock: null });
    await SparePart.updateOne({ _id: piece._id }, { $set: { seuilStockBas: 5 } });

    const c = await client();
    const { req, res } = mockReqRes({ user: c, body: {
      type: "piece", partId: piece._id.toString(), clientInfo,
      piece: { quantity: 3, delivery: { address: "12 rue des Fleurs", ville: "Casablanca", country: "MA" } },
    } });
    await createBooking(req, res);
    expect(res.statusCode).toBe(201);
    expect(await alertes(owner._id)).toHaveLength(0);
  });

  it("le seuil ne se POSE qu'avec le palier, mais se RETIRE toujours", async () => {
    const owner = await partenaire();
    const piece = await publier(owner, { stock: 10 });

    // L'immunité de lancement couvre encore tout le monde aujourd'hui : le
    // refus se vérifie donc sur la matrice, pas sur une date simulée ici.
    // Ce qui doit être vrai en tout temps : retirer un seuil n'exige rien.
    await SparePart.updateOne({ _id: piece._id }, { $set: { seuilStockBas: 3 } });
    const { req, res } = mockReqRes({
      user: owner, params: { id: piece._id.toString() },
      body: { seuilStockBas: null, images: [IMG] },
    });
    await updatePart(req, res);
    expect(res.statusCode).toBe(200);
    expect((await SparePart.findById(piece._id).lean()).seuilStockBas).toBeNull();
  });
});

// ── Import du catalogue (verrouillé le 2026-09-26) ─────────────────────────
//
// ⚠️ Cet import EXISTAIT déjà et était GRATUIT. Il n'a pas été construit ici :
// il a été verrouillé au palier Business (`importCatalogue`), parce que c'est
// précisément ce qui justifie un palier payant pour un secteur qui n'avait
// rien à vendre. L'immunité de lancement s'applique : personne ne le perd
// aujourd'hui.
describe("Pièces détachées — import du catalogue", () => {
  const CSV = [
    "titre;categorie;fabricant;reference;etat;prix;devise;stock;seuil_alerte;compatibilite;photos;ville",
    "Plaquettes avant;Freinage;Bosch;0986424797;neuf;400;USD;10;3;Volkswagen Golf 2004-2012;https://ik.imagekit.io/vitauto/p1.jpg;Casablanca",
  ].join("\n");
  const base64 = "data:text/csv;base64," + Buffer.from(CSV, "utf-8").toString("base64");

  it("lit la colonne « seuil_alerte » et la pose sur la pièce", async () => {
    const owner = await partenaire();
    const { req, res } = mockReqRes({ user: owner, body: { fileBase64: base64, fileName: "catalogue.csv" } });
    await importParts(req, res);
    expect(res.statusCode).toBe(201); // créé
    expect(res.body.crees).toBe(1);

    const piece = await SparePart.findOne({ owner: owner._id, reference: "0986424797" }).lean();
    expect(piece).toBeTruthy();
    expect(piece.seuilStockBas).toBe(3);
    expect(piece.stock).toBe(10);
    expect(piece.compatibility[0].marque).toBe("Volkswagen");
  });

  it("refuse un partenaire dont le compte ne couvre pas le secteur pièces", async () => {
    const loueur = await createUser({ role: "partenaire", isFounder: true, partnerActivity: "loueur", country: "MA" });
    const { req, res } = mockReqRes({ user: loueur, body: { fileBase64: base64, fileName: "catalogue.csv" } });
    await importParts(req, res);
    expect(res.statusCode).toBe(403);
  });
});
