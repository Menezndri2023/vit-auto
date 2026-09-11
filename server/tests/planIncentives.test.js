import { describe, it, expect } from "vitest";
import { adminGrantTrial, adminApprovePlanPayment } from "../controllers/subscriptionController.js";
import { accorderEssai, recompenserParrain, prolonger, DUREE_ESSAI_JOURS } from "../services/subscriptionRewards.js";
import { rapportDu, composerMessage, envoyerRapportsMensuels } from "../utils/monthlyPartnerReport.js";
import { listOpenRequests, declareInterest, AVANCE_ABONNE_MS } from "../controllers/partnerRequestsController.js";
import Subscription from "../models/Subscription.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";
import ImportExportRequest from "../models/ImportExportRequest.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const JOUR = 24 * 60 * 60 * 1000;

const abonner = (user, plan, jours = 30) => Subscription.create({
  vendor: user._id, plan,
  planDetails: { startDate: new Date(), endDate: new Date(Date.now() + jours * JOUR), isActive: true, priceUSD: 19.99 },
});

const admin = () => createUser({ role: "admin" });

// ═══════════════════════════════════════════════════════════════════════════
describe("Essai gratuit accordé par le support", () => {
  it("ouvre un plan complet, gratuit, marqué comme essai", async () => {
    const p = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: await admin(), params: { vendorId: String(p._id) }, body: { planTier: "business" } });
    await adminGrantTrial(req, res);

    expect(res.statusCode).toBe(200);
    const sub = await Subscription.findOne({ vendor: p._id }).lean();
    expect(sub.plan).toBe("business");
    expect(sub.planDetails.isActive).toBe(true);
    // Gratuit ET signalé comme tel : laisser croire à un abonnement payé
    // rendrait l'expiration incompréhensible.
    expect(sub.planDetails.priceUSD).toBe(0);
    expect(sub.planDetails.isTrial).toBe(true);
    const duree = Math.round((new Date(sub.planDetails.endDate) - new Date(sub.planDetails.startDate)) / JOUR);
    expect(duree).toBe(DUREE_ESSAI_JOURS);
  });

  it("propage le palier sur les annonces, pour que le classement en tienne compte", async () => {
    // Sans cette propagation, le partenaire aurait un plan actif et des annonces
    // qui continueraient de sortir en dernier : l'essai ne démontrerait rien.
    const p = await createUser({ role: "partenaire" });
    const v = await createVehicleDoc({ owner: p._id });
    const { req, res } = mockReqRes({ user: await admin(), params: { vendorId: String(p._id) }, body: { planTier: "exportateur" } });
    await adminGrantTrial(req, res);
    const apres = await Vehicle.findById(v._id).lean();
    expect(apres.ownerPlanRank).toBe(3);
    expect(new Date(apres.ownerPlanUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it("un seul essai par compte, pour toujours", async () => {
    const p = await createUser({ role: "partenaire" });
    expect((await accorderEssai(p._id, "business")).ok).toBe(true);
    // Même après expiration : sinon, enchaîner les essais serait gratuit à vie.
    await Subscription.updateOne({ vendor: p._id }, {
      $set: { "planDetails.isActive": false, "planDetails.endDate": new Date(Date.now() - JOUR) },
    });
    const second = await accorderEssai(p._id, "business");
    expect(second.ok).toBe(false);
    expect(second.code).toBe("ESSAI_DEJA_UTILISE");
  });

  it("refuse d'écraser un abonnement payant en cours", async () => {
    // Remplacer un plan payé par un essai gratuit ferait perdre au partenaire
    // ce qu'il a déjà réglé.
    const p = await createUser({ role: "partenaire" });
    await abonner(p, "exportateur");
    const r = await accorderEssai(p._id, "business");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("PLAN_DEJA_ACTIF");
    expect((await Subscription.findOne({ vendor: p._id }).lean()).plan).toBe("exportateur");
  });

  it("refuse un palier inconnu, un compte inexistant ou désactivé", async () => {
    const a = await admin();
    const p = await createUser({ role: "partenaire", isActive: false });

    const mauvaisPalier = mockReqRes({ user: a, params: { vendorId: String(p._id) }, body: { planTier: "platine" } });
    await adminGrantTrial(mauvaisPalier.req, mauvaisPalier.res);
    expect(mauvaisPalier.res.statusCode).toBe(400);

    const desactive = mockReqRes({ user: a, params: { vendorId: String(p._id) }, body: { planTier: "business" } });
    await adminGrantTrial(desactive.req, desactive.res);
    expect(desactive.res.statusCode).toBe(409);

    const inconnu = mockReqRes({ user: a, params: { vendorId: "000000000000000000000009" }, body: { planTier: "business" } });
    await adminGrantTrial(inconnu.req, inconnu.res);
    expect(inconnu.res.statusCode).toBe(404);
  });

  it("prévient le partenaire que son essai est ouvert", async () => {
    const p = await createUser({ role: "partenaire" });
    await accorderEssai(p._id, "business");
    const notif = await Notification.findOne({ user: p._id }).lean();
    expect(notif.titre).toMatch(/essai/i);
    expect(notif.message).not.toMatch(/undefined/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Prolongation de date", () => {
  it("part de l'échéance si elle court encore, de maintenant si elle est passée", async () => {
    // Le piège des deux sens : partir toujours d'aujourd'hui volerait trois
    // semaines à un abonnement en cours ; partir toujours de l'échéance
    // donnerait des mois déjà écoulés à un abonnement expiré depuis un an.
    const dansTroisSemaines = new Date(Date.now() + 21 * JOUR);
    const prolonge = prolonger(dansTroisSemaines, 1);
    expect(prolonge.getTime()).toBeGreaterThan(dansTroisSemaines.getTime());

    const ilYaUnAn = new Date(Date.now() - 365 * JOUR);
    const repart = prolonger(ilYaUnAn, 1);
    expect(repart.getTime()).toBeGreaterThan(Date.now());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Parrainage partenaire", () => {
  const filleulDe = async (parrain) => createUser({ role: "partenaire", referredBy: parrain._id });

  it("prolonge immédiatement un parrain dont l'abonnement court", async () => {
    const parrain = await createUser({ role: "partenaire" });
    const sub = await abonner(parrain, "business");
    const avant = new Date(sub.planDetails.endDate).getTime();

    await recompenserParrain((await filleulDe(parrain))._id);

    const apres = await Subscription.findOne({ vendor: parrain._id }).lean();
    expect(new Date(apres.planDetails.endDate).getTime()).toBeGreaterThan(avant);
    expect(apres.referralCreditMonths).toBe(0);
  });

  it("met la récompense en réserve si le parrain n'a pas d'abonnement actif", async () => {
    // Perdre la récompense parce qu'on n'était pas abonné ce jour-là serait
    // exactement ce qui décourage de parrainer.
    const parrain = await createUser({ role: "partenaire" });
    await recompenserParrain((await filleulDe(parrain))._id);
    const sub = await Subscription.findOne({ vendor: parrain._id }).lean();
    expect(sub.referralCreditMonths).toBe(1);
  });

  it("un même filleul ne rapporte jamais deux fois", async () => {
    const parrain = await createUser({ role: "partenaire" });
    const filleul = await filleulDe(parrain);
    await recompenserParrain(filleul._id);
    await recompenserParrain(filleul._id);
    await recompenserParrain(filleul._id);
    expect((await Subscription.findOne({ vendor: parrain._id }).lean()).referralCreditMonths).toBe(1);
  });

  it("deux filleuls distincts rapportent deux fois", async () => {
    const parrain = await createUser({ role: "partenaire" });
    await recompenserParrain((await filleulDe(parrain))._id);
    await recompenserParrain((await filleulDe(parrain))._id);
    expect((await Subscription.findOne({ vendor: parrain._id }).lean()).referralCreditMonths).toBe(2);
  });

  it("un compte qui se parraine lui-même ne gagne rien", async () => {
    const u = await createUser({ role: "partenaire" });
    await User.updateOne({ _id: u._id }, { $set: { referredBy: u._id } });
    await recompenserParrain(u._id);
    expect(await Subscription.findOne({ vendor: u._id }).lean()).toBeNull();
  });

  it("un filleul sans parrain ne déclenche rien", async () => {
    const u = await createUser({ role: "partenaire" });
    expect(await recompenserParrain(u._id)).toBeNull();
  });

  it("les mois en réserve sont consommés à l'activation, et le parrain récompensé", async () => {
    // Chaîne complète : le parrain a un crédit en réserve, son filleul se voit
    // confirmer un plan par l'administration.
    const parrain = await createUser({ role: "partenaire" });
    const filleul = await createUser({ role: "partenaire", referredBy: parrain._id });

    const subFilleul = await Subscription.create({
      vendor: filleul._id, plan: "free", referralCreditMonths: 2,
      paymentHistory: [{ planTier: "business", amount: 19.99, method: "support", status: "pending" }],
    });

    const { req, res } = mockReqRes({
      user: await admin(),
      params: { subscriptionId: String(subFilleul._id), paymentId: String(subFilleul.paymentHistory[0]._id) },
    });
    await adminApprovePlanPayment(req, res);
    expect(res.statusCode).toBe(200);

    const apres = await Subscription.findById(subFilleul._id).lean();
    expect(apres.referralCreditMonths).toBe(0);
    // Un mois d'abonnement + deux mois offerts ≈ trois mois.
    const mois = (new Date(apres.planDetails.endDate) - new Date(apres.planDetails.startDate)) / JOUR;
    expect(mois).toBeGreaterThan(80);

    const subParrain = await Subscription.findOne({ vendor: parrain._id }).lean();
    expect(subParrain.referralCreditMonths).toBe(1);
  });

  it("l'activation ne promet plus de commission réduite", async () => {
    // La faveur commerciale vient de l'offre Partenaire Fondateur, pas de
    // l'abonnement (décision du 2026-09-09). Promettre une réduction que le
    // moteur n'applique pas produirait une réclamation à la première facture.
    const p = await createUser({ role: "partenaire" });
    const sub = await Subscription.create({
      vendor: p._id, plan: "free",
      paymentHistory: [{ planTier: "business", amount: 19.99, method: "support", status: "pending" }],
    });
    const { req, res } = mockReqRes({
      user: await admin(),
      params: { subscriptionId: String(sub._id), paymentId: String(sub.paymentHistory[0]._id) },
    });
    await adminApprovePlanPayment(req, res);
    const notif = await Notification.findOne({ user: p._id, titre: /plan est actif/i }).lean();
    expect(notif).toBeTruthy();
    expect(notif.message).not.toMatch(/commission réduite/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Les places réservées de la vitrine sont désormais une source parmi d'autres
// du moteur de mise en avant — voir tests/spotlightEngine.test.js, qui couvre
// épinglage admin, boosts achetés, quotas d'abonnement, mérite et rotation.

// ═══════════════════════════════════════════════════════════════════════════
describe("Demandes clients — avance accordée aux abonnés", () => {
  const deposer = (ageMs = 0, extra = {}) => ImportExportRequest.create({
    firstName: "Awa", lastName: "Koné", email: "awa@exemple.test", phone: "+2250700000000",
    sourceCountry: "Japon", destCountry: "Côte d'Ivoire", vehicleMake: "Toyota", vehicleModel: "Hilux",
    budget: 15000, createdAt: new Date(Date.now() - ageMs), ...extra,
  });

  const lister = async (user) => {
    const { req, res } = mockReqRes({ user });
    await listOpenRequests(req, res);
    return res;
  };

  it("un abonné Business voit une demande déposée à l'instant, un compte gratuit non", async () => {
    await deposer(0);
    const gratuit = await createUser({ role: "partenaire" });
    const abonne  = await createUser({ role: "partenaire" });
    await abonner(abonne, "business");

    const vueAbonne = await lister(abonne);
    expect(vueAbonne.body.demandes).toHaveLength(1);
    expect(vueAbonne.body.prioritaire).toBe(true);

    const vueGratuit = await lister(gratuit);
    expect(vueGratuit.body.demandes).toHaveLength(0);
    // Le nombre de demandes encore réservées rend l'avantage concret.
    expect(vueGratuit.body.enAttenteDeliberation).toBe(1);
  });

  it("passé le délai, la demande devient visible de tous — sans aucune tâche planifiée", async () => {
    await deposer(AVANCE_ABONNE_MS + 60000);
    const gratuit = await createUser({ role: "partenaire" });
    expect((await lister(gratuit)).body.demandes).toHaveLength(1);
  });

  it("n'expose ni e-mail, ni téléphone, ni nom de famille du demandeur", async () => {
    // Sans quoi les demandes deviendraient un fichier de prospection, et la
    // politique de contact centralisé du site n'aurait plus aucun sens.
    await deposer(AVANCE_ABONNE_MS + 60000);
    const p = await createUser({ role: "partenaire" });
    const brut = JSON.stringify((await lister(p)).body);
    expect(brut).not.toContain("awa@exemple.test");
    expect(brut).not.toContain("+2250700000000");
    expect(brut).not.toContain("Koné");
    expect(brut).toContain("Awa"); // le prénom suffit à personnaliser un devis
  });

  it("ignore les demandes déjà traitées", async () => {
    await deposer(AVANCE_ABONNE_MS + 60000, { status: "approved" });
    await deposer(AVANCE_ABONNE_MS + 60000, { status: "rejected" });
    const p = await createUser({ role: "partenaire" });
    expect((await lister(p)).body.demandes).toHaveLength(0);
  });

  it("l'avance vaut aussi à l'ÉCRITURE : un non-abonné ne peut pas se positionner en devinant l'identifiant", async () => {
    const d = await deposer(0);
    const gratuit = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: gratuit, params: { id: String(d._id) }, body: { note: "Je l'ai en stock" } });
    await declareInterest(req, res);
    expect(res.statusCode).toBe(403);
    expect((await ImportExportRequest.findById(d._id).lean()).interestedPartners).toHaveLength(0);
  });

  it("enregistre l'intérêt d'un abonné et prévient l'administration", async () => {
    const d = await deposer(0);
    const admin1 = await admin();
    const p = await createUser({ role: "partenaire" });
    await abonner(p, "business");

    const { req, res } = mockReqRes({ user: p, params: { id: String(d._id) }, body: { note: "Disponible sous 3 semaines" } });
    await declareInterest(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.demande.jaiRepondu).toBe(true);

    const enBase = await ImportExportRequest.findById(d._id).lean();
    expect(enBase.interestedPartners).toHaveLength(1);
    expect(enBase.interestedPartners[0].note).toBe("Disponible sous 3 semaines");
    expect(enBase.interestedPartners[0].plan).toBe("business");

    const notif = await Notification.findOne({ user: admin1._id, type: "ie_request" }).lean();
    expect(notif).toBeTruthy();
    expect(notif.message).not.toMatch(/undefined/);
  });

  it("refuse un second positionnement du même partenaire", async () => {
    const d = await deposer(AVANCE_ABONNE_MS + 60000);
    const p = await createUser({ role: "partenaire" });
    const premier = mockReqRes({ user: p, params: { id: String(d._id) }, body: {} });
    await declareInterest(premier.req, premier.res);
    expect(premier.res.statusCode).toBe(201);

    const second = mockReqRes({ user: p, params: { id: String(d._id) }, body: {} });
    await declareInterest(second.req, second.res);
    expect(second.res.statusCode).toBe(409);
    expect((await ImportExportRequest.findById(d._id).lean()).interestedPartners).toHaveLength(1);
  });

  it("plafonne le nombre de candidats", async () => {
    const d = await deposer(AVANCE_ABONNE_MS + 60000);
    for (let i = 0; i < 5; i++) {
      const p = await createUser({ role: "partenaire" });
      const { req, res } = mockReqRes({ user: p, params: { id: String(d._id) }, body: {} });
      await declareInterest(req, res);
      expect(res.statusCode).toBe(201);
    }
    const detrop = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: detrop, params: { id: String(d._id) }, body: {} });
    await declareInterest(req, res);
    expect(res.statusCode).toBe(409);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Rapport mensuel de performance", () => {
  it("n'est dû qu'une fois par mois civil", async () => {
    const maintenant = new Date(2026, 8, 15);
    expect(rapportDu(null, maintenant)).toBe(true);
    expect(rapportDu(new Date(2026, 7, 31), maintenant)).toBe(true);  // mois précédent
    expect(rapportDu(new Date(2026, 8, 1), maintenant)).toBe(false);  // déjà envoyé ce mois
    expect(rapportDu(new Date(2026, 8, 14), maintenant)).toBe(false);
  });

  it("ne signale un point à corriger que s'il y en a un", async () => {
    // Un rapport qui accuse tous les mois finit par n'être plus ouvert.
    const propre = composerMessage({ annonces: 3, vuesTotales: 120, reservations: 4, favoris: 7, aCorriger: 0, jamaisVues: 0 }, "août");
    expect(propre).not.toMatch(/mérite|aucune vue/);
    const sale = composerMessage({ annonces: 3, vuesTotales: 120, reservations: 4, favoris: 7, aCorriger: 2, jamaisVues: 1 }, "août");
    expect(sale).toMatch(/2 annonces méritent/);
    expect(sale).toMatch(/1 annonce n'a reçu aucune vue/);
    // Sans annonce, on invite à publier plutôt que d'annoncer des zéros.
    expect(composerMessage(null, "août")).toMatch(/Publiez une annonce/);
  });

  it("envoie aux abonnés Business et au-delà, une seule fois, et jamais aux autres", async () => {
    const business = await createUser({ role: "partenaire" });
    await abonner(business, "business");
    await createVehicleDoc({ owner: business._id, title: "Hilux" });

    const petit = await createUser({ role: "partenaire" });
    await abonner(petit, "individuel_plus"); // sous le seuil du rapport
    await createVehicleDoc({ owner: petit._id });

    const gratuit = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: gratuit._id });

    expect(await envoyerRapportsMensuels()).toBe(1);
    expect(await Notification.countDocuments({ user: business._id, titre: /bilan/i })).toBe(1);
    expect(await Notification.countDocuments({ user: petit._id,    titre: /bilan/i })).toBe(0);
    expect(await Notification.countDocuments({ user: gratuit._id,  titre: /bilan/i })).toBe(0);

    // Un second passage le même mois — redémarrage du serveur, par exemple —
    // ne doit pas renvoyer le rapport.
    expect(await envoyerRapportsMensuels()).toBe(0);
    expect(await Notification.countDocuments({ user: business._id, titre: /bilan/i })).toBe(1);
  });

  it("saute un compte désactivé et un abonnement échu", async () => {
    const desactive = await createUser({ role: "partenaire", isActive: false });
    await abonner(desactive, "business");
    const echu = await createUser({ role: "partenaire" });
    await abonner(echu, "business", -1);
    expect(await envoyerRapportsMensuels()).toBe(0);
  });
});
