import { describe, it, expect, beforeEach } from "vitest";
import * as I from "../controllers/incotermController.js";
import { recommanderIncoterms, validerConditions, libelleIncoterm } from "../services/incotermService.js";
import { INCOTERM_CODES } from "../constants/incoterms.js";
import IETransaction from "../models/IETransaction.js";
import Booking from "../models/Booking.js";
import SparePart from "../models/SparePart.js";
import { createUser, createIETransaction } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// Incoterms® 2020 sur les commandes Trade et Parts (exploitant, 2026-10-28)
// ═══════════════════════════════════════════════════════════════════════════

const appel = async (fn, { user, params = {}, body = {} }) => {
  const m = mockReqRes({ user, params, body });
  await fn(m.req, m.res);
  return m.res;
};

describe("Référentiel et validation", () => {
  it("prend en charge les onze règles Incoterms® 2020", () => {
    expect(INCOTERM_CODES.sort()).toEqual(["CFR", "CIF", "CIP", "CPT", "DAP", "DDP", "DPU", "EXW", "FAS", "FCA", "FOB"]);
    for (const regle of INCOTERM_CODES) {
      const { erreurs, valeurs } = validerConditions({ regle, lieuNomme: "Port de Casablanca" });
      expect(erreurs, regle).toEqual([]);
      expect(valeurs.version).toBe("2020");
    }
  });

  it("refuse une règle sans lieu nommé, et affiche « FOB [lieu], Incoterms® 2020 »", () => {
    expect(validerConditions({ regle: "FOB" }).erreurs).toContain("lieuNomme");
    expect(validerConditions({ regle: "XYZ", lieuNomme: "Tanger" }).erreurs).toContain("regle");
    expect(libelleIncoterm({ regle: "FOB", lieuNomme: "Port de Tanger Med", version: "2020" })).toBe("FOB Port de Tanger Med, Incoterms® 2020");
  });

  it("avertit quand une règle maritime est choisie pour un transport routier ou aérien", () => {
    expect(validerConditions({ regle: "FOB", lieuNomme: "Paris", modeTransport: "routier" }).avertissements[0]).toMatch(/réservée au transport maritime/);
    expect(validerConditions({ regle: "FCA", lieuNomme: "Paris", modeTransport: "routier" }).avertissements).toEqual([]);
  });
});

describe("Assistant de sélection", () => {
  const codes = (r, statut) => r.propositions.filter((p) => !statut || p.statut === statut).map((p) => p.code);

  it("FOB recommandé en maritime non conteneurisé quand l'acheteur organise le transport principal", () => {
    const r = recommanderIncoterms({ modeTransport: "maritime", conteneurise: false, organisateurTransport: "acheteur", formalitesExport: "vendeur" });
    expect(codes(r, "recommande")).toEqual(["FOB"]);
    expect(r.propositions.find((p) => p.code === "FOB").raison).toMatch(/à bord du navire désigné par l'acheteur/);
    expect(r.avertissementAide).toMatch(/ne remplace pas le conseil/);
  });

  it("conteneur remis au terminal : FCA recommandé, FOB seulement « à examiner »", () => {
    const r = recommanderIncoterms({ modeTransport: "maritime", conteneurise: true, organisateurTransport: "acheteur", formalitesExport: "vendeur" });
    expect(codes(r, "recommande")).toEqual(["FCA"]);
    expect(codes(r, "a_examiner")).toContain("FOB");
    expect(r.avertissements.join(" ")).toMatch(/FCA est l'alternative/);
  });

  it("FOB n'est jamais proposé hors maritime, même pour une importation", () => {
    for (const mode of ["routier", "aerien", "ferroviaire", "multimodal"]) {
      expect(codes(recommanderIncoterms({ modeTransport: mode, organisateurTransport: "acheteur", formalitesExport: "vendeur" })), mode).not.toContain("FOB");
    }
  });

  it("vendeur organisateur : CIF/CFR en maritime, CPT/CIP sinon, DAP/DPU/DDP s'il livre à destination", () => {
    expect(codes(recommanderIncoterms({ modeTransport: "maritime", organisateurTransport: "vendeur", assuranceParVendeur: true }), "recommande")).toEqual(["CIF"]);
    expect(codes(recommanderIncoterms({ modeTransport: "maritime", organisateurTransport: "vendeur" }), "recommande")).toEqual(["CFR"]);
    expect(codes(recommanderIncoterms({ modeTransport: "routier", organisateurTransport: "vendeur", assuranceParVendeur: true }), "recommande")).toEqual(["CIP"]);
    expect(codes(recommanderIncoterms({ modeTransport: "routier", organisateurTransport: "vendeur" }), "recommande")).toEqual(["CPT"]);
    expect(codes(recommanderIncoterms({ modeTransport: "routier", organisateurTransport: "vendeur", vendeurLivreADestination: true, formalitesImport: "vendeur" }), "recommande")).toEqual(["DDP"]);
    expect(codes(recommanderIncoterms({ modeTransport: "routier", organisateurTransport: "vendeur", vendeurLivreADestination: true, vendeurDecharge: true }), "recommande")).toEqual(["DPU"]);
    expect(codes(recommanderIncoterms({ modeTransport: "routier", organisateurTransport: "vendeur", vendeurLivreADestination: true }), "recommande")).toEqual(["DAP"]);
  });

  it("formalités d'exportation par l'acheteur : EXW, avec un avertissement", () => {
    const r = recommanderIncoterms({ modeTransport: "routier", formalitesExport: "acheteur" });
    expect(codes(r, "recommande")).toEqual(["EXW"]);
    expect(r.avertissements.join(" ")).toMatch(/formalités d'exportation/);
  });
});

describe("Conditions d'une transaction Trade", () => {
  let acheteur; let vendeur; let tx;
  beforeEach(async () => {
    acheteur = await createUser({ role: "client" });
    vendeur = await createUser({ role: "partenaire", isFounder: true });
    tx = await createIETransaction({ client: acheteur._id, partner: vendeur._id, incoterm: "CIF" });
  });
  const params = () => ({ type: "transaction", id: String(tx._id) });

  it("la règle de l'annonce n'est qu'une suggestion tant que les parties n'ont rien convenu", async () => {
    const r = await appel(I.lireConditions, { user: acheteur, params: params() });
    expect(r.body.conditions).toBeNull();
    expect(r.body.suggestion).toEqual({ regle: "CIF" });
  });

  it("proposition par l'acheteur, validation par le vendeur → accord, version et libellé conservés", async () => {
    const p = await appel(I.proposerConditions, { user: acheteur, params: params(), body: { regle: "FOB", lieuNomme: "Port de Jebel Ali", pays: "AE", modeTransport: "maritime" } });
    expect(p.statusCode).toBe(200);
    expect(p.body.conditions.statut).toBe("propose");
    expect(p.body.conditions.valideAcheteur.le).toBeTruthy();
    expect(p.body.conditions.valideVendeur.le).toBeNull();

    const v = await appel(I.validerConditionsCommande, { user: vendeur, params: params() });
    expect(v.body.conditions.statut).toBe("accepte");
    expect(v.body.conditions.libelle).toBe("FOB Port de Jebel Ali, Incoterms® 2020");
    const apres = await IETransaction.findById(tx._id).lean();
    expect(apres.conditionsIncoterm.version).toBe("2020");
    expect(apres.conditionsIncoterm.valideLe).toBeTruthy();
    expect(apres.incoterm).toBe("FOB");                         // aligné pour l'estimateur
    expect(apres.conditionsIncoterm.historique.map((h) => h.action)).toEqual(["proposition", "validation"]);
  });

  it("une modification après accord exige un motif, remet l'accord à zéro et reste tracée", async () => {
    await appel(I.proposerConditions, { user: acheteur, params: params(), body: { regle: "FOB", lieuNomme: "Port de Jebel Ali" } });
    await appel(I.validerConditionsCommande, { user: vendeur, params: params() });

    const sansMotif = await appel(I.proposerConditions, { user: vendeur, params: params(), body: { regle: "CIF", lieuNomme: "Port d'Abidjan" } });
    expect(sansMotif.statusCode).toBe(409);
    expect(sansMotif.body.code).toBe("MOTIF_REQUIS");

    const m = await appel(I.proposerConditions, { user: vendeur, params: params(), body: { regle: "CIF", lieuNomme: "Port d'Abidjan", motif: "L'acheteur n'a pas de transitaire" } });
    expect(m.body.conditions.statut).toBe("propose");
    expect(m.body.conditions.valideAcheteur.le).toBeNull();
    const h = (await IETransaction.findById(tx._id).lean()).conditionsIncoterm.historique;
    expect(h.at(-1)).toMatchObject({ action: "modification", role: "vendeur", regle: "CIF", motif: "L'acheteur n'a pas de transitaire" });
    expect(h).toHaveLength(3);
  });

  it("un tiers ne voit ni ne modifie les conditions ; l'admin lit sans modifier", async () => {
    const intrus = await createUser({ role: "client" });
    expect((await appel(I.lireConditions, { user: intrus, params: params() })).statusCode).toBe(404);
    expect((await appel(I.proposerConditions, { user: intrus, params: params(), body: { regle: "FOB", lieuNomme: "X port" } })).statusCode).toBe(404);
    const admin = await createUser({ role: "admin" });
    expect((await appel(I.lireConditions, { user: admin, params: params() })).statusCode).toBe(200);
    expect((await appel(I.proposerConditions, { user: admin, params: params(), body: { regle: "FOB", lieuNomme: "X port" } })).statusCode).toBe(403);
  });

  it("refuse une proposition sans lieu nommé", async () => {
    const r = await appel(I.proposerConditions, { user: acheteur, params: params(), body: { regle: "FOB" } });
    expect(r.statusCode).toBe(400);
    expect(r.body.champs).toContain("lieuNomme");
  });
});

describe("Conditions d'une commande Parts", () => {
  it("l'acheteur et le vendeur de la pièce conviennent des conditions", async () => {
    const acheteur = await createUser({ role: "client" });
    const vendeur = await createUser({ role: "partenaire" });
    const part = await SparePart.create({ owner: vendeur._id, category: "FREINAGE", title: "Disques", price: 60, stock: 2, compatibility: [{ marque: "Kia" }], status: "approved", country: "CN" });
    const b = await Booking.create({ type: "piece", client: acheteur._id, part: part._id, status: "confirmed", clientInfo: { firstName: "A", lastName: "B", email: acheteur.email, passportNumber: "P1" } });
    const params = { type: "booking", id: String(b._id) };
    await appel(I.proposerConditions, { user: vendeur, params, body: { regle: "CIP", lieuNomme: "Aéroport Mohammed V", pays: "MA", modeTransport: "aerien" } });
    const v = await appel(I.validerConditionsCommande, { user: acheteur, params });
    expect(v.body.conditions.statut).toBe("accepte");
    expect(v.body.conditions.libelle).toBe("CIP Aéroport Mohammed V, Incoterms® 2020");
  });
});
