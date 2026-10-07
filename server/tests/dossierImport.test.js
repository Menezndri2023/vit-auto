import { describe, it, expect } from "vitest";
import * as ie from "../controllers/importExportController.js";
import * as d from "../controllers/dossierImportController.js";
import DossierImport from "../models/DossierImport.js";
import IETransaction from "../models/IETransaction.js";
import Notification from "../models/Notification.js";
import { creerDossierDepuisTransaction } from "../services/dossierImportService.js";
import { createUser, createListing, createIETransaction } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const demande = (o = {}) => ({ firstName: "Awa", lastName: "Kone", email: "awa@vitauto-fixtures.fr", serviceType: "import", pack: "Gold", sourceCountry: "Chine", destCountry: "Côte d'Ivoire", vehicleMake: "Toyota", vehicleModel: "RAV4", vehicleYear: 2022, budget: 25000, currency: "USD", ...o });
const appeler = async (fn, opts) => { const { req, res } = mockReqRes(opts); await fn(req, res); return res; };
const corps = (res) => res.json.mock.calls.at(-1)?.[0];

describe("dossiers d'import", () => {
  it("une demande d'accompagnement ouvre un dossier suivi, avec pack, documents du pays et notification", async () => {
    const client = await createUser({ role: "client" });
    const res = await appeler(ie.createRequest, { user: client, body: demande() });
    expect(res.status).toHaveBeenCalledWith(201);
    const dossier = await DossierImport.findById(corps(res).dossier._id).lean();
    expect(dossier.reference).toMatch(/^VA-IMP-\d{4}-\d+/);
    expect(dossier.origine.pays).toBe("CN");
    expect(dossier.destination.pays).toBe("CI");
    expect(dossier.pack).toMatchObject({ code: "Gold", prix: 890, statut: "a_regler" });
    expect(dossier.documents.map((x) => x.code)).toContain("bsc_ectn"); // exigé en Côte d'Ivoire
    expect(await Notification.countDocuments({ user: client._id })).toBeGreaterThan(0);
  });

  it("refuse une destination ou une origine hors des trajets ouverts", async () => {
    const client = await createUser({ role: "client" });
    expect((await appeler(ie.createRequest, { user: client, body: demande({ destCountry: "Nigeria" }) })).status).toHaveBeenCalledWith(400);
    expect((await appeler(ie.createRequest, { user: client, body: demande({ sourceCountry: "Japon" }) })).status).toHaveBeenCalledWith(400);
  });

  it("le Maroc n'exige pas le BSC", async () => {
    const client = await createUser({ role: "client" });
    const res = await appeler(ie.createRequest, { user: client, body: demande({ destCountry: "MA" }) });
    const dossier = await DossierImport.findById(corps(res).dossier._id).lean();
    expect(dossier.documents.map((x) => x.code)).not.toContain("bsc_ectn");
  });

  it("le client ne voit que ses dossiers, sans les notes internes ni les étapes masquées", async () => {
    const [client, autre, admin] = await Promise.all([createUser({ role: "client" }), createUser({ role: "client" }), createUser({ role: "admin" })]);
    const res = await appeler(ie.createRequest, { user: client, body: demande() });
    const id = corps(res).dossier._id.toString();
    await appeler(d.ajouterNote, { user: admin, params: { id }, body: { texte: "Client pressé, négocier le fret" } });
    await appeler(d.changerEtape, { user: admin, params: { id }, body: { etape: "recherche_vehicule", visibleClient: false } });

    expect((await appeler(d.lireDossier, { user: autre, params: { id } })).status).toHaveBeenCalledWith(403);
    const vu = corps(await appeler(d.lireDossier, { user: client, params: { id } })).dossier;
    expect(vu.notesInternes).toBeUndefined();
    expect(vu.historique.some((h) => h.etape === "recherche_vehicule")).toBe(false);
    const vuAdmin = corps(await appeler(d.lireDossier, { user: admin, params: { id } })).dossier;
    expect(vuAdmin.notesInternes).toHaveLength(1);
  });

  it("devis puis règlement du pack : déclaré par le client, confirmé par l'admin, l'étape avance", async () => {
    const [client, admin] = await Promise.all([createUser({ role: "client" }), createUser({ role: "admin" })]);
    const id = corps(await appeler(ie.createRequest, { user: client, body: demande() })).dossier._id.toString();
    expect((await appeler(d.changerEtape, { user: admin, params: { id }, body: { etape: "devis_envoye" } })).status).toHaveBeenCalledWith(400);
    await appeler(d.modifierDossier, { user: admin, params: { id }, body: { devis: { lignes: [{ libelle: "Véhicule", montant: 21000 }, { libelle: "Fret maritime", montant: 1800 }] } } });
    await appeler(d.changerEtape, { user: admin, params: { id }, body: { etape: "devis_envoye" } });
    await appeler(d.declarerReglementPack, { user: client, params: { id }, body: { reference: "VIR-2026-77" } });
    await appeler(d.confirmerPack, { user: admin, params: { id }, body: { statut: "regle" } });
    const dossier = await DossierImport.findById(id).lean();
    expect(dossier.devis.total).toBe(22800);
    expect(dossier.pack.statut).toBe("regle");
    expect(dossier.etape).toBe("pack_regle");
  });

  it("un document ne peut être validé sans fichier ; avec fichier, il est déposé", async () => {
    const [client, admin] = await Promise.all([createUser({ role: "client" }), createUser({ role: "admin" })]);
    const id = corps(await appeler(ie.createRequest, { user: client, body: demande() })).dossier._id.toString();
    expect((await appeler(d.deposerDocument, { user: admin, params: { id, code: "connaissement" }, body: { statut: "valide" } })).status).toHaveBeenCalledWith(400);
    const pdf = "data:application/pdf;base64," + Buffer.from("%PDF-1.4\n%%EOF").toString("base64");
    await appeler(d.deposerDocument, { user: admin, params: { id, code: "connaissement" }, body: { fichier: pdf } });
    const doc = (await DossierImport.findById(id).lean()).documents.find((x) => x.code === "connaissement");
    expect(doc.statut).toBe("fourni");
    expect(doc.url).toBeTruthy();
  });

  it("le dossier d'une annonce suit les statuts de la transaction, sans jamais reculer", async () => {
    const [client, partner] = await Promise.all([createUser({ role: "client" }), createUser({ role: "partenaire", isFounder: true })]);
    const listing = await createListing({ partner: partner._id });
    const tx = await createIETransaction({ listing: listing._id, client: client._id, partner: partner._id, status: "payment_pending", destCountry: "Sénégal" });
    const dossier = await creerDossierDepuisTransaction(tx, listing);
    expect(dossier.destination.pays).toBe("SN");
    tx.status = "in_escrow";
    await tx.save();
    await new Promise((r) => setTimeout(r, 300));
    expect((await DossierImport.findById(dossier._id).lean()).etape).toBe("paiement_sequestre");
    await IETransaction.findOneAndUpdate({ _id: tx._id }, { $set: { status: "shipped" } }, { new: true });
    await new Promise((r) => setTimeout(r, 300));
    expect((await DossierImport.findById(dossier._id).lean()).etape).toBe("embarque");
  });
});
