import { describe, it, expect } from "vitest";
import {
  composerVitrine, scoreDeMerite, fenetreDuJour, jourDeRotation,
  PLACES_PAR_PLAN, MAX_PAR_PARTENAIRE, EMPLACEMENTS, POIDS, PART_MAX_BOOSTS, PART_MAX_EPINGLES, idsVitrine,
  FIN_VITRINE_PARTENAIRES_GRATUITE, vitrinePartenairesOuverte,
} from "../services/spotlightEngine.js";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { getSpotlight } from "../controllers/spotlightController.js";
import Subscription from "../models/Subscription.js";
import Activity from "../models/Activity.js";
import PartnerShowroom from "../models/PartnerShowroom.js";
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

// Partenaire dont l'adresse n'est PAS sur un domaine réservé.
//
// Les fixtures créent leurs comptes sur `@example.test` — un domaine réservé par
// la norme, donc exactement ce que la vitrine partenaires exclut. C'est correct
// des deux côtés : un compte de fixture EST un compte de test. Les cas qui
// veulent un partenaire affichable doivent donc le dire explicitement.
let compteur = 0;
const partenaireReel = (extra = {}) =>
  createUser({ role: "partenaire", email: `pro${++compteur}.vitauto@gmail.com`, ...extra });

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

  it("remplit toutes les places même quand un seul partenaire domine le vivier", async () => {
    // Défaut RÉEL constaté en production : le plafond par partenaire
    // s'appliquait au moment d'insérer, après troncature du vivier. Un
    // partenaire à 267 annonces remplissait donc tout le vivier de ses propres
    // annonces, dont deux seulement étaient retenues — et les places restantes
    // n'étaient offertes à personne. Quatre places sur huit restaient vides
    // alors que 333 annonces étaient éligibles.
    const gros = await createUser({ role: "partenaire" });
    for (let i = 0; i < 60; i++) await annonce({ owner: gros._id, vues: 500 });
    // Trois petits partenaires, volontairement MOINS bien notés : ils ne
    // doivent leur place qu'à la libération du plafond, pas à leur score.
    // Deux annonces chacun : avec un plafond de 2 par partenaire, il faut au
    // moins quatre partenaires pour pourvoir huit places.
    const petits = [];
    for (let i = 0; i < 3; i++) {
      const u = await createUser({ role: "partenaire" });
      petits.push(await annonce({ owner: u._id, vues: 0 }));
      petits.push(await annonce({ owner: u._id, vues: 0 }));
    }

    const v = await composerVitrine("vedette");
    const ids = v.items.map((i) => i.id);
    expect(v.items).toHaveLength(EMPLACEMENTS.vedette.capacite);
    // Le partenaire dominant garde exactement son plafond, ni plus ni moins.
    const idsGros = (await Vehicle.find({ owner: gros._id }).select("_id").lean()).map((x) => String(x._id));
    expect(ids.filter((id) => idsGros.includes(id))).toHaveLength(MAX_PAR_PARTENAIRE);
    // Et les six annonces des petits partenaires occupent le reste.
    expect(ids.filter((id) => petits.some((p) => String(p._id) === id))).toHaveLength(6);
  });

  it("plafonne l'épinglage administrateur, et le fait tourner au-delà", async () => {
    // Treize annonces épinglées vivent en production. Sans plafond, elles
    // occuperaient toute la vitrine et les places vendues aux abonnés
    // n'existeraient plus.
    const admin = await createUser({ role: "partenaire" });
    const epinglees = [];
    for (let i = 0; i < 10; i++) epinglees.push(await annonce({ owner: admin._id, featured: true }));
    for (let i = 0; i < 6; i++) await annonce();

    const plafond = Math.floor(EMPLACEMENTS.vedette.capacite * PART_MAX_EPINGLES);
    const v = await composerVitrine("vedette");
    expect(v.composition.epingle).toBe(plafond);
    expect(v.items).toHaveLength(EMPLACEMENTS.vedette.capacite);

    // Et sur plusieurs jours, chaque annonce épinglée finit par passer.
    const vus = new Set();
    for (let j = 0; j < 10; j++) {
      const jour = await composerVitrine("vedette", { maintenant: new Date(Date.now() + j * JOUR) });
      jour.items.filter((i) => i.origine === "epingle").forEach((i) => vus.add(i.id));
    }
    expect(vus.size).toBe(epinglees.length);
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
    const actif = await partenaireReel({ certificationBadge: "verifie" });
    await PartnerShowroom.create({ partnerId: actif._id, companyName: "Actif", isPublished: true });
    for (let i = 0; i < 5; i++) await annonce({ owner: actif._id, vues: 200, noteMoyenne: 5, nombreAvis: 10 });
    // Publie une annonce, mais une seule et sans engagement : éligible, donc
    // réellement comparable — un compte sans annonce serait simplement exclu.
    const inactif = await partenaireReel();
    await PartnerShowroom.create({ partnerId: inactif._id, companyName: "Inactif", isPublished: true });
    await annonce({ owner: inactif._id, vues: 0 });

    const v = await composerVitrine("partenaires");
    const rang = (id) => v.items.findIndex((i) => i.id === String(id));
    expect(rang(actif._id)).toBeLessThan(rang(inactif._id));
    expect(v.items.find((i) => i.id === String(actif._id)).lien).toBe("/showroom/actif");
  });

  it("n'affiche pas les comptes de test présents en production", async () => {
    // Six comptes créés par des scripts d'audit vivent dans la base de
    // production. Invisibles tant que rien ne mettait de partenaires en avant,
    // ils sont devenus visibles des visiteurs avec la nouvelle section.
    //
    // Le filtre porte sur les domaines RÉSERVÉS par la norme (RFC 2606/6761),
    // qui n'appartiennent à personne — jamais sur le mot « test » dans un nom,
    // qui écarterait des patronymes réels.
    const reels = [];
    for (const email of ["ho.rentacar@gmail.com", "913824211@qq.com", "testa@exemple.fr"]) {
      const u = await createUser({ role: "partenaire", email });
      await PartnerShowroom.create({ partnerId: u._id, companyName: email, isPublished: true });
      reels.push(u);
    }
    for (const email of ["sec-p-178@vit-auto-test.local", "test.kenya.98@example.com", "ie-partner@vit-auto-test.local", "x@example.org"]) {
      const u = await createUser({ role: "partenaire", email });
      // Même avec un showroom publié : un compte de test n'a rien à faire en
      // page d'accueil.
      await PartnerShowroom.create({ partnerId: u._id, companyName: email, isPublished: true });
    }

    // Vérifié dans les DEUX régimes : la fenêtre d'ouverture lève la condition
    // commerciale, jamais l'exclusion des comptes de test.
    for (const maintenant of [new Date(), new Date(FIN_VITRINE_PARTENAIRES_GRATUITE.getTime() + 86400000)]) {
      const v = await composerVitrine("partenaires", { maintenant });
      expect(v.items.map((i) => i.id).sort(), maintenant.toISOString())
        .toEqual(reels.map((u) => String(u._id)).sort());
    }
  });

  it("n'affiche QUE showroom publié, boost en cours ou abonnement actif — APRÈS la fenêtre", async () => {
    // Trois portes d'entrée, et seulement trois. La vignette mène à
    // `/showroom/:id` : sans showroom publié, elle mène à une page vide — et
    // pour ceux qui n'en ont pas, seul un engagement commercial justifie la
    // place la plus vue du site.
    const avecShowroom = await partenaireReel();
    await PartnerShowroom.create({ partnerId: avecShowroom._id, companyName: "Garage Atlas", isPublished: true });

    // Boost et abonnement doivent être valides À LA DATE ÉVALUÉE, pas
    // aujourd'hui : un engagement expiré ne vaut plus rien, et c'est bien ce
    // que le moteur doit constater.
    const apresLaFenetre = new Date(FIN_VITRINE_PARTENAIRES_GRATUITE.getTime() + 86400000);
    const encoreValide = new Date(apresLaFenetre.getTime() + 30 * JOUR);

    const avecBoost = await partenaireReel();
    await annonce({ owner: avecBoost._id, sponsoredUntil: encoreValide, boostLevel: 2 });

    const avecAbonnement = await partenaireReel();
    await Subscription.create({
      vendor: avecAbonnement._id, plan: "business",
      planDetails: { startDate: new Date(), endDate: encoreValide, isActive: true, priceUSD: 19.99 },
    });
    await annonce({ owner: avecAbonnement._id });

    // Écartés : beaucoup d'annonces mais aucun engagement ni showroom.
    const sansRien = await partenaireReel();
    for (let i = 0; i < 5; i++) await annonce({ owner: sansRien._id, vues: 900 });
    // Showroom existant mais NON publié : un brouillon ne vaut pas une vitrine.
    const brouillon = await partenaireReel();
    await PartnerShowroom.create({ partnerId: brouillon._id, companyName: "Brouillon", isPublished: false });
    await annonce({ owner: brouillon._id });
    // Boost échu à la date évaluée : ne vaut plus rien.
    const boostEchu = await partenaireReel();
    await annonce({ owner: boostEchu._id, sponsoredUntil: new Date(Date.now() + 7 * JOUR), boostLevel: 3 });

    const v = await composerVitrine("partenaires", { maintenant: apresLaFenetre });
    expect(v.items.map((i) => i.id).sort())
      .toEqual([avecShowroom, avecBoost, avecAbonnement].map((u) => String(u._id)).sort());
  });

  it("pendant les douze premiers mois, TOUS les partenaires sont visibles sans condition commerciale", async () => {
    // La plateforme est jeune : réserver la page d'accueil aux abonnés d'une
    // offre que personne n'a encore souscrite la laisserait vide. Même geste et
    // même durée que l'offre Partenaire Fondateur.
    expect(vitrinePartenairesOuverte(new Date())).toBe(true);

    const sansRien = await partenaireReel();
    await annonce({ owner: sansRien._id });
    const avecShowroom = await partenaireReel();
    await PartnerShowroom.create({ partnerId: avecShowroom._id, companyName: "Atlas", isPublished: true });

    const v = await composerVitrine("partenaires");
    expect(v.items.map((i) => i.id).sort())
      .toEqual([sansRien, avecShowroom].map((u) => String(u._id)).sort());
  });

  it("la règle commerciale reprend D'ELLE-MÊME à l'échéance, sans redéploiement", async () => {
    // La date est comparée à l'instant de la requête, exactement comme l'est la
    // validité d'un boost : aucune tâche planifiée n'a à basculer le régime.
    const sansEngagement = await partenaireReel();
    await annonce({ owner: sansEngagement._id });

    const veille = new Date(FIN_VITRINE_PARTENAIRES_GRATUITE.getTime() - 86400000);
    const lendemain = new Date(FIN_VITRINE_PARTENAIRES_GRATUITE.getTime() + 86400000);
    expect((await composerVitrine("partenaires", { maintenant: veille })).items).toHaveLength(1);
    expect((await composerVitrine("partenaires", { maintenant: lendemain })).items).toHaveLength(0);
  });

  it("un partenaire sans showroom mène à ses annonces, jamais à une page « introuvable »", async () => {
    // `/showroom/:id` sans showroom publié affiche « Showroom introuvable ».
    // Ses annonces, elles, existent : le catalogue filtré sur lui est la bonne
    // destination.
    const u = await partenaireReel();
    await annonce({ owner: u._id });

    const v = await composerVitrine("partenaires");
    expect(v.items[0].lien).toBe(`/catalogue?owner=${u._id}`);
  });

  it("un partenaire sans showroom ET sans annonce reste exclu, même pendant la fenêtre", async () => {
    // Ce n'est pas une barrière commerciale, c'est l'absence de contenu : sa
    // vignette ne mènerait nulle part.
    const vide = await partenaireReel();
    const avecAnnonce = await partenaireReel();
    await annonce({ owner: avecAnnonce._id });

    const v = await composerVitrine("partenaires");
    expect(v.items.map((i) => i.id)).toEqual([String(avecAnnonce._id)]);
    expect(v.items.map((i) => i.id)).not.toContain(String(vide._id));
  });

  it("pointe sur le slug du showroom quand il en existe un", async () => {
    // Deux adresses pour la même page dilueraient son référencement : la
    // vignette doit mener à la MÊME URL que le plan de site.
    const u = await partenaireReel();
    await PartnerShowroom.create({ partnerId: u._id, companyName: "Garage Atlas", isPublished: true, slug: "garage-atlas" });

    const v = await composerVitrine("partenaires");
    expect(v.items[0].lien).toBe("/showroom/garage-atlas");
  });

  it("exclut les comptes d'équipe et les comptes désactivés", async () => {
    // Un compte d'équipe n'est pas un partenaire distinct : l'afficher
    // montrerait deux fois la même entreprise.
    const titulaire = await partenaireReel();
    await PartnerShowroom.create({ partnerId: titulaire._id, companyName: "Titulaire", isPublished: true });
    const membre = await partenaireReel({ teamOf: titulaire._id, teamRole: "gestionnaire" });
    await PartnerShowroom.create({ partnerId: membre._id, companyName: "Membre", isPublished: true });
    const desactive = await partenaireReel({ isActive: false });
    await PartnerShowroom.create({ partnerId: desactive._id, companyName: "Désactivé", isPublished: true });
    await createUser({ role: "client" });

    const v = await composerVitrine("partenaires");
    expect(v.items.map((i) => i.id)).toEqual([String(titulaire._id)]);
  });
});

describe("Coût de composition", () => {
  it("ne charge JAMAIS la photo de profil dans le vivier de candidats", async () => {
    // `User.profilePhoto` contient une image en base64 — jusqu'à 1,9 Mo pour un
    // seul compte, et 45 Mo sur toute la collection. La charger pour les ~108
    // candidats afin d'en afficher six coûtait 20 s mesurées en base réelle, et
    // 23 s sur l'endpoint public. Les photos sont désormais lues APRÈS la
    // sélection, pour la poignée d'éléments retenus.
    //
    // Test sur la source, faute de pouvoir observer la projection depuis le
    // test : c'est la seule façon d'empêcher qu'on la remette dans la liste des
    // champs par simple commodité.
    const src = fs.readFileSync(path.join(process.cwd(), "services", "spotlightEngine.js"), "utf8");
    const ligneChamps = src.split("\n").find((l) => l.includes("champs:") && l.includes("certificationBadge"));
    expect(ligneChamps).toBeTruthy();
    expect(ligneChamps).not.toMatch(/profilePhoto/);
    expect(src).toMatch(/enrichir:/); // la récupération tardive existe bien
  });

  it("renvoie tout de même la photo des partenaires retenus", async () => {
    const u = await partenaireReel({ profilePhoto: "data:image/png;base64,AAAA" });
    await annonce({ owner: u._id });
    const v = await composerVitrine("partenaires");
    expect(v.items[0].image).toBe("data:image/png;base64,AAAA");
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
