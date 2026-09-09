import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import Subscription from "../models/Subscription.js";
import Notification from "../models/Notification.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Aucune passerelle de paiement n'est branchée en production. Tant que
// PAYMENTS_ENABLED n'est pas explicitement à "true", le serveur doit REFUSER
// toute action payante — un bouton grisé n'est pas un contrôle d'accès, l'appel
// reste atteignable directement.
//
// Les contrôleurs lisent le drapeau à l'import : on recharge donc le module
// avec la variable d'environnement voulue, plutôt que de la changer à chaud
// (elle serait déjà figée dans la constante).
const chargerControleur = async (valeur) => {
  process.env.PAYMENTS_ENABLED = valeur;
  // resetModules() vide le cache de modules : le contrôleur ET
  // config/featureFlags.js sont réévalués, donc la constante est recalculée
  // avec la variable d'environnement qu'on vient de poser. Un import avec
  // query dynamique ne passe pas la transformation de Vite.
  vi.resetModules();
  return import("../controllers/subscriptionController.js");
};

describe("Paiements fermés — le serveur refuse, il ne se fie pas à l'interface", () => {
  const initial = process.env.PAYMENTS_ENABLED;
  beforeEach(() => { process.env.PAYMENTS_ENABLED = "false"; });
  afterEach(() => { process.env.PAYMENTS_ENABLED = initial; });

  it("refuse un moyen de paiement qui encaisserait réellement", async () => {
    const { activatePlan } = await chargerControleur("false");
    const partenaire = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: partenaire, body: { planTier: "business", paymentMethod: "card" } });

    await activatePlan(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe("PAYMENTS_DISABLED");
    // Le message doit indiquer la marche à suivre, pas seulement l'indisponibilité.
    expect(res.body.message).toMatch(/support/i);
  });

  it("ACCEPTE une demande au support et la signale aux administrateurs", async () => {
    // Le point essentiel : demander un plan ne prend pas d'argent. Refuser
    // cette demande fermait la seule voie ouverte au partenaire — celle que
    // l'interface lui annonce.
    const { activatePlan } = await chargerControleur("false");
    const [partenaire, admin] = await Promise.all([
      createUser({ role: "partenaire" }),
      createUser({ role: "admin" }),
    ]);
    const { req, res } = mockReqRes({ user: partenaire, body: { planTier: "business" } });

    await activatePlan(req, res);

    expect(res.statusCode).toBe(202);
    const sub = await Subscription.findOne({ vendor: partenaire._id }).lean();
    expect(sub.paymentHistory.at(-1).status, "jamais activé automatiquement").toBe("pending");
    expect(sub.paymentHistory.at(-1).method).toBe("support");
    expect(sub.plan, "le plan ne devient actif qu'après confirmation admin").toBe("free");

    // Sans notification, la demande dormirait dans un onglet que personne n'ouvre.
    const notif = await Notification.findOne({ user: admin._id }).lean();
    expect(notif, "l'administrateur doit être prévenu").toBeTruthy();
    expect(notif.message).toMatch(/business/i);
  });

  it("refuse une mise en avant payée par un moyen encaissant", async () => {
    const { purchaseBoost } = await chargerControleur("false");
    const partenaire = await createUser({ role: "partenaire" });
    const vehicule = await createVehicleDoc({ owner: partenaire._id });
    const { req, res } = mockReqRes({
      user: partenaire,
      body: { vehicleId: String(vehicule._id), tier: "30d", paymentMethod: "card" },
    });

    await purchaseBoost(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe("PAYMENTS_DISABLED");
  });

  it("ACCEPTE une demande de mise en avant au support", async () => {
    const { purchaseBoost } = await chargerControleur("false");
    const partenaire = await createUser({ role: "partenaire" });
    const vehicule = await createVehicleDoc({ owner: partenaire._id });
    const { req, res } = mockReqRes({ user: partenaire, body: { vehicleId: String(vehicule._id), tier: "30d" } });

    await purchaseBoost(req, res);

    expect(res.statusCode).toBe(202);
    const sub = await Subscription.findOne({ vendor: partenaire._id }).lean();
    expect(sub.boosts.at(-1).isActive, "jamais activé sans confirmation admin").toBe(false);
  });

  it("laisse passer une fois les paiements ouverts", async () => {
    // Garde-fou : c'est bien le drapeau qui bloque, et non un autre refus
    // (rôle, validation) qui donnerait un test vert pour une mauvaise raison.
    const { activatePlan } = await chargerControleur("true");
    const partenaire = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: partenaire, body: { planTier: "business", paymentMethod: "card" } });

    await activatePlan(req, res);

    expect(res.statusCode).not.toBe(503);
  });

  it("une valeur autre que \"true\" garde les paiements fermés", async () => {
    // Défaut volontairement fermé : une variable absente, vide ou mal
    // orthographiée ne doit jamais ouvrir les encaissements.
    const { activatePlan } = await chargerControleur("1");
    const partenaire = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: partenaire, body: { planTier: "business", paymentMethod: "card" } });

    await activatePlan(req, res);

    expect(res.statusCode).toBe(503);
  });
});
