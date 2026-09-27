import { describe, it, expect } from "vitest";
import { exigeOutil, planEffectif } from "../services/planAccess.js";
import { fondateurActif } from "../services/fondateur.js";
import { FEATURE_MIN_PLAN, FIN_IMMUNITE_OUTILS, planOuvre } from "../constants/planFeatures.js";
import Subscription from "../models/Subscription.js";
import PartnerOnboarding from "../models/PartnerOnboarding.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Outils par secteur vendus par palier (2026-09-14). La règle dépend d'une
// date, qu'on injecte — mais depuis le 2026-09-27 « aujourd'hui » n'est PLUS
// immunisé : le verrou des outils est actif (FIN_IMMUNITE_OUTILS, décision de
// l'exploitant). L'immunité sur les QUOTAS d'annonces, elle, court toujours
// jusqu'au 10/09/2027 — deux promesses distinctes, deux constantes distinctes.
const AVANT  = () => new Date(FIN_IMMUNITE_OUTILS.getTime() - 1000);
const APRES  = () => new Date(FIN_IMMUNITE_OUTILS.getTime() + 24 * 3600 * 1000);
// Sans date injectée : la règle telle qu'elle s'applique en production.
const MAINTENANT = () => new Date();

const abonner = (user, plan) => Subscription.create({
  vendor: user._id, plan,
  planDetails: { startDate: new Date(), isActive: true, priceUSD: 19.99, endDate: new Date(Date.now() + 30 * 86400000) },
});

const passer = async (user, feature, maintenant) => {
  const { req, res } = mockReqRes({ user });
  let suivant = false;
  await exigeOutil(feature, { maintenant })(req, res, () => { suivant = true; });
  return { suivant, res };
};

const OUTILS = ["tarifsSaisonniers", "promotions", "journalVehicule", "importFlotte", "showroom", "crmLeadsDevis", "incotermsMultiples"];

describe("Outils par secteur — verrouillage par plan", () => {
  it("chaque outil vendu sur la page Tarifs a une entrée dans la matrice, et un palier supérieur hérite", () => {
    for (const o of OUTILS) {
      expect(FEATURE_MIN_PLAN[o], `matrice sans "${o}"`).toBeTruthy();
      expect(planOuvre("exportateur", o)).toBe(true);
      expect(planOuvre(null, o)).toBe(false);
    }
    expect(planOuvre("individuel_plus", "tarifsSaisonniers")).toBe(true);
    expect(planOuvre("individuel_plus", "importFlotte")).toBe(false);
    expect(planOuvre("business", "importFlotte")).toBe(true);
  });

  it("pendant l'immunité de lancement (avant le 27/09/2026), tout partenaire passait", async () => {
    // Le mécanisme est conservé et reste testable : il documente ce qui a été
    // promis aux comptes ouverts avant la décision.
    const p = await createUser({ role: "partenaire" });
    expect(await planEffectif(p._id)).toBe("free");
    for (const o of OUTILS) expect((await passer(p, o, AVANT)).suivant).toBe(true);
  });

  it("AUJOURD'HUI, sans date injectée, un compte gratuit est refusé", async () => {
    // ⚠️ Le test qui compte. Tant que l'immunité couvrait les outils, toute
    // garde de palier était verte SANS RIEN VÉRIFIER — il fallait avancer
    // l'horloge pour la voir mordre. Ce n'est plus le cas : la règle de
    // production est celle-ci.
    const p = await createUser({ role: "partenaire" });
    for (const o of OUTILS) {
      const { suivant, res } = await passer(p, o, MAINTENANT);
      expect(suivant, `« ${o} » passe encore sans abonnement`).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe("PLAN_REQUIS");
    }
  });

  it("TOUTE entrée de la matrice est refusée au gratuit et ouverte à son palier", async () => {
    // ⚠️ La garde qui clôt la dette signalée le 2026-09-27 : sept outils
    // livrés entre le 24 et le 27/09 n'avaient aucun test de verrou, et ceux
    // qui en avaient passaient au vert sans rien vérifier tant que l'immunité
    // de lancement couvrait les outils.
    //
    // Elle parcourt la matrice ENTIÈRE plutôt qu'une liste recopiée : un outil
    // ajouté demain sans verrou fait rougir ce test, sans que personne ait à y
    // penser. C'est la différence entre une garde et un inventaire.
    const features = Object.keys(FEATURE_MIN_PLAN);
    expect(features.length).toBeGreaterThan(20); // plancher : si la matrice ne se lit plus, le test rougit

    const gratuit = await createUser({ role: "partenaire" });
    const refuses = [];
    for (const f of features) {
      const { suivant, res } = await passer(gratuit, f, MAINTENANT);
      if (suivant || res.statusCode !== 403) refuses.push(`${f} (palier requis : ${FEATURE_MIN_PLAN[f]})`);
    }
    expect(refuses, `outil(s) ouvert(s) à un compte gratuit :\n  ${refuses.join("\n  ")}`).toEqual([]);

    // Et chacun s'ouvre bien au palier annoncé — sans quoi le verrou serait
    // simplement un mur, et l'abonnement ne servirait à rien.
    for (const palier of ["individuel_plus", "business", "exportateur"]) {
      const abonne = await createUser({ role: "partenaire" });
      await abonner(abonne, palier);
      const attendus = features.filter((f) => planOuvre(palier, f));
      expect(attendus.length, `aucun outil au palier ${palier}`).toBeGreaterThan(0);
      for (const f of attendus) {
        expect((await passer(abonne, f, MAINTENANT)).suivant, `« ${f} » fermé au palier ${palier}`).toBe(true);
      }
    }
  });

  it("AUJOURD'HUI, le palier souscrit ouvre l'outil", async () => {
    const p = await createUser({ role: "partenaire" });
    await abonner(p, "business");
    expect((await passer(p, "importFlotte", MAINTENANT)).suivant).toBe(true);
    expect((await passer(p, "promotions", MAINTENANT)).suivant).toBe(true);
    // Un outil au-dessus du palier reste fermé.
    expect((await passer(p, "accesApi", MAINTENANT)).suivant).toBe(false);
  });

  it("après l'immunité, un compte gratuit est refusé avec PLAN_REQUIS et le nom du palier commercial", async () => {
    const p = await createUser({ role: "partenaire" });
    const { suivant, res } = await passer(p, "importFlotte", APRES);
    expect(suivant).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("PLAN_REQUIS");
    expect(res.body.feature).toBe("importFlotte");
    expect(res.body.message).toMatch(/plan Business/);
    // Les libellés de refus suivent les noms commerciaux, pas les identifiants.
    const essentiel = await passer(p, "promotions", APRES);
    expect(essentiel.res.body.message).toMatch(/plan Essentiel/);
  });

  it("après l'immunité, le plan effectif ouvre l'outil ; un abonnement expiré ne compte pas", async () => {
    const business = await createUser({ role: "partenaire" });
    await abonner(business, "business");
    expect((await passer(business, "importFlotte", APRES)).suivant).toBe(true);
    expect((await passer(business, "promotions", APRES)).suivant).toBe(true);

    const expire = await createUser({ role: "partenaire" });
    await Subscription.create({ vendor: expire._id, plan: "business", planDetails: { startDate: new Date(), isActive: true, priceUSD: 19.99, endDate: new Date(Date.now() - 86400000) } });
    expect((await passer(expire, "importFlotte", APRES)).suivant).toBe(false);
  });

  it("un Partenaire Fondateur en cours garde tous ses outils ; un dossier non signé ou expiré ne compte pas", async () => {
    const fondateur = await createUser({ role: "partenaire" });
    await PartnerOnboarding.create({ userId: fondateur._id, isFoundingPartner: true, legalEntityType: "entreprise", commissions: { lockedAt: new Date() } });
    expect(await fondateurActif(fondateur._id)).toBe(true);
    for (const o of OUTILS) expect((await passer(fondateur, o, APRES)).suivant).toBe(true);

    const nonSigne = await createUser({ role: "partenaire" });
    await PartnerOnboarding.create({ userId: nonSigne._id, isFoundingPartner: true, legalEntityType: "entreprise" });
    expect((await passer(nonSigne, "showroom", APRES)).suivant).toBe(false);
  });

  it("un administrateur passe toujours, et un membre d'équipe hérite du plan du titulaire", async () => {
    const admin = await createUser({ role: "admin" });
    expect((await passer(admin, "crmLeadsDevis", APRES)).suivant).toBe(true);

    const titulaire = await createUser({ role: "partenaire" });
    await abonner(titulaire, "business");
    const agent = await createUser({ role: "partenaire", teamOf: titulaire._id, teamRole: "gestionnaire" });
    expect((await passer(agent, "crmLeadsDevis", APRES)).suivant).toBe(true);
  });
});

// ── Prix par Incoterm (2026-09-26) ─────────────────────────────────────────
//
// Le secteur Export était le seul à ne RIEN verrouiller : sept outils vendus,
// zéro garde. Le premier posé est le plus concret — plusieurs prix pour un
// même véhicule, un par Incoterm (FOB, CIF, CFR…).
//
// Le refus est explicite, pas un filtrage silencieux : un partenaire qui a
// saisi trois variantes doit savoir qu'elles n'ont pas été retenues, sinon il
// croit vendre en CIF pendant que l'acheteur voit du FOB.
describe("Prix par Incoterm — verrou du secteur Export", () => {
  it("le palier gratuit garde un prix et un Incoterm", () => {
    expect(planOuvre("free", "incotermsMultiples")).toBe(false);
    expect(planOuvre("individuel_plus", "incotermsMultiples")).toBe(true);
    expect(planOuvre("business", "incotermsMultiples")).toBe(true);
  });

  it("après l'immunité, un partenaire gratuit est refusé et un abonné passe", async () => {
    const gratuit = await createUser({ role: "partenaire" });
    const refus = await passer(gratuit, "incotermsMultiples", APRES);
    expect(refus.suivant).toBe(false);
    expect(refus.res.statusCode).toBe(403);
    expect(refus.res.body.code).toBe("PLAN_REQUIS");
    // Le message doit nommer le palier qui débloque, sinon le partenaire
    // ignore quoi faire de l'information.
    expect(refus.res.body.message).toMatch(/Essentiel/);

    const abonne = await createUser({ role: "partenaire" });
    await abonner(abonne, "individuel_plus");
    expect((await passer(abonne, "incotermsMultiples", APRES)).suivant).toBe(true);
  });
});
