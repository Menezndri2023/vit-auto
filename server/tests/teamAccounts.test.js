import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { listMembers, createMember, updateMember, removeMember } from "../controllers/teamController.js";
import { equipeCommeProprietaire } from "../middleware/team.js";
import { exigeFonctionnalite } from "../services/planAccess.js";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const abonner = (user, plan) => Subscription.create({
  vendor: user._id, plan,
  planDetails: { startDate: new Date(), endDate: new Date(Date.now() + 30 * 86400000), isActive: true, priceUSD: 19.99 },
});

const titulaire = async (plan = "business") => {
  const u = await createUser({ role: "partenaire", country: "CI" });
  if (plan) await abonner(u, plan);
  return u;
};

const inviter = async (patron, body = {}) => {
  const { req, res } = mockReqRes({
    user: patron,
    body: { firstName: "Agent", lastName: "Comptoir", email: `agent${Math.random().toString(36).slice(2)}@exemple.test`, ...body },
  });
  req.planEffectif = "business";
  await createMember(req, res);
  return res;
};

// Exécute un middleware et rapporte s'il a laissé passer.
const passer = async (mw, req, res) => {
  let suivant = false;
  await mw(req, res, () => { suivant = true; });
  return suivant;
};

describe("Comptes d'équipe — le palier qui les ouvre", () => {
  it("refuse un titulaire sans abonnement Business", async () => {
    const u = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: u });
    expect(await passer(exigeFonctionnalite("multiUtilisateurs"), req, res)).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/Business/);
  });

  it("laisse passer un abonné Business et lui pose son palier effectif", async () => {
    const u = await titulaire("business");
    const { req, res } = mockReqRes({ user: u });
    expect(await passer(exigeFonctionnalite("multiUtilisateurs"), req, res)).toBe(true);
    expect(req.planEffectif).toBe("business");
  });
});

describe("Comptes d'équipe — création et sièges", () => {
  it("crée un accès et n'affiche le mot de passe provisoire qu'une seule fois", async () => {
    const patron = await titulaire();
    const res = await inviter(patron);
    expect(res.statusCode).toBe(201);
    expect(res.body.motDePasseProvisoire).toBeTruthy();

    const membre = await User.findById(res.body.membre._id).lean();
    // Jamais stocké en clair : ni le support ni l'administrateur ne doivent
    // pouvoir le relire.
    expect(membre.password).not.toBe(res.body.motDePasseProvisoire);
    expect(membre.password.startsWith("$2")).toBe(true); // hash bcrypt
    expect(String(membre.teamOf)).toBe(String(patron._id));
    expect(membre.teamRole).toBe("gestionnaire");
    expect(membre.country).toBe("CI"); // hérité du titulaire

    const liste = mockReqRes({ user: patron });
    liste.req.planEffectif = "business";
    await listMembers(liste.req, liste.res);
    expect(liste.res.body.membres).toHaveLength(1);
    expect(liste.res.body.membres[0].motDePasseProvisoire).toBeUndefined();
  });

  it("compte le titulaire dans les sièges et bloque au-delà", async () => {
    const patron = await titulaire();
    // Business = 3 sièges, titulaire compris → 2 agents.
    expect((await inviter(patron)).statusCode).toBe(201);
    expect((await inviter(patron)).statusCode).toBe(201);
    const trop = await inviter(patron);
    expect(trop.statusCode).toBe(409);
    expect(trop.body.code).toBe("SIEGES_EPUISES");

    const liste = mockReqRes({ user: patron });
    liste.req.planEffectif = "business";
    await listMembers(liste.req, liste.res);
    expect(liste.res.body.sieges).toMatchObject({ total: 3, utilises: 3, restants: 0 });
  });

  it("ne s'approprie JAMAIS un compte existant sur la seule foi d'une adresse", async () => {
    // Rattacher d'office reviendrait à prendre la main sur le compte d'un tiers,
    // avec ses réservations et ses données personnelles.
    const patron = await titulaire();
    const tiers = await createUser({ role: "client", email: "deja@exemple.test" });
    const res = await inviter(patron, { email: "deja@exemple.test" });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("COMPTE_EXISTANT");
    expect((await User.findById(tiers._id).lean()).teamOf).toBeNull();
  });

  it("exige un nom et un moyen de contact", async () => {
    const patron = await titulaire();
    expect((await inviter(patron, { firstName: " " })).statusCode).toBe(400);
    expect((await inviter(patron, { email: null, phone: null })).statusCode).toBe(400);
    expect((await inviter(patron, { teamRole: "patron" })).statusCode).toBe(400);
  });

  it("désactiver un accès coupe les sessions déjà ouvertes", async () => {
    // Sans incrémenter tokenVersion, le jeton de l'agent parti resterait valide
    // jusqu'à sept jours.
    const patron = await titulaire();
    const { body } = await inviter(patron);
    const avant = (await User.findById(body.membre._id).lean()).tokenVersion || 0;

    const { req, res } = mockReqRes({ user: patron, params: { id: String(body.membre._id) }, body: { isActive: false } });
    req.planEffectif = "business";
    await updateMember(req, res);
    expect((await User.findById(body.membre._id).lean()).tokenVersion).toBe(avant + 1);
  });

  it("retirer un membre le détache sans détruire son compte", async () => {
    const patron = await titulaire();
    const { body } = await inviter(patron);
    const { req, res } = mockReqRes({ user: patron, params: { id: String(body.membre._id) } });
    req.planEffectif = "business";
    await removeMember(req, res);

    const membre = await User.findById(body.membre._id).lean();
    expect(membre).toBeTruthy(); // le compte figure dans des historiques
    expect(membre.teamOf).toBeNull();
    expect(membre.isActive).toBe(false);
  });

  it("un titulaire ne peut pas toucher au membre d'une AUTRE équipe", async () => {
    const patronA = await titulaire();
    const patronB = await titulaire();
    const { body } = await inviter(patronA);

    const { req, res } = mockReqRes({ user: patronB, params: { id: String(body.membre._id) }, body: { isActive: false } });
    req.planEffectif = "business";
    await updateMember(req, res);
    // 404 et non 403 : confirmer l'existence renseignerait déjà l'attaquant.
    expect(res.statusCode).toBe(404);
    expect((await User.findById(body.membre._id).lean()).isActive).toBe(true);
  });
});

describe("Comptes d'équipe — délégation d'accès", () => {
  const membreDe = async (patron, teamRole = "gestionnaire") => {
    const { body } = await inviter(patron, { teamRole });
    return User.findById(body.membre._id);
  };

  it("un compte SANS équipe traverse le middleware sans rien changer", async () => {
    // C'est l'état de tous les comptes en production : le déploiement doit être
    // strictement neutre pour eux.
    const u = await createUser({ role: "partenaire" });
    const { req, res } = mockReqRes({ user: u });
    req.method = "POST";
    expect(await passer(equipeCommeProprietaire, req, res)).toBe(true);
    expect(String(req.user._id)).toBe(String(u._id));
    expect(req.membre).toBeUndefined();
  });

  it("un agent agit sur les annonces du titulaire, pas sur les siennes", async () => {
    const patron = await titulaire();
    const agent = await membreDe(patron);
    await createVehicleDoc({ owner: patron._id, title: "Flotte du patron" });

    const { req, res } = mockReqRes({ user: agent });
    req.method = "GET";
    expect(await passer(equipeCommeProprietaire, req, res)).toBe(true);
    // L'identité de PROPRIÉTÉ devient celle du titulaire...
    expect(String(req.user._id)).toBe(String(patron._id));
    // ...mais le membre réel reste connu, sans quoi on ne saurait plus qui agit.
    expect(String(req.membre._id)).toBe(String(agent._id));
  });

  it("un accès en consultation seule est bloqué sur toute écriture", async () => {
    const patron = await titulaire();
    const lecteur = await membreDe(patron, "lecture");

    const lecture = mockReqRes({ user: lecteur });
    lecture.req.method = "GET";
    expect(await passer(equipeCommeProprietaire, lecture.req, lecture.res)).toBe(true);

    for (const methode of ["POST", "PATCH", "PUT", "DELETE"]) {
      const { req, res } = mockReqRes({ user: lecteur });
      req.method = methode;
      expect(await passer(equipeCommeProprietaire, req, res), methode).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe("EQUIPE_LECTURE_SEULE");
    }
  });

  it("l'expiration de l'abonnement du titulaire ferme l'accès de son équipe", async () => {
    const patron = await titulaire();
    const agent = await membreDe(patron);
    await Subscription.updateOne({ vendor: patron._id }, { $set: { "planDetails.isActive": false } });

    const { req, res } = mockReqRes({ user: agent });
    req.method = "GET";
    expect(await passer(equipeCommeProprietaire, req, res)).toBe(false);
    expect(res.body.code).toBe("PLAN_REQUIS");
  });

  it("un titulaire désactivé ferme l'accès de son équipe", async () => {
    const patron = await titulaire();
    const agent = await membreDe(patron);
    await User.updateOne({ _id: patron._id }, { $set: { isActive: false } });

    const { req, res } = mockReqRes({ user: agent });
    req.method = "GET";
    expect(await passer(equipeCommeProprietaire, req, res)).toBe(false);
    expect(res.body.code).toBe("TITULAIRE_INACTIF");
  });
});

describe("Comptes d'équipe — périmètre de la délégation", () => {
  it("la délégation n'est montée QUE sur les annonces, les réservations et les demandes d'essai", async () => {
    // Ce test garde une frontière de SÉCURITÉ, pas une convention : montée sur
    // /api/auth ou /api/users, la délégation donnerait à un agent le droit de
    // changer le mot de passe de son employeur, ou de supprimer son compte.
    // Un futur ajout de `authenticateEtDeleguer` ailleurs doit être un acte
    // délibéré — et échouer ici jusqu'à ce qu'il le soit.
    const dossier = path.join(process.cwd(), "routes");
    const fichiers = fs.readdirSync(dossier).filter((f) => f.endsWith(".js"));
    const utilisateurs = fichiers.filter((f) =>
      fs.readFileSync(path.join(dossier, f), "utf8").includes("authenticateEtDeleguer")
    ).sort();
    // salesLeads.js (2026-09-12) : les demandes d'essai sont, comme les
    // réservations, des données du titulaire qu'un agent traite pour lui
    // (accepter, proposer un créneau, déclarer une vente) — jamais le compte.
    expect(utilisateurs).toEqual(["bookings.js", "salesLeads.js", "vehicles.js"]);
  });

  it("un membre d'équipe ne gère ni l'équipe ni les clés d'API", async () => {
    // Un agent ne recrute pas, et une clé d'API engage le compte du titulaire
    // bien après le départ de l'agent qui l'aurait créée.
    const dossier = path.join(process.cwd(), "routes");
    for (const f of ["team.js", "apiKeys.js"]) {
      const src = fs.readFileSync(path.join(dossier, f), "utf8");
      expect(src, f).toMatch(/teamOf/);
      expect(src, f).toMatch(/seulementTitulaire/);
    }
  });
});
