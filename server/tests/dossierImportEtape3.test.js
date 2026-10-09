import { describe, it, expect } from "vitest";
import * as d from "../controllers/dossierImportController.js";
import * as t from "../controllers/transitController.js";
import * as ie from "../controllers/importExportController.js";
import User from "../models/User.js";
import DossierImport from "../models/DossierImport.js";
import { prixInspection, primeIndicative, mensualite } from "../constants/dossierImport.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Étape 3 de l'Import/Export (2026-10-09) : inspection indépendante par un
// inspecteur de la zone Transit, assurance transport, financement.
const appeler = async (fn, opts) => { const { req, res } = mockReqRes(opts); await fn(req, res); return res; };
const corps = (res) => res.json.mock.calls.at(-1)?.[0];
const email = () => `etape3.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@vitauto-fixtures.fr`;
const jetonDe = (lien) => new URL(lien, "https://x").searchParams.get("jeton");

async function prestataire(admin, types) {
  const adresse = email();
  const inv = await appeler(t.creerInvitation, { user: admin, body: { email: adresse, raisonSociale: "Contrôle Auto", types } });
  await appeler(t.inscrirePrestataire, { body: { jeton: jetonDe(corps(inv).lien), firstName: "Awa", lastName: "Diop", password: "motdepasse123" } });
  return User.findOne({ email: adresse });
}

async function dossierDe(client, pack = "Silver") {
  const r = await appeler(ie.createRequest, { user: client, body: { firstName: "A", lastName: "B", email: "a@vitauto-fixtures.fr", serviceType: "import", pack, sourceCountry: "AE", destCountry: "SN" } });
  return corps(r).dossier._id.toString();
}

const RAPPORT = { lieu: "Jebel Ali", kilometrage: 48210, vinConforme: true, synthese: "Véhicule sain, entretien suivi, aucun choc structurel relevé.", points: [{ rubrique: "moteur", etat: "bon" }, { rubrique: "carrosserie", etat: "moyen", note: "Rayure aile AR" }] };

describe("règles chiffrées", () => {
  it("inspection incluse selon le pack, prime d'assurance et mensualité", () => {
    expect(prixInspection("standard", "Silver")).toBe(90);
    expect(prixInspection("premium", "Gold")).toBe(0);
    expect(prixInspection("expertise", "Gold")).toBe(490);
    expect(prixInspection("expertise", "Executive")).toBe(0);
    expect(primeIndicative(20000, "tous_risques")).toBe(264);   // 20 000 × 110 % × 1,2 %
    expect(primeIndicative(1000, "fap")).toBe(50);              // prime minimale
    expect(mensualite(10000, 12, 36)).toBe(332.14);
    expect(mensualite(1200, 0, 12)).toBe(100);
  });
});

describe("inspection indépendante", () => {
  it("le client la demande, l'admin affecte un inspecteur, seul cet inspecteur rend le rapport", async () => {
    const [admin, client] = await Promise.all([createUser({ role: "admin" }), createUser({ role: "client" })]);
    const id = await dossierDe(client);
    const res = await appeler(d.demanderInspection, { user: client, params: { id }, body: { formule: "standard" } });
    const vu = corps(res).dossier;
    expect(vu.inspection.statut).toBe("demandee");
    expect(vu.devis.lignes.find((l) => l.cle === "inspection").montant).toBe(90);

    const transitaire = await prestataire(admin, ["transitaire"]);
    const refus = await appeler(d.piloterInspection, { user: admin, params: { id }, body: { inspecteur: transitaire._id.toString() } });
    expect(refus.status).toHaveBeenCalledWith(400);   // pas de métier « inspecteur »

    const inspecteur = await prestataire(admin, ["inspecteur"]);
    await appeler(d.piloterInspection, { user: admin, params: { id }, body: { inspecteur: inspecteur._id.toString() } });
    const dossier = await DossierImport.findById(id).lean();
    expect(String(dossier.inspection.inspecteur)).toBe(String(inspecteur._id));
    expect(dossier.prestataires.some((p) => String(p.user) === String(inspecteur._id))).toBe(true);

    // Un autre prestataire affecté au dossier ne peut pas signer le rapport.
    await appeler(t.affecterPrestataire, { user: admin, params: { id }, body: { prestataireUserId: transitaire._id.toString() } });
    expect((await appeler(t.rendreRapportInspection, { user: transitaire, params: { id }, body: { ...RAPPORT, verdict: "conforme" } })).status).toHaveBeenCalledWith(403);

    const ok = await appeler(t.rendreRapportInspection, { user: inspecteur, params: { id }, body: { ...RAPPORT, verdict: "reserves" } });
    expect(corps(ok).dossier.inspection.verdict).toBe("reserves");
    expect(corps(ok).dossier.inspection.prix).toBeUndefined();   // le prestataire ne voit pas les montants
    const apres = await DossierImport.findById(id).lean();
    expect(apres.etape).toBe("inspection");
    expect(apres.inspection.points).toHaveLength(2);
    // Une seule fois.
    expect((await appeler(t.rendreRapportInspection, { user: inspecteur, params: { id }, body: { ...RAPPORT, verdict: "conforme" } })).status).toHaveBeenCalledWith(409);
  });

  it("un verdict « non conforme » bloque paiement et embarquement, jusqu'à une nouvelle inspection", async () => {
    const [admin, client] = await Promise.all([createUser({ role: "admin" }), createUser({ role: "client" })]);
    const id = await dossierDe(client, "Gold");
    const inspecteur = await prestataire(admin, ["inspecteur", "transitaire"]);
    await appeler(d.piloterInspection, { user: admin, params: { id }, body: { formule: "premium", inspecteur: inspecteur._id.toString() } });
    expect((await DossierImport.findById(id).lean()).inspection.prix).toBe(0);   // incluse dans Gold
    await appeler(t.rendreRapportInspection, { user: inspecteur, params: { id }, body: { ...RAPPORT, verdict: "non_conforme" } });

    expect((await appeler(d.changerEtape, { user: admin, params: { id }, body: { etape: "paiement_sequestre" } })).status).toHaveBeenCalledWith(409);
    expect((await appeler(t.avancerEtapeTransit, { user: inspecteur, params: { id }, body: { etape: "embarque" } })).status).toHaveBeenCalledWith(409);

    await appeler(d.piloterInspection, { user: admin, params: { id }, body: { nouvelle: true, inspecteur: inspecteur._id.toString() } });
    expect((await DossierImport.findById(id).lean()).inspection.verdict).toBeNull();
    await appeler(t.rendreRapportInspection, { user: inspecteur, params: { id }, body: { ...RAPPORT, verdict: "conforme" } });
    const res = await appeler(d.changerEtape, { user: admin, params: { id }, body: { etape: "paiement_sequestre" } });
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect((await DossierImport.findById(id).lean()).etape).toBe("paiement_sequestre");
  });
});

describe("assurance transport", () => {
  it("demande → proposition → acceptation (ligne au devis) → souscription", async () => {
    const [admin, client] = await Promise.all([createUser({ role: "admin" }), createUser({ role: "client" })]);
    const id = await dossierDe(client);
    expect((await appeler(d.accepterAssurance, { user: client, params: { id } })).status).toHaveBeenCalledWith(400);
    await appeler(d.demanderAssurance, { user: client, params: { id }, body: { garantie: "tous_risques", valeur: 18000 } });
    expect((await appeler(d.piloterAssurance, { user: admin, params: { id }, body: { statut: "souscrite", numeroPolice: "P-1" } })).status).toHaveBeenCalledWith(400);
    await appeler(d.piloterAssurance, { user: admin, params: { id }, body: { statut: "proposee", prime: 240, assureur: "Atlantique Assurances" } });
    const accepte = corps(await appeler(d.accepterAssurance, { user: client, params: { id } })).dossier;
    expect(accepte.assurance.statut).toBe("acceptee");
    expect(accepte.devis.lignes.filter((l) => l.cle === "assurance")).toHaveLength(1);
    expect(accepte.devis.total).toBe(240);
    await appeler(d.piloterAssurance, { user: admin, params: { id }, body: { statut: "souscrite", numeroPolice: "AT-2026-889" } });
    expect((await DossierImport.findById(id).lean()).assurance.numeroPolice).toBe("AT-2026-889");
  });
});

describe("financement", () => {
  it("le client demande, l'admin accorde et la mensualité est calculée ; le prestataire ne voit rien", async () => {
    const [admin, client] = await Promise.all([createUser({ role: "admin" }), createUser({ role: "client" })]);
    const id = await dossierDe(client);
    expect((await appeler(d.demanderFinancement, { user: client, params: { id }, body: { montantDemande: 12000, dureeMois: 30, situationPro: "salarie", revenusMensuels: 900 } })).status).toHaveBeenCalledWith(400);
    await appeler(d.demanderFinancement, { user: client, params: { id }, body: { montantDemande: 12000, apport: 3000, dureeMois: 36, situationPro: "salarie", revenusMensuels: 900 } });
    expect((await appeler(d.demanderFinancement, { user: client, params: { id }, body: { montantDemande: 5000, dureeMois: 12, situationPro: "salarie", revenusMensuels: 900 } })).status).toHaveBeenCalledWith(409);

    const res = await appeler(d.piloterFinancement, { user: admin, params: { id }, body: { statut: "accorde", montantAccorde: 10000, tauxAnnuel: 12, organisme: "Banque Atlantique" } });
    const f = corps(res).dossier.financement;
    expect(f.statut).toBe("accorde");
    expect(f.mensualite).toBe(332.14);

    const presta = await prestataire(admin, ["transitaire"]);
    await appeler(t.affecterPrestataire, { user: admin, params: { id }, body: { prestataireUserId: presta._id.toString() } });
    const vu = corps(await appeler(t.lireDossierTransit, { user: presta, params: { id } })).dossier;
    expect(vu.financement).toBeUndefined();
    expect(vu.assurance.prime).toBeUndefined();
  });
});
