import { describe, it, expect, beforeEach } from "vitest";
import ConditionsLiberation, { hashContenu } from "../models/ConditionsLiberation.js";
import AcceptationConditions from "../models/AcceptationConditions.js";
import { proposer, accepter, lireConditions } from "../controllers/litigeController.js";
import { transitionAutorisee, TRANSITIONS_PAIEMENT } from "../models/PaiementSecurise.js";
import { createUser, createIETransaction } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// CONDITIONS DE LIBÉRATION VERSIONNÉES + PAIEMENT SÉCURISÉ PRÉPARÉ (2026-10-31)
// ═══════════════════════════════════════════════════════════════════════════

const appel = async (fn, opts) => { const m = mockReqRes(opts); await fn(m.req, m.res); return m.res; };

describe("Conditions de libération versionnées", () => {
  let client, partner, admin, tx;
  beforeEach(async () => {
    // Index uniques construits en arrière-plan : on les attend (voir report.test.js).
    await Promise.all([ConditionsLiberation.init(), AcceptationConditions.init()]);
    client = await createUser({ role: "client" });
    partner = await createUser({ role: "partenaire", isFounder: true });
    admin = await createUser({ role: "admin" });
    tx = await createIETransaction({ client: client._id, partner: partner._id, status: "payment_pending", incoterm: "CIF",
      finalOffer: { totalAmount: 28300, currency: "USD", vehiclePrice: 25000 } });
  });
  const proposerPar = (user, body = {}) => appel(proposer, { user, params: { id: String(tx._id) }, body });
  const accepterPar = (user, body) => appel(accepter, { user, params: { id: String(tx._id) }, body });

  it("le montant, la devise, les parties et l'Incoterm viennent de la transaction, jamais de la requête", async () => {
    const r = await proposerPar(partner, { montant: 1, devise: "XOF", parties: { acheteur: partner._id }, conformite: "Conforme à l'annonce et au rapport d'inspection.", delaiReclamationJours: 7, livraison: { lieuNomme: "Port d'Abidjan" } });
    expect(r.statusCode).toBe(201);
    const c = r.body.conditions;
    expect(c).toMatchObject({ version: 1, circuit: "reglement_direct" });
    expect(c.contenu).toMatchObject({ montant: 28300, devise: "USD", livraison: { incoterm: "CIF", lieuNomme: "Port d'Abidjan" }, delaiReclamationJours: 7 });
    expect(String(c.contenu.parties.acheteur)).toBe(String(client._id));
    expect(c.contenu.roleVitAuto).toMatch(/ne reçoit, ne conserve, ne bloque ni ne libère aucun fonds/);
    expect(c.hash).toBe(hashContenu((await ConditionsLiberation.findById(c._id)).contenu));
  });

  it("acceptation par les deux parties, identifiée par partie, utilisateur, date, version et hash ; sans IP", async () => {
    const { hash } = (await proposerPar(partner)).body.conditions;
    expect((await accepterPar(admin, { version: 1, hash })).statusCode).toBe(403);
    expect((await accepterPar(client, { version: 1, hash: "faux" })).statusCode).toBe(409);
    expect((await accepterPar(client, { version: 2, hash })).statusCode).toBe(409);
    const a = await accepterPar(client, { version: 1, hash });
    expect(a.statusCode).toBe(201);
    expect(a.body.accepteeParLesDeux).toBe(false);
    expect((await accepterPar(client, { version: 1, hash })).statusCode).toBe(409);   // déjà acceptée
    const b = await accepterPar(partner, { version: 1, hash });
    expect(b.body.accepteeParLesDeux).toBe(true);
    const lignes = await AcceptationConditions.find({ "transaction.id": tx._id }).lean();
    expect(lignes.map((l) => l.partie).sort()).toEqual(["acheteur", "vendeur"]);
    for (const l of lignes) {
      expect(l).toMatchObject({ version: 1, hash });
      expect(l.utilisateur).toBeTruthy(); expect(l.le).toBeTruthy();
      expect(l).not.toHaveProperty("ip");
    }
  });

  it("modifier = nouvelle version à réaccepter ; la version acceptée reste intacte avec ses acceptations", async () => {
    const v1 = (await proposerPar(partner, { conformite: "Version 1" })).body.conditions;
    await accepterPar(client, { version: 1, hash: v1.hash });
    await accepterPar(partner, { version: 1, hash: v1.hash });
    const v2 = (await proposerPar(client, { conformite: "Version 2, plus exigeante" })).body.conditions;
    expect(v2.version).toBe(2);
    const etat = (await appel(lireConditions, { user: client, params: { id: String(tx._id) } })).body;
    expect(etat.courante.version).toBe(2);
    expect(etat.accepteeParLesDeux).toBe(false);                                     // v2 à réaccepter
    const ancienne = etat.versions.find((v) => v.version === 1);
    expect(ancienne.acceptations).toHaveLength(2);
    expect((await ConditionsLiberation.findOne({ "transaction.id": tx._id, version: 1 })).contenu.conformite).toBe("Version 1");
    expect((await accepterPar(client, { version: 1, hash: v1.hash })).statusCode).toBe(409); // plus en vigueur
  });

  it("immuable : aucune mise à jour possible, ni du document ni d'une acceptation", async () => {
    const v1 = (await proposerPar(partner)).body.conditions;
    await expect(ConditionsLiberation.updateOne({ _id: v1._id }, { $set: { "contenu.montant": 1 } })).rejects.toThrow(/immuables/);
    await expect(ConditionsLiberation.findOneAndUpdate({ _id: v1._id }, { $set: { version: 9 } })).rejects.toThrow(/immuables/);
    const doc = await ConditionsLiberation.findById(v1._id);
    doc.contenu.montant = 1;
    await expect(doc.save()).rejects.toThrow(/immuables/);
    await accepterPar(client, { version: 1, hash: v1.hash });
    await expect(AcceptationConditions.updateOne({ "transaction.id": tx._id }, { $set: { partie: "vendeur" } })).rejects.toThrow(/immuable/);
    expect((await ConditionsLiberation.findById(v1._id)).estIntegre()).toBe(true);
  });

  it("circuit séquestre refusé tant qu'aucun prestataire n'est validé ; tiers refusé ; offre requise", async () => {
    expect((await proposerPar(partner, { circuit: "sequestre_prestataire" })).body.code).toBe("SEQUESTRE_INDISPONIBLE");
    expect((await proposerPar(await createUser())).statusCode).toBe(403);
    const sansOffre = await createIETransaction({ client: client._id, partner: partner._id, status: "confirmed" });
    expect((await appel(proposer, { user: partner, params: { id: String(sansOffre._id) }, body: {} })).statusCode).toBe(409);
  });
});

describe("Paiement sécurisé (préparé, inactif) — transitions", () => {
  it("seul le prestataire établit fonds sécurisés, libération et remboursement", () => {
    expect(transitionAutorisee("pending_provider_confirmation", "funds_secured", "plateforme").ok).toBe(false);
    expect(transitionAutorisee("pending_provider_confirmation", "funds_secured", "prestataire").ok).toBe(true);
    expect(transitionAutorisee("release_pending", "released_to_seller", "plateforme").ok).toBe(false);
    expect(transitionAutorisee("release_pending", "released_to_seller", "prestataire").ok).toBe(true);
    expect(transitionAutorisee("refund_pending", "refunded", "plateforme").ok).toBe(false);
  });

  it("initier exige des conditions acceptées ; demander la libération exige l'absence de litige ouvert", () => {
    expect(transitionAutorisee("not_started", "payment_initiated", "acheteur").ok).toBe(false);
    expect(transitionAutorisee("not_started", "payment_initiated", "acheteur", { conditionsAcceptees: true }).ok).toBe(true);
    const r = transitionAutorisee("funds_secured", "release_pending", "plateforme", { litigeOuvert: true });
    expect(r.ok).toBe(false);
    expect(r.raison).not.toMatch(/bloqu/i);
    expect(transitionAutorisee("funds_secured", "release_pending", "plateforme").ok).toBe(true);
  });

  it("la livraison n'est pas un état de paiement : aucune transition n'en dépend, aucun saut vers la libération", () => {
    expect(Object.values(TRANSITIONS_PAIEMENT).some((t) => Object.keys(t).includes("delivered"))).toBe(false);
    expect(transitionAutorisee("funds_secured", "released_to_seller", "prestataire").ok).toBe(false);
  });
});
