import { describe, it, expect } from "vitest";
import * as t from "../controllers/transitController.js";
import * as ie from "../controllers/importExportController.js";
import User from "../models/User.js";
import Prestataire from "../models/Prestataire.js";
import DossierImport from "../models/DossierImport.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

const appeler = async (fn, opts) => { const { req, res } = mockReqRes(opts); await fn(req, res); return res; };
const corps = (res) => res.json.mock.calls.at(-1)?.[0];
const email = () => `transit.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@vitauto-fixtures.fr`;
const jetonDe = (lien) => new URL(lien, "https://x").searchParams.get("jeton");

async function inviterEtInscrire(admin, adresse = email()) {
  const inv = await appeler(t.creerInvitation, { user: admin, body: { email: adresse, raisonSociale: "Transit Abidjan SARL", types: ["transitaire"], pays: ["CI", "XX"], ports: ["CIABJ"] } });
  expect(inv.status).toHaveBeenCalledWith(201);
  const jeton = jetonDe(corps(inv).lien);
  const res = await appeler(t.inscrirePrestataire, { body: { jeton, firstName: "Koffi", lastName: "Yao", password: "motdepasse123" } });
  expect(res.status).toHaveBeenCalledWith(201);
  return { user: await User.findOne({ email: adresse }), jeton };
}

describe("zone Transit : inscription sur invitation seulement", () => {
  it("un lien d'invitation crée un compte prestataire, une seule fois", async () => {
    const admin = await createUser({ role: "admin" });
    const { user, jeton } = await inviterEtInscrire(admin);
    expect(user.role).toBe("prestataire");
    expect(user.emailVerified).toBe(true);
    const profil = await Prestataire.findOne({ user: user._id }).lean();
    expect(profil.pays).toEqual(["CI"]);            // pays hors trajets écarté
    expect(profil.ports).toEqual(["CIABJ"]);
    const rejoue = await appeler(t.inscrirePrestataire, { body: { jeton, firstName: "X", lastName: "Y", password: "motdepasse123" } });
    expect(rejoue.status).toHaveBeenCalledWith(404);
  });

  it("sans invitation valide, aucune inscription possible", async () => {
    const res = await appeler(t.inscrirePrestataire, { body: { jeton: "a".repeat(64), firstName: "X", lastName: "Y", password: "motdepasse123" } });
    expect(res.status).toHaveBeenCalledWith(404);
    expect((await appeler(t.lireInvitation, { params: { jeton: "court" } })).status).toHaveBeenCalledWith(404);
  });

  it("une invitation révoquée ne sert plus", async () => {
    const admin = await createUser({ role: "admin" });
    const inv = await appeler(t.creerInvitation, { user: admin, body: { email: email(), raisonSociale: "Douane Lomé", types: ["commissionnaire_douane"] } });
    await appeler(t.revoquerInvitation, { user: admin, params: { id: corps(inv).invitation._id.toString() } });
    const res = await appeler(t.inscrirePrestataire, { body: { jeton: jetonDe(corps(inv).lien), firstName: "X", lastName: "Y", password: "motdepasse123" } });
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("zone Transit : le prestataire ne voit et ne fait que sa part", () => {
  it("dossier affecté visible sans les montants ; étapes logistiques en avant seulement ; documents déposés, jamais validés", async () => {
    const [admin, client] = await Promise.all([createUser({ role: "admin" }), createUser({ role: "client" })]);
    const { user: presta } = await inviterEtInscrire(admin);
    const autre = (await inviterEtInscrire(admin)).user;
    const r = await appeler(ie.createRequest, { user: client, body: { firstName: "A", lastName: "B", email: "a@vitauto-fixtures.fr", serviceType: "import", pack: "Gold", sourceCountry: "CN", destCountry: "CI" } });
    const id = corps(r).dossier._id.toString();
    await appeler(t.affecterPrestataire, { user: admin, params: { id }, body: { prestataireUserId: presta._id.toString() } });

    expect((await appeler(t.lireDossierTransit, { user: autre, params: { id } })).status).toHaveBeenCalledWith(404);
    const vu = corps(await appeler(t.lireDossierTransit, { user: presta, params: { id } })).dossier;
    expect(vu.pack).toBeUndefined();
    expect(vu.devis).toBeUndefined();
    expect(vu.notesInternes).toBeUndefined();

    expect((await appeler(t.avancerEtapeTransit, { user: presta, params: { id }, body: { etape: "pack_regle" } })).status).toHaveBeenCalledWith(400);
    await appeler(t.avancerEtapeTransit, { user: presta, params: { id }, body: { etape: "arrive_port", note: "Navire à quai" } });
    expect((await DossierImport.findById(id).lean()).etape).toBe("arrive_port");
    expect((await appeler(t.avancerEtapeTransit, { user: presta, params: { id }, body: { etape: "en_mer" } })).status).toHaveBeenCalledWith(400);

    const pdf = "data:application/pdf;base64," + Buffer.from("%PDF-1.4\n%%EOF").toString("base64");
    await appeler(t.deposerDocumentTransit, { user: presta, params: { id, code: "declaration_douane" }, body: { fichier: pdf } });
    const doc = (await DossierImport.findById(id).lean()).documents.find((x) => x.code === "declaration_douane");
    expect(doc.statut).toBe("fourni");
    expect((await appeler(t.deposerDocumentTransit, { user: presta, params: { id, code: "facture_commerciale" }, body: { fichier: pdf } })).status).toHaveBeenCalledWith(400);
  });

  it("un prestataire suspendu ne peut plus être affecté et son compte est bloqué", async () => {
    const admin = await createUser({ role: "admin" });
    const { user } = await inviterEtInscrire(admin);
    const profil = await Prestataire.findOne({ user: user._id });
    await appeler(t.changerStatutPrestataire, { user: admin, params: { id: profil._id.toString() }, body: { statut: "suspendu" } });
    expect((await User.findById(user._id).lean()).isActive).toBe(false);
  });
});
