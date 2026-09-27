import { describe, it, expect, vi, afterEach } from "vitest";
import { createBooking, reglerEcheance, consulterEcheancier } from "../controllers/bookingController.js";
import { updateDriver, createDriver } from "../controllers/driverController.js";
import Booking from "../models/Booking.js";
import Driver from "../models/Driver.js";
import Subscription from "../models/Subscription.js";
import {
  ajouterMois, remiseApplicable, montantContrat,
  construireEcheancier, statutEcheance, resteAEncaisser,
} from "../services/miseADisposition.js";
import { createUser, createDriverDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ── Mise à disposition longue durée (2026-09-27) ───────────────────────────
//
// Ce qui existait déjà : le tarif au mois (2026-09-16) et l'unité « mois » à
// la réservation. Un client pouvait donc réserver six mois — mais il les
// payait d'un bloc, et douze mois coûtaient exactement douze fois un mois.
// Aucune entreprise ne signe à ces conditions, et le chauffeur n'avait aucun
// levier pour transformer des missions ponctuelles en revenu récurrent.
//
// L'outil ajoute donc DEUX choses, et deux seulement : une remise par palier
// d'engagement, et un échéancier mensuel. Le rail de paiement est intact.
const IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const clientInfo = { firstName: "Jean", lastName: "Client", email: "jean.client@example.test", passportNumber: "P1234567" };

const OFFRE = {
  active: true, dureeMinMois: 3, dureeMaxMois: 12,
  paliers: [{ aPartirDeMois: 6, remisePourcent: 10 }, { aPartirDeMois: 12, remisePourcent: 20 }],
};

async function chauffeurSousContrat(offre = OFFRE, driverOverrides = {}) {
  const owner = await createUser({ role: "partenaire", isFounder: true });
  const driver = await createDriverDoc({ owner: owner._id, tarifMois: 1000, ...driverOverrides });
  await Driver.updateOne({ _id: driver._id }, { $set: { miseADisposition: offre } });
  return { owner, driver: await Driver.findById(driver._id) };
}

const reserver = async (driver, chauffeur) => {
  const client = await createUser({ role: "client", emailVerified: true });
  const { req, res } = mockReqRes({
    user: client,
    body: {
      type: "chauffeur", clientInfo,
      documents: { identity: { type: "cni", frontImage: IMG } },
      driverId: driver._id.toString(), chauffeur,
    },
  });
  await createBooking(req, res);
  return { res, client };
};

describe("Mise à disposition — calcul du contrat", () => {
  it("le palier le plus long atteint l'emporte, les paliers ne sont pas supposés triés", () => {
    const offre = { paliers: [{ aPartirDeMois: 12, remisePourcent: 20 }, { aPartirDeMois: 6, remisePourcent: 10 }] };
    expect(remiseApplicable(offre, 3)).toBeNull();
    expect(remiseApplicable(offre, 6).remisePourcent).toBe(10);
    expect(remiseApplicable(offre, 11).remisePourcent).toBe(10);
    expect(remiseApplicable(offre, 12).remisePourcent).toBe(20);
  });

  it("un palier sans remise réelle est ignoré plutôt que refusé", () => {
    // Une saisie à 0 % est une erreur, jamais une intention : l'appliquer
    // afficherait au client une « remise » qui ne baisse rien.
    expect(remiseApplicable({ paliers: [{ aPartirDeMois: 6, remisePourcent: 0 }] }, 12)).toBeNull();
  });

  it("la mensualité est arrondie AVANT d'être multipliée : pas de reliquat de centimes", () => {
    // 333,33 × 3 = 999,99 et non 1 000 : c'est la mensualité que le client
    // paie chaque mois, donc c'est elle qui fait foi. L'inverse laisserait un
    // centime orphelin sur la dernière échéance, que personne ne sait
    // expliquer au client.
    const driver = { tarifMois: 1000, miseADisposition: { paliers: [{ aPartirDeMois: 3, remisePourcent: 66.667 }] } };
    const devis = montantContrat(driver, 3);
    expect(devis.mensualiteUSD).toBe(333.33);
    expect(devis.totalUSD).toBe(999.99);
  });

  it("sans offre, le contrat vaut exactement tarif × durée", () => {
    const devis = montantContrat({ tarifMois: 1000 }, 12);
    expect(devis.totalUSD).toBe(12000);
    expect(devis.remisePourcent).toBe(0);
  });
});

describe("Mise à disposition — échéancier", () => {
  it("une échéance par mois, la première à la prise d'effet", () => {
    const e = construireEcheancier({ debut: new Date("2027-03-10T09:00:00.000Z"), dureeMois: 3, mensualiteUSD: 900 });
    expect(e.map((x) => x.numero)).toEqual([1, 2, 3]);
    expect(e[0].dateEcheance.getUTCMonth()).toBe(2);
    expect(e[1].dateEcheance.getUTCMonth()).toBe(3);
    expect(e[2].dateEcheance.getUTCMonth()).toBe(4);
  });

  it("le 31 janvier + 1 mois tombe au 28 février, jamais au 3 mars", () => {
    // Le débordement natif de JavaScript ferait purement SAUTER l'échéance
    // de février — un mois facturé qui n'apparaît nulle part.
    expect(ajouterMois(new Date(2027, 0, 31), 1).getMonth()).toBe(1);
    expect(ajouterMois(new Date(2027, 0, 31), 1).getDate()).toBe(28);
    expect(ajouterMois(new Date(2028, 0, 31), 1).getDate()).toBe(29); // 2028 bissextile
  });

  it("le supplément de zone est porté par la PREMIÈRE échéance, jamais réparti", () => {
    const e = construireEcheancier({ debut: new Date("2027-03-01"), dureeMois: 3, mensualiteUSD: 900, supplementInitialUSD: 50 });
    expect(e[0].montantUSD).toBe(950);
    expect(e[1].montantUSD).toBe(900);
  });

  it("une échéance à venir devient due à sa date, et réglée reste réglée", () => {
    const b = { status: "confirmed" };
    const futur = { dateEcheance: new Date("2099-01-01") };
    const passe = { dateEcheance: new Date("2020-01-01") };
    expect(statutEcheance(futur, b)).toBe("a_venir");
    expect(statutEcheance(passe, b)).toBe("due");
    expect(statutEcheance({ ...passe, regleeLe: new Date() }, b)).toBe("reglee");
  });

  it("annuler la commande éteint ce qui restait dû, sans effacer ce qui fut réglé", () => {
    // Le statut est CALCULÉ : sans cela, il faudrait penser à parcourir les
    // échéances à chaque annulation — l'oubli classique.
    const annulee = { status: "cancelled" };
    expect(statutEcheance({ dateEcheance: new Date("2020-01-01") }, annulee)).toBe("annulee");
    expect(statutEcheance({ dateEcheance: new Date("2020-01-01"), regleeLe: new Date() }, annulee)).toBe("reglee");
  });
});

describe("Mise à disposition — à la réservation", () => {
  it("douze mois d'engagement déclenchent la remise, et la somme des échéances vaut le total", async () => {
    const { driver } = await chauffeurSousContrat();
    const { res } = await reserver(driver, { date: "2027-03-01T09:00:00.000Z", unite: "mois", quantite: 12 });
    expect(res.statusCode).toBe(201);

    // 1 000 − 20 % = 800 par mois, soit 9 600 au lieu de 12 000.
    const contrat = res.body.booking.chauffeur.contrat;
    expect(contrat.remisePourcent).toBe(20);
    expect(contrat.mensualiteUSD).toBe(800);
    expect(res.body.booking.montantBase).toBe(9600);

    // L'invariant qui compte : l'échéancier DÉCOUPE le montant, il ne s'y ajoute pas.
    expect(contrat.echeances).toHaveLength(12);
    const somme = contrat.echeances.reduce((s, e) => s + e.montantUSD, 0);
    expect(Math.round(somme * 100) / 100).toBe(res.body.booking.montantBase);
  });

  it("sous la durée minimale, rien ne change : ni contrat, ni remise", async () => {
    const { driver } = await chauffeurSousContrat();
    const { res } = await reserver(driver, { date: "2027-03-01T09:00:00.000Z", unite: "mois", quantite: 2 });
    expect(res.statusCode).toBe(201);
    expect(res.body.booking.montantBase).toBe(2000);
    expect(res.body.booking.chauffeur.contrat?.dureeMois ?? null).toBeNull();
  });

  it("offre inactive : le tarif au mois continue de fonctionner comme avant", async () => {
    // Règle du chantier : un outil de palier n'enlève JAMAIS ce qui était
    // déjà gratuit. Le tarif au mois existe depuis le 2026-09-16.
    const { driver } = await chauffeurSousContrat({ ...OFFRE, active: false });
    const { res } = await reserver(driver, { date: "2027-03-01T09:00:00.000Z", unite: "mois", quantite: 6 });
    expect(res.statusCode).toBe(201);
    expect(res.body.booking.montantBase).toBe(6000);
    expect(res.body.booking.chauffeur.contrat?.dureeMois ?? null).toBeNull();
  });

  it("au-delà de la durée maximale, le contrat est refusé plutôt que silencieusement raccourci", async () => {
    const { driver } = await chauffeurSousContrat();
    const { res } = await reserver(driver, { date: "2027-03-01T09:00:00.000Z", unite: "mois", quantite: 24 });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("CONTRACT_TOO_LONG");
  });

  it("le supplément de zone s'ajoute une fois au contrat, pas à chaque mois", async () => {
    const { driver } = await chauffeurSousContrat();
    await Driver.updateOne({ _id: driver._id }, { $set: { zonesTarifaires: [{ nom: "Aéroport", supplementUSD: 50 }] } });
    const frais = await Driver.findById(driver._id);
    const { res } = await reserver(frais, { date: "2027-03-01T09:00:00.000Z", unite: "mois", quantite: 6, zone: "Aéroport" });
    expect(res.statusCode).toBe(201);
    // 1 000 − 10 % = 900 × 6 = 5 400, + 50 une seule fois.
    expect(res.body.booking.montantBase).toBe(5450);
    expect(res.body.booking.chauffeur.contrat.echeances[0].montantUSD).toBe(950);
  });
});

describe("Mise à disposition — règlement des échéances", () => {
  it("le partenaire constate un règlement, et le reste à encaisser baisse d'autant", async () => {
    const { owner, driver } = await chauffeurSousContrat();
    const { res } = await reserver(driver, { date: "2027-03-01T09:00:00.000Z", unite: "mois", quantite: 6 });
    const id = res.body.booking._id.toString();

    const { req: r1, res: s1 } = mockReqRes({ user: owner, params: { id, numero: "1" }, body: { moyenPaiement: "virement" } });
    await reglerEcheance(r1, s1);
    expect(s1.statusCode).toBe(200);
    expect(s1.body.echeances[0].statut).toBe("reglee");

    const apres = await Booking.findById(id);
    expect(resteAEncaisser(apres)).toBe(4500); // 5 400 − 900
  });

  it("une échéance déjà réglée ne se règle pas deux fois", async () => {
    const { owner, driver } = await chauffeurSousContrat();
    const { res } = await reserver(driver, { date: "2027-03-01T09:00:00.000Z", unite: "mois", quantite: 6 });
    const id = res.body.booking._id.toString();
    const regler = async () => {
      const { req, res: r } = mockReqRes({ user: owner, params: { id, numero: "1" }, body: {} });
      await reglerEcheance(req, r);
      return r;
    };
    expect((await regler()).statusCode).toBe(200);
    expect((await regler()).statusCode).toBe(409);
  });

  it("un tiers ne peut ni lire ni régler l'échéancier d'un contrat qui n'est pas le sien", async () => {
    const { driver } = await chauffeurSousContrat();
    const { res } = await reserver(driver, { date: "2027-03-01T09:00:00.000Z", unite: "mois", quantite: 6 });
    const id = res.body.booking._id.toString();
    const intrus = await createUser({ role: "partenaire" });

    const { req: r1, res: s1 } = mockReqRes({ user: intrus, params: { id, numero: "1" }, body: {} });
    await reglerEcheance(r1, s1);
    expect(s1.statusCode).toBe(403);

    const { req: r2, res: s2 } = mockReqRes({ user: intrus, params: { id } });
    await consulterEcheancier(r2, s2);
    expect(s2.statusCode).toBe(403);
  });

  it("le client lit son échéancier mais ne le règle pas lui-même", async () => {
    const { driver } = await chauffeurSousContrat();
    const { res, client } = await reserver(driver, { date: "2027-03-01T09:00:00.000Z", unite: "mois", quantite: 6 });
    const id = res.body.booking._id.toString();

    const { req: r1, res: s1 } = mockReqRes({ user: client, params: { id } });
    await consulterEcheancier(r1, s1);
    expect(s1.statusCode).toBe(200);
    expect(s1.body.echeances).toHaveLength(6);

    const { req: r2, res: s2 } = mockReqRes({ user: client, params: { id, numero: "1" }, body: {} });
    await reglerEcheance(r2, s2);
    expect(s2.statusCode).toBe(403);
  });
});

describe("Mise à disposition — verrou de palier", () => {
  // ⚠️ L'immunité de lancement (FIN_IMMUNITE_QUOTAS, 10/09/2027) ouvre TOUS
  // les outils à tous les partenaires jusqu'à cette date : sans avancer
  // l'horloge, un test de verrou passerait au vert en ne vérifiant rien —
  // exactement le genre de garde qui s'endort et laisse fuiter la fonction le
  // jour où l'immunité tombe. Seule la date est simulée, pas les minuteries :
  // mongodb-memory-server a besoin des vraies.
  const APRES_IMMUNITE = new Date("2027-10-01T00:00:00Z");
  afterEach(() => vi.useRealTimers());

  const activer = async (user, driver, offre) => {
    const { req, res } = mockReqRes({
      user, params: { id: driver._id.toString() },
      body: { miseADisposition: offre, profilePhoto: driver.profilePhoto },
    });
    await updateDriver(req, res);
    return res;
  };

  it("un partenaire sans le palier ne peut pas activer l'offre", async () => {
    // `isFounder: false` et aucun abonnement : le compte est au palier gratuit.
    const owner = await createUser({ role: "partenaire" });
    const driver = await createDriverDoc({ owner: owner._id, tarifMois: 1000 });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(APRES_IMMUNITE);
    const res = await activer(owner, driver, OFFRE);
    expect(res.statusCode).toBe(403);
    expect(res.body.feature).toBe("miseADisposition");
  });

  it("le palier Business l'ouvre, le gratuit ne l'ouvre pas", async () => {
    const owner = await createUser({ role: "partenaire" });
    const driver = await createDriverDoc({ owner: owner._id, tarifMois: 1000 });
    await Subscription.create({
      vendor: owner._id, plan: "business",
      planDetails: { isActive: true, startDate: new Date("2027-01-01"), endDate: new Date("2028-01-01") },
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(APRES_IMMUNITE);
    const res = await activer(owner, driver, OFFRE);
    expect(res.statusCode).toBe(200);
  });

  it("jusqu'à la fin de l'immunité de lancement, l'outil reste ouvert à tous", async () => {
    // Règle du produit : on ne retire pas du jour au lendemain un outil à un
    // partenaire gratuit qui s'en sert déjà.
    const owner = await createUser({ role: "partenaire" });
    const driver = await createDriverDoc({ owner: owner._id, tarifMois: 1000 });
    const res = await activer(owner, driver, OFFRE);
    expect(res.statusCode).toBe(200);
  });

  it("désactiver reste libre : on n'enferme pas un partenaire dans une promesse", async () => {
    const owner = await createUser({ role: "partenaire" });
    const driver = await createDriverDoc({ owner: owner._id, tarifMois: 1000 });
    await Driver.updateOne({ _id: driver._id }, { $set: { miseADisposition: OFFRE } });
    const res = await activer(owner, await Driver.findById(driver._id), { ...OFFRE, active: false });
    expect(res.statusCode).toBe(200);
    expect((await Driver.findById(driver._id)).miseADisposition.active).toBe(false);
  });

  it("pas de tarif au mois, pas d'offre : un contrat sans prix n'est pas un contrat", async () => {
    const owner = await createUser({ role: "partenaire", isFounder: true });
    const driver = await createDriverDoc({ owner: owner._id, tarifMois: null });
    const res = await activer(owner, driver, OFFRE);
    expect(res.statusCode).toBe(400);
  });

  it("un palier de remise au-delà de la durée maximale est refusé", async () => {
    const owner = await createUser({ role: "partenaire", isFounder: true });
    const driver = await createDriverDoc({ owner: owner._id, tarifMois: 1000 });
    const res = await activer(owner, driver, { ...OFFRE, dureeMaxMois: 6, paliers: [{ aPartirDeMois: 12, remisePourcent: 20 }] });
    expect(res.statusCode).toBe(400);
  });
});

describe("Outils saisis dès la PUBLICATION", () => {
  // ⚠️ Trou réel trouvé le 2026-09-27 en câblant les écrans : les
  // normaliseurs n'étaient appelés qu'à l'ÉDITION. Un partenaire saisissait
  // ses zones ou son offre au formulaire de publication et elles
  // disparaissaient sans un mot — le champ n'était pas déclaré dans la
  // création, donc Mongoose l'ignorait. Écriture perdue en silence.
  const publier = async (user, corps) => {
    const { req, res } = mockReqRes({ user, body: {
      firstName: "Ama", lastName: "Koné", title: "Chauffeur pro",
      profilePhoto: IMG, cv: "https://cdn.example.test/cv.pdf",
      disponibilite: "Temps plein", zone: "Abidjan", experience: "5 ans",
      tarifHeure: 100, tarifMois: 1000,
      identityDocument: { type: "cni", frontImage: IMG },
      licenseDocument: { frontImage: IMG },
      ...corps,
    } });
    await createDriver(req, res);
    return res;
  };

  it("l'offre saisie à la publication est bien enregistrée", async () => {
    const owner = await createUser({ role: "partenaire", isFounder: true, sellerType: "particulier" });
    const res = await publier(owner, { miseADisposition: OFFRE });
    expect(res.statusCode).toBe(201);
    const driver = await Driver.findById(res.body.driver?._id || res.body._id);
    expect(driver.miseADisposition.active).toBe(true);
    expect(driver.miseADisposition.paliers).toHaveLength(2);
  });

  it("les zones tarifaires saisies à la publication sont bien enregistrées", async () => {
    const owner = await createUser({ role: "partenaire", isFounder: true, sellerType: "particulier" });
    const res = await publier(owner, { zonesTarifaires: [{ nom: "Aéroport", supplementUSD: 50 }] });
    expect(res.statusCode).toBe(201);
    const driver = await Driver.findById(res.body.driver?._id || res.body._id);
    expect(driver.zonesTarifaires).toHaveLength(1);
    expect(driver.zonesTarifaires[0].supplementUSD).toBe(50);
  });

  it("le verrou de palier s'applique AUSSI à la publication", async () => {
    const owner = await createUser({ role: "partenaire", sellerType: "particulier" });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-10-01T00:00:00Z"));
    const res = await publier(owner, { miseADisposition: OFFRE });
    vi.useRealTimers();
    expect(res.statusCode).toBe(403);
    expect(res.body.feature).toBe("miseADisposition");
  });
});
