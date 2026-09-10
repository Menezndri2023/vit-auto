import { describe, it, expect } from "vitest";
import {
  composerVitrine, scoreDeMerite, fenetreDuJour, jourDeRotation,
  PLACES_PAR_PLAN, MAX_PAR_PARTENAIRE, EMPLACEMENTS, POIDS, PART_MAX_BOOSTS, idsVitrine,
} from "../services/spotlightEngine.js";
import mongoose from "mongoose";
import { getSpotlight } from "../controllers/spotlightController.js";
import Subscription from "../models/Subscription.js";
import Activity from "../models/Activity.js";
import Vehicle from "../models/Vehicle.js";
import Favorite from "../models/Favorite.js";
import Booking from "../models/Booking.js";
import { cacheClear } from "../utils/catalogCache.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const JOUR = 24 * 60 * 60 * 1000;

const abonner = (user, plan) => Subscription.create({
  vendor: user._id, plan,
  planDetails: { startDate: new Date(), endDate: new Date(Date.now() + 30 * JOUR), isActive: true, priceUSD: 19.99 },
});

// Annonce « complète » par défaut : sans cela, toutes les fixtures auraient un
// score de mérite nul et les tests de classement ne prouveraient rien.
const annonce = async (extra = {}) => {
  const { owner, ...reste } = extra;
  const proprio = owner || (await createUser({ role: "partenaire" }))._id;
  return createVehicleDoc({
    owner: proprio,
    images: ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg"],
    description: "Un véhicule bien entretenu, révision à jour, climatisation, idéal pour vos déplacements professionnels en ville comme sur route.",
    ville: "Abidjan",
    ...reste,
  });
};

describe("Score de mérite", () => {
  it("est borné entre 0 et 100 et récompense chaque famille de signaux", async () => {
    expect(scoreDeMerite({})).toBe(0);
    expect(scoreDeMerite({ qualite: 1, vues: 1e6, favoris: 1e6, reservations: 1e6, note: 5, avis: 1e6, badge: "premium", majLe: new Date() })).toBe(100);
    // Chaque famille pèse ce qu'elle annonce.
    expect(scoreDeMerite({ qualite: 1 })).toBe(POIDS.qualite);
    expect(scoreDeMerite({ majLe: new Date() })).toBe(POIDS.fraicheur);
  });

  it("sature : dix mille vues ne valent pas plus que le palier", async () => {
    // Sans saturation, une annonce ancienne à fort trafic écraserait tout et la
    // vitrine se figerait sur les mêmes gagnants.
    expect(scoreDeMerite({ vues: 200 })).toBe(scoreDeMerite({ vues: 100000 }));
  });

  it("ignore une note parfaite adossée à un seul avis", async () => {
    // 5/5 sur un avis unique ne dit rien, et serait trivial à fabriquer.
    const unSeul = scoreDeMerite({ note: 5, avis: 1 });
    const beaucoup = scoreDeMerite({ note: 5, avis: 10 });
    expect(unSeul).toBeLessThan(beaucoup);
    expect(unSeul).toBeLessThanOrEqual(2);
  });

  it("décroît avec l'ancienneté de la dernière mise à jour", async () => {
    const recent = scoreDeMerite({ majLe: new Date() });
    const moyen  = scoreDeMerite({ majLe: new Date(Date.now() - 20 * JOUR) });
    const vieux  = scoreDeMerite({ majLe: new Date(Date.now() - 200 * JOUR) });
    expect(recent).toBeGreaterThan(moyen);
    expect(moyen).toBeGreaterThan(vieux);
    expect(vieux).toBe(0);
  });
});

describe("Rotation", () => {
  it("boucle en fin de liste et fait passer tout le monde", async () => {
    const liste = [1, 2, 3, 4, 5];
    const vus = new Set();
    for (let j = 0; j < 5; j++) fenetreDuJour(liste, 2, new Date(Date.now() + j * JOUR)).forEach((x) => vus.add(x));
    expect(vus.size).toBe(5);
  });

  it("renvoie tout si la liste tient dans les places, et rien si aucune place", async () => {
    expect(fenetreDuJour([1, 2], 5, new Date())).toEqual([1, 2]);
    expect(fenetreDuJour([1, 2], 0, new Date())).toEqual([]);
    expect(fenetreDuJour([], 5, new Date())).toEqual([]);
  });

  it("est stable dans la journée", async () => {
    const t = new Date();
    expect(jourDeRotation(t)).toBe(jourDeRotation(new Date(t.getTime() + 3600 * 1000)));
  });
});

describe("Composition d'une vitrine", () => {
  it("se remplit SANS aucune intervention d'un administrateur", async () => {
    // C'est le défaut que ce moteur corrige : avant, une page d'accueil dont
    // l'admin n'avait rien coché restait vide.
    for (let i = 0; i < 4; i++) await annonce();
    const v = await composerVitrine("vedette");
    expect(v.items.length).toBe(4);
    expect(v.composition.epingle).toBeUndefined();
    expect(v.composition.merite).toBe(4);
  });

  it("sert d'abord ce qu'un administrateur a épinglé", async () => {
    for (let i = 0; i < 5; i++) await annonce();
    const epinglee = await annonce({ featured: true, title: "Choix de l'admin" });
    const v = await composerVitrine("vedette");
    expect(v.items[0].id).toBe(String(epinglee._id));
    expect(v.items[0].origine).toBe("epingle");
  });

  it("donne à chaque palier son quota, sans qu'un palier supérieur mange celui du dessous", async () => {
    // Cœur de la promesse commerciale : si l'Exportateur occupait aussi les
    // places du Business, l'avantage vendu au palier inférieur n'existerait pas.
    const parPlan = {};
    for (const plan of ["exportateur", "business", "individuel_plus"]) {
      parPlan[plan] = [];
      // Deux partenaires par palier : le plafond par partenaire est de 2, il ne
      // doit pas être ce qui limite le quota.
      for (let p = 0; p < 3; p++) {
        const u = await createUser({ role: "partenaire" });
        await abonner(u, plan);
        for (let i = 0; i < 2; i++) parPlan[plan].push(await annonce({ owner: u._id }));
      }
    }
    for (let i = 0; i < 5; i++) await annonce(); // du remplissage gratuit

    const v = await composerVitrine("vedette");
    const idsDe = (plan) => parPlan[plan].map((a) => String(a._id));
    const parOrigine = v.items.filter((i) => i.origine === "abonnement").map((i) => i.id);

    expect(parOrigine.filter((id) => idsDe("exportateur").includes(id))).toHaveLength(PLACES_PAR_PLAN.exportateur);
    expect(parOrigine.filter((id) => idsDe("business").includes(id))).toHaveLength(PLACES_PAR_PLAN.business);
    expect(parOrigine.filter((id) => idsDe("individuel_plus").includes(id))).toHaveLength(PLACES_PAR_PLAN.individuel_plus);
  });

  it("un abonnement expiré ne donne plus aucune place réservée", async () => {
    const u = await createUser({ role: "partenaire" });
    await abonner(u, "exportateur");
    await annonce({ owner: u._id });
    await Subscription.updateOne({ vendor: u._id }, { $set: { "planDetails.endDate": new Date(Date.now() - JOUR) } });

    const v = await composerVitrine("vedette");
    expect(v.items.every((i) => i.origine !== "abonnement")).toBe(true);
  });

  it("laisse une place au mérite à un partenaire GRATUIT, même face à des abonnés", async () => {
    // Sans cela, la page d'accueil ne serait plus qu'une grille tarifaire, et un
    // nouveau partenaire n'aurait aucune raison de soigner ses annonces.
    const gratuit = await createUser({ role: "partenaire" });
    const excellente = await annonce({ owner: gratuit._id, vues: 500, noteMoyenne: 5, nombreAvis: 30 });

    for (const plan of ["exportateur", "business"]) {
      const u = await createUser({ role: "partenaire" });
      await abonner(u, plan);
      for (let i = 0; i < 2; i++) await annonce({ owner: u._id });
    }
    const v = await composerVitrine("vedette");
    const trouvee = v.items.find((i) => i.id === String(excellente._id));
    expect(trouvee).toBeTruthy();
    expect(trouvee.origine).toBe("merite");
  });

  it("ne laisse pas un seul partenaire occuper toute la vitrine", async () => {
    // Un partenaire à trois cents annonces prendrait sinon la page entière, et
    // la vitrine cesserait de représenter la plateforme.
    const gros = await createUser({ role: "partenaire" });
    for (let i = 0; i < 20; i++) await annonce({ owner: gros._id });
    const petit = await createUser({ role: "partenaire" });
    await annonce({ owner: petit._id });

    const v = await composerVitrine("vedette");
    const idsGros = (await Vehicle.find({ owner: gros._id }).select("_id").lean()).map((x) => String(x._id));
    expect(v.items.filter((i) => idsGros.includes(i.id))).toHaveLength(MAX_PAR_PARTENAIRE);
    // Et la place ainsi libérée profite réellement au petit partenaire.
    const idPetit = String((await Vehicle.findOne({ owner: petit._id }).select("_id").lean())._id);
    expect(v.items.map((i) => i.id)).toContain(idPetit);
  });

  it("classe au mérite : l'annonce complète et consultée passe devant la coquille vide", async () => {
    const nue = await createVehicleDoc({ images: [], description: "", ville: null, vues: 0 });
    const soignee = await annonce({ vues: 300, noteMoyenne: 5, nombreAvis: 20 });
    const v = await composerVitrine("vedette");
    const rang = (id) => v.items.findIndex((i) => i.id === String(id));
    expect(rang(soignee._id)).toBeLessThan(rang(nue._id));
  });

  it("compte les favoris et les réservations réels dans le score", async () => {
    const a = await annonce({ title: "Sans engagement" });
    const b = await annonce({ title: "Très demandée" });
    const client = await createUser({ role: "client" });
    await Favorite.create({ user: client._id, itemType: "vehicle", itemId: b._id });
    await Booking.create({
      type: "location", vehicle: b._id, montantTotal: 100,
      clientInfo: { firstName: "Awa", lastName: "K", email: "awa@exemple.test" },
    });

    const v = await composerVitrine("vedette");
    const score = (id) => v.items.find((i) => i.id === String(id))?.score ?? -1;
    expect(score(b._id)).toBeGreaterThan(score(a._id));
  });

  it("respecte le pays du visiteur et garde les annonces sans pays", async () => {
    const ci = await annonce({ country: "CI" });
    const ma = await annonce({ country: "MA" });
    const sansPays = await annonce({ country: null });
    const v = await composerVitrine("vedette", { country: "CI" });
    const ids = v.items.map((i) => i.id);
    expect(ids).toContain(String(ci._id));
    expect(ids).toContain(String(sansPays._id));
    expect(ids).not.toContain(String(ma._id));
  });

  it("ne mélange pas les types quand un type est demandé", async () => {
    const location = await annonce({ type: "location" });
    await annonce({ type: "vente", pricePerDay: undefined, priceForSale: 9000 });
    const v = await composerVitrine("vedette", { type: "location" });
    expect(v.items.map((i) => i.id)).toEqual([String(location._id)]);
  });

  it("expose l'origine de chaque place — un classement inexplicable est indéfendable", async () => {
    const u = await createUser({ role: "partenaire" });
    await abonner(u, "business");
    await annonce({ owner: u._id });
    await annonce({ featured: true });
    await annonce();

    const v = await composerVitrine("vedette");
    expect(new Set(v.items.map((i) => i.origine))).toEqual(new Set(["epingle", "abonnement", "merite"]));
    expect(v.composition).toMatchObject({ epingle: 1, abonnement: 1, merite: 1 });
  });

  it("renvoie une vitrine vide plutôt que d'inventer, quand rien n'est publiable", async () => {
    await createVehicleDoc({ status: "pending" });
    await createVehicleDoc({ available: false });
    const v = await composerVitrine("vedette");
    expect(v.items).toEqual([]);
  });
});

describe("Boosts achetés", () => {
  const booste = (extra = {}) => annonce({
    sponsoredUntil: new Date(Date.now() + 7 * JOUR),
    boostLevel: 2,
    ...extra,
  });

  it("passe devant les places d'abonnement — c'est le produit le plus cher", async () => {
    // Le catalogue classe déjà les boosts avant les abonnements. Inverser
    // l'ordre ici reviendrait à vendre deux fois la même place, avec deux
    // promesses contradictoires.
    const abonne = await createUser({ role: "partenaire" });
    await abonner(abonne, "exportateur");
    await annonce({ owner: abonne._id });
    const paye = await booste({ title: "Mise en avant payée" });

    const v = await composerVitrine("vedette");
    const rang = (id) => v.items.findIndex((i) => i.id === String(id));
    expect(v.items.find((i) => i.id === String(paye._id)).origine).toBe("boost");
    expect(rang(paye._id)).toBeLessThan(v.items.findIndex((i) => i.origine === "abonnement"));
  });

  it("un boost échu ne vaut plus rien, sans qu'aucune tâche ait à l'éteindre", async () => {
    await booste({ sponsoredUntil: new Date(Date.now() - JOUR) });
    const v = await composerVitrine("vedette");
    expect(v.items.every((i) => i.origine !== "boost")).toBe(true);
  });

  it("classe un palier de boost supérieur devant un inférieur", async () => {
    const petit = await booste({ boostLevel: 1, title: "24 h" });
    const grand = await booste({ boostLevel: 4, title: "International" });
    const v = await composerVitrine("vedette");
    const rang = (id) => v.items.findIndex((i) => i.id === String(id));
    expect(rang(grand._id)).toBeLessThan(rang(petit._id));
  });

  it("ne laisse pas les boosts confisquer toute la vitrine", async () => {
    // Vingt achats le même jour annuleraient sinon les places promises aux
    // abonnés, qui ont payé elles aussi.
    for (let i = 0; i < 12; i++) {
      const u = await createUser({ role: "partenaire" });
      await booste({ owner: u._id });
    }
    const abonne = await createUser({ role: "partenaire" });
    await abonner(abonne, "business");
    const sienne = await annonce({ owner: abonne._id });

    const v = await composerVitrine("vedette");
    const plafond = Math.floor(EMPLACEMENTS.vedette.capacite * PART_MAX_BOOSTS);
    expect(v.items.filter((i) => i.origine === "boost")).toHaveLength(plafond);
    expect(v.items.map((i) => i.id)).toContain(String(sienne._id));
  });

  it("au-delà du plafond, les boosts tournent : chacun passe", async () => {
    const ids = [];
    for (let i = 0; i < 10; i++) {
      const u = await createUser({ role: "partenaire" });
      ids.push(String((await booste({ owner: u._id }))._id));
    }
    const vus = new Set();
    for (let j = 0; j < 10; j++) {
      const v = await composerVitrine("vedette", { maintenant: new Date(Date.now() + j * JOUR) });
      v.items.filter((i) => i.origine === "boost").forEach((i) => vus.add(i.id));
    }
    expect(vus.size).toBe(ids.length);
  });

  it("une mise en avant INCLUSE dans un abonnement entre par la même porte", async () => {
    // Les boosts offerts par un plan s'écrivent dans les mêmes champs
    // (sponsoredUntil/boostLevel, marqués « plan_inclus ») : les traiter à part
    // aurait créé une quatrième règle à maintenir.
    const u = await createUser({ role: "partenaire" });
    await abonner(u, "business");
    const offerte = await booste({ owner: u._id });
    const v = await composerVitrine("vedette");
    expect(v.items.find((i) => i.id === String(offerte._id)).origine).toBe("boost");
  });

  it("les activités n'ont pas de boost aujourd'hui, et n'en inventent pas", async () => {
    const u = await createUser({ role: "partenaire" });
    await Activity.create({
      owner: u._id, activityType: "SURF", title: "Cours de surf", price: 30,
      status: "approved", available: true, images: ["s.jpg"],
    });
    const v = await composerVitrine("loisirs");
    expect(v.items.every((i) => i.origine !== "boost")).toBe(true);
  });
});

describe("Vitrine des activités et loisirs", () => {
  const activite = async (extra = {}) => {
    const { owner, ...reste } = extra;
    const proprio = owner || (await createUser({ role: "partenaire" }))._id;
    return Activity.create({
      owner: proprio, activityType: "QUAD", title: "Randonnée quad",
      description: "Deux heures de quad sur la lagune, encadrement inclus, casque et équipement fournis pour tous les participants.",
      price: 45, durationMinutes: 120, capacity: 4, ville: "Abidjan",
      images: ["q1.jpg", "q2.jpg", "q3.jpg", "q4.jpg", "q5.jpg"],
      status: "approved", available: true, ...reste,
    });
  };

  it("compose la même façon que les véhicules, sans code séparé", async () => {
    const u = await createUser({ role: "partenaire" });
    await abonner(u, "exportateur");
    await activite({ owner: u._id, title: "Quad de l'abonné" });
    await activite({ title: "Quad au mérite", vues: 300 });

    const v = await composerVitrine("loisirs");
    expect(v.source).toBe("activites");
    expect(v.items).toHaveLength(2);
    expect(v.items.every((i) => i.source === "activite")).toBe(true);
    expect(v.items.some((i) => i.origine === "abonnement")).toBe(true);
    // La présentation porte ce dont une vignette de loisir a besoin.
    expect(v.items[0]).toMatchObject({ unite: expect.any(String) });
    expect(v.items[0].lien).toMatch(/^\/activity-booking\//);
  });

  it("compte une vignette seule comme illustration, plutôt que de pénaliser la fiche", async () => {
    const avecVignette = await activite({ images: [], thumbnail: "vignette.jpg" });
    const sansRien     = await activite({ images: [], thumbnail: null });
    const v = await composerVitrine("loisirs");
    const score = (id) => v.items.find((i) => i.id === String(id))?.score ?? -1;
    expect(score(avecVignette._id)).toBeGreaterThan(score(sansRien._id));
  });

  it("n'affiche pas une activité non publiée ou indisponible", async () => {
    await activite({ status: "pending" });
    await activite({ available: false });
    expect((await composerVitrine("loisirs")).items).toEqual([]);
  });
});

describe("Vitrine des partenaires", () => {
  it("classe sur l'activité RÉELLE du partenaire, pas sur son compte seul", async () => {
    // `User` ne porte ni photos ni vues : sans signaux tirés de ses annonces, la
    // section serait figée sur l'ordre de création.
    const actif = await createUser({ role: "partenaire", certificationBadge: "verifie" });
    for (let i = 0; i < 5; i++) await annonce({ owner: actif._id, vues: 200, noteMoyenne: 5, nombreAvis: 10 });
    const inactif = await createUser({ role: "partenaire" });

    const v = await composerVitrine("partenaires");
    const rang = (id) => v.items.findIndex((i) => i.id === String(id));
    expect(rang(actif._id)).toBeLessThan(rang(inactif._id));
    expect(v.items.find((i) => i.id === String(actif._id)).lien).toBe(`/showroom/${actif._id}`);
  });

  it("exclut les comptes d'équipe et les comptes désactivés", async () => {
    // Un compte d'équipe n'est pas un partenaire distinct : l'afficher
    // montrerait deux fois la même entreprise.
    const titulaire = await createUser({ role: "partenaire" });
    await createUser({ role: "partenaire", teamOf: titulaire._id, teamRole: "gestionnaire" });
    await createUser({ role: "partenaire", isActive: false });
    await createUser({ role: "client" });

    const v = await composerVitrine("partenaires");
    expect(v.items.map((i) => i.id)).toEqual([String(titulaire._id)]);
  });
});

describe("Endpoint public", () => {
  it("refuse un emplacement inconnu", async () => {
    const { req, res } = mockReqRes({ params: { emplacement: "page_de_garde" }, query: {} });
    await getSpotlight(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/hero/);
  });

  it("n'accepte qu'un code pays à deux lettres — une valeur libre polluerait le cache", async () => {
    cacheClear();
    await annonce({ country: "CI" });
    for (const country of ["ci", "CI"]) {
      const { req, res } = mockReqRes({ params: { emplacement: "vedette" }, query: { country } });
      await getSpotlight(req, res);
      expect(res.body.pays).toBe("CI");
    }
    for (const country of ["INTL", "FRANCE", "<script>", ""]) {
      cacheClear();
      const { req, res } = mockReqRes({ params: { emplacement: "vedette" }, query: { country } });
      await getSpotlight(req, res);
      expect(res.body.pays, String(country)).toBeNull();
    }
  });

  it("replie sur la sélection mondiale si le pays du visiteur ne donne rien", async () => {
    cacheClear();
    await annonce({ country: "MA" });
    const { req, res } = mockReqRes({ params: { emplacement: "vedette" }, query: { country: "CI" } });
    await getSpotlight(req, res);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.repliMondial).toBe(true);
  });

  it("idsVitrine sert le même ensemble que la vitrine, en ObjectId bruts", async () => {
    // Deux exigences en une. D'abord : une seule composition — le filtre
    // `featured=true` du catalogue s'appuie dessus, et deux compositions
    // concurrentes afficheraient deux vitrines contradictoires sur la même page.
    //
    // Ensuite le TYPE, qui a été un vrai défaut : le catalogue injecte ces
    // identifiants dans un `$match` d'agrégation, où Mongoose ne convertit
    // rien. Renvoyer des chaînes hexadécimales n'appariait aucun document et
    // vidait la vitrine SANS la moindre erreur.
    cacheClear();
    await annonce({ featured: true });
    await annonce();
    const v = await composerVitrine("vedette");
    cacheClear();

    const ids = await idsVitrine("vedette");
    expect(ids.map(String)).toEqual(v.items.map((i) => i.id));
    expect(ids.every((id) => id instanceof mongoose.Types.ObjectId)).toBe(true);

    // Preuve d'usage : une agrégation, exactement comme celle du catalogue.
    const trouves = await Vehicle.aggregate([{ $match: { _id: { $in: ids } } }]);
    expect(trouves).toHaveLength(ids.length);
  });

  it("couvre chaque emplacement déclaré", async () => {
    // Un emplacement ajouté à EMPLACEMENTS sans être servi renverrait 500 sur
    // la page d'accueil.
    for (const emplacement of Object.keys(EMPLACEMENTS)) {
      cacheClear();
      const { req, res } = mockReqRes({ params: { emplacement }, query: {} });
      await getSpotlight(req, res);
      expect(res.statusCode, emplacement).toBe(200);
      expect(Array.isArray(res.body.items), emplacement).toBe(true);
    }
  });
});
