import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
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

  it("refuse l'activation d'un plan payant", async () => {
    const { activatePlan } = await chargerControleur("false");
    const partenaire = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: partenaire, body: { planTier: "business", paymentMethod: "card" } });

    await activatePlan(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe("PAYMENTS_DISABLED");
    // Le message doit indiquer la marche à suivre, pas seulement l'indisponibilité.
    expect(res.body.message).toMatch(/support/i);
  });

  it("refuse l'achat d'une mise en avant", async () => {
    const { purchaseBoost } = await chargerControleur("false");
    const partenaire = await createUser({ role: "partenaire" });
    const vehicule = await createVehicleDoc({ owner: partenaire._id });
    const { req, res } = mockReqRes({ user: partenaire, body: { vehicleId: String(vehicule._id), tier: "30d" } });

    await purchaseBoost(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe("PAYMENTS_DISABLED");
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
    const { req, res } = mockReqRes({ user: partenaire, body: { planTier: "business" } });

    await activatePlan(req, res);

    expect(res.statusCode).toBe(503);
  });
});
