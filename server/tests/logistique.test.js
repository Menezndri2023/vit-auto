import { describe, it, expect, beforeEach } from "vitest";
import * as L from "../controllers/logistiqueController.js";
import DemandeLogistique from "../models/DemandeLogistique.js";
import Prestataire from "../models/Prestataire.js";
import PricingConfig from "../models/PricingConfig.js";
import ServiceRequest from "../models/ServiceRequest.js";
import CommissionLedger from "../models/CommissionLedger.js";
import Invoice from "../models/Invoice.js";
import { DEFAULT_PRICING_CONFIG } from "../config/defaultPricingConfig.js";
import { setDecision } from "../controllers/serviceRequestController.js";
import { createUser, createIETransaction } from "./helpers/fixtures.js";
import Booking from "../models/Booking.js";
import SparePart from "../models/SparePart.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// VIT-AUTO LOGISTIQUE — mise en relation gratuite (exploitant, 2026-10-27)
// ═══════════════════════════════════════════════════════════════════════════
// Demande → qualification → sollicitation → devis → acceptation → exécution
// déclarée par le prestataire retenu → réception confirmée par le client.
// Aucune commission, aucun frais, aucune facture, aucun revenu fictif.

const appel = async (fn, { user, body = {}, params = {}, query = {} }) => {
  const m = mockReqRes({ user, body, params, query });
  m.res.setHeader = () => {};
  await fn(m.req, m.res);
  return m.res;
};

const DEMANDE_VEHICULE = {
  typeBesoin: "vehicule",
  depart: { pays: "FR", ville: "Marseille" },
  arrivee: { pays: "MA", ville: "Casablanca" },
  marchandise: { vehicule: { marque: "Peugeot", modele: "3008", annee: 2021, roulant: true } },
  contact: { telephone: "+212600000000" },
};
const DEVIS = (montant = 1200) => ({
  montant, devise: "EUR", inclus: "Transport roulier, assurance transport", exclus: "Droits de douane",
  delaiJoursMin: 7, delaiJoursMax: 12, valideJusquau: new Date(Date.now() + 10 * 86400000).toISOString(),
  modalitesPaiement: "Virement à l'enlèvement", conditionsAnnulation: "Sans frais avant enlèvement",
});

let client; let admin; let autreClient;
let p1; let p2; let pDouane;

const prestataire = async (raisonSociale, types, pays) => {
  const user = await createUser({ role: "prestataire" });
  const prest = await Prestataire.create({ user: user._id, raisonSociale, types, pays });
  return { user, prest };
};

beforeEach(async () => {
  client = await createUser({ role: "client", emailVerified: true });
  autreClient = await createUser({ role: "client", emailVerified: true });
  admin = await createUser({ role: "admin" });
  p1 = await prestataire("Atlas Transport", ["transporteur"], ["FR", "MA"]);
  p2 = await prestataire("Med Transit", ["transitaire"], ["MA"]);
  pDouane = await prestataire("Douane Express", ["commissionnaire_douane"], ["MA"]);
});

// Amène une demande jusqu'à « devis reçus » avec un devis de p1 et un de p2.
async function jusquAuxDevis() {
  const cree = await appel(L.creerDemande, { user: client, body: DEMANDE_VEHICULE });
  const id = cree.body.demande._id;
  await appel(L.qualifierDemande, { user: admin, params: { id }, body: { decision: "valider" } });
  await appel(L.solliciterPrestataires, { user: admin, params: { id }, body: { prestataires: [p1.prest._id, p2.prest._id] } });
  const d1 = await appel(L.soumettreDevis, { user: p1.user, params: { id }, body: DEVIS(1200) });
  const d2 = await appel(L.soumettreDevis, { user: p2.user, params: { id }, body: DEVIS(950) });
  return { id, devisP1: d1.body.demande.mesDevis.at(-1)._id, devisP2: d2.body.demande.mesDevis.at(-1)._id };
}

describe("Création et qualification", () => {
  it("crée une demande avec une référence unique et le statut « reçue »", async () => {
    const r = await appel(L.creerDemande, { user: client, body: DEMANDE_VEHICULE });
    expect(r.statusCode).toBe(201);
    expect(r.body.demande.reference).toMatch(/^VA-LOG-\d{4}-\d{6}$/);
    expect(r.body.demande.statut).toBe("recue");
    expect(r.body.demande.jalons.recueLe).toBeTruthy();
  });

  it("n'exige que les champs utiles au besoin", async () => {
    // Véhicule : marque et modèle, pas de poids ni de dimensions.
    const sansModele = await appel(L.creerDemande, { user: client, body: { ...DEMANDE_VEHICULE, marchandise: { vehicule: { marque: "Peugeot" } } } });
    expect(sansModele.statusCode).toBe(400);
    expect(sansModele.body.champs).toContain("marchandise.vehicule.modele");
    expect(sansModele.body.champs).not.toContain("marchandise.poidsKg");
    // Pièces : une description, pas de marque de véhicule.
    const pieces = await appel(L.creerDemande, { user: client, body: { ...DEMANDE_VEHICULE, typeBesoin: "pieces", marchandise: { description: "2 palettes de plaquettes", poidsKg: 300 } } });
    expect(pieces.statusCode).toBe(201);
  });

  it("refuse un pays inexistant", async () => {
    const r = await appel(L.creerDemande, { user: client, body: { ...DEMANDE_VEHICULE, arrivee: { pays: "ZZ", ville: "Nulle part" } } });
    expect(r.statusCode).toBe(400);
    expect(r.body.champs).toContain("arrivee.pays");
  });

  it("brouillon puis soumission ; « informations requises » puis complément", async () => {
    const b = await appel(L.creerDemande, { user: client, body: { ...DEMANDE_VEHICULE, brouillon: true, marchandise: {} } });
    expect(b.body.demande.statut).toBe("brouillon");
    const id = b.body.demande._id;
    const s = await appel(L.completerDemande, { user: client, params: { id }, body: { soumettre: true, marchandise: DEMANDE_VEHICULE.marchandise } });
    expect(s.body.demande.statut).toBe("recue");

    const infos = await appel(L.qualifierDemande, { user: admin, params: { id }, body: { decision: "infos", note: "Le véhicule est-il roulant ?" } });
    expect(infos.body.demande.statut).toBe("infos_requises");
    const c = await appel(L.completerDemande, { user: client, params: { id }, body: { marchandise: { vehicule: { ...DEMANDE_VEHICULE.marchandise.vehicule, roulant: false } } } });
    expect(c.body.demande.statut).toBe("recue");
  });

  it("« informations requises » exige de dire lesquelles", async () => {
    const r = await appel(L.creerDemande, { user: client, body: DEMANDE_VEHICULE });
    const q = await appel(L.qualifierDemande, { user: admin, params: { id: r.body.demande._id }, body: { decision: "infos" } });
    expect(q.statusCode).toBe(400);
  });
});

describe("Mise en relation et confidentialité", () => {
  it("propose les seuls prestataires logistiques couvrant le trajet", async () => {
    const r = await appel(L.creerDemande, { user: client, body: DEMANDE_VEHICULE });
    const c = await appel(L.prestatairesCompatibles, { user: admin, params: { id: r.body.demande._id } });
    const noms = c.body.prestataires.map((p) => p.raisonSociale).sort();
    expect(noms).toEqual(["Atlas Transport", "Med Transit"]);   // pas le commissionnaire en douane
    expect(c.body.prestataires.find((p) => p.raisonSociale === "Atlas Transport").couvreLesDeux).toBe(true);
  });

  it("on ne sollicite pas une demande non qualifiée, ni un prestataire non logistique", async () => {
    const r = await appel(L.creerDemande, { user: client, body: DEMANDE_VEHICULE });
    const id = r.body.demande._id;
    expect((await appel(L.solliciterPrestataires, { user: admin, params: { id }, body: { prestataires: [p1.prest._id] } })).statusCode).toBe(409);
    await appel(L.qualifierDemande, { user: admin, params: { id }, body: { decision: "valider" } });
    expect((await appel(L.solliciterPrestataires, { user: admin, params: { id }, body: { prestataires: [pDouane.prest._id] } })).statusCode).toBe(409);
    const ok = await appel(L.solliciterPrestataires, { user: admin, params: { id }, body: { prestataires: [p1.prest._id] } });
    expect(ok.body.demande.statut).toBe("recherche_prestataires");
  });

  it("un prestataire non sollicité ne voit pas la demande ; un sollicité ne voit pas le contact du client", async () => {
    const r = await appel(L.creerDemande, { user: client, body: DEMANDE_VEHICULE });
    const id = r.body.demande._id;
    await appel(L.qualifierDemande, { user: admin, params: { id }, body: { decision: "valider" } });
    await appel(L.solliciterPrestataires, { user: admin, params: { id }, body: { prestataires: [p1.prest._id] } });

    expect((await appel(L.lireDemandePrestataire, { user: p2.user, params: { id } })).statusCode).toBe(404);
    expect((await appel(L.demandesPrestataire, { user: p2.user })).body.demandes).toHaveLength(0);

    const vue = await appel(L.lireDemandePrestataire, { user: p1.user, params: { id } });
    expect(vue.statusCode).toBe(200);
    expect(vue.body.demande.contact).toBeUndefined();
    expect(JSON.stringify(vue.body.demande)).not.toContain("+212600000000");
    expect(vue.body.demande.client).toBeUndefined();
  });

  it("un client ne lit ni ne modifie la demande d'un autre", async () => {
    const r = await appel(L.creerDemande, { user: client, body: DEMANDE_VEHICULE });
    const id = r.body.demande._id;
    expect((await appel(L.lireDemandeClient, { user: autreClient, params: { id } })).statusCode).toBe(404);
    expect((await appel(L.annulerDemande, { user: autreClient, params: { id } })).statusCode).toBe(404);
  });
});

describe("Devis : soumission, actualisation, acceptation", () => {
  it("une actualisation crée une nouvelle version, l'ancienne reste dans l'historique", async () => {
    const { id } = await jusquAuxDevis();
    const maj = await appel(L.soumettreDevis, { user: p1.user, params: { id }, body: DEVIS(1100) });
    const mes = maj.body.demande.mesDevis;
    expect(mes.map((d) => [d.version, d.statut, d.montant])).toEqual([[1, "remplace", 1200], [2, "propose", 1100]]);

    const vueClient = await appel(L.lireDemandeClient, { user: client, params: { id } });
    const visibles = vueClient.body.demande.devis.map((d) => d.montant).sort();
    expect(visibles).toEqual([1100, 950]);                 // le client ne voit pas la version remplacée
  });

  it("refuse un devis incomplet ou déjà expiré à sa création", async () => {
    const { id } = await jusquAuxDevis();
    const r = await appel(L.soumettreDevis, { user: p1.user, params: { id }, body: { montant: 100, devise: "EUR", valideJusquau: "2020-01-01" } });
    expect(r.statusCode).toBe(400);
    expect(r.body.champs).toContain("valideJusquau");
  });

  it("l'acceptation fige une copie exacte du devis et écarte les autres", async () => {
    const { id, devisP2 } = await jusquAuxDevis();
    const a = await appel(L.accepterDevis, { user: client, params: { id, devisId: devisP2 } });
    expect(a.statusCode).toBe(200);
    expect(a.body.demande.statut).toBe("devis_accepte");

    const d = await DemandeLogistique.findById(id).lean();
    expect(d.devisAccepte.copie.montant).toBe(950);
    expect(d.devisAccepte.copie.conditionsAnnulation).toBe("Sans frais avant enlèvement");
    expect(d.devisAccepte.accepteLe).toBeTruthy();
    expect(d.devis.find((x) => String(x.prestataire) === String(p1.prest._id) && x.statut !== "remplace").statut).toBe("non_retenu");

    // Le prestataire retenu voit désormais le contact ; l'autre non.
    expect((await appel(L.lireDemandePrestataire, { user: p2.user, params: { id } })).body.demande.contact.telephone).toBe("+212600000000");
    expect((await appel(L.lireDemandePrestataire, { user: p1.user, params: { id } })).body.demande.contact).toBeUndefined();
    // Plus de nouveau devis une fois un devis accepté.
    expect((await appel(L.soumettreDevis, { user: p1.user, params: { id }, body: DEVIS(800) })).statusCode).toBe(409);
  });

  it("un devis expiré ne peut pas être accepté", async () => {
    const { id, devisP1 } = await jusquAuxDevis();
    await DemandeLogistique.updateOne({ _id: id, "devis._id": devisP1 }, { $set: { "devis.$.valideJusquau": new Date(Date.now() - 1000) } });
    const a = await appel(L.accepterDevis, { user: client, params: { id, devisId: devisP1 } });
    expect(a.statusCode).toBe(409);
    expect(a.body.code).toBe("DEVIS_EXPIRE");
  });
});

describe("Exécution et clôture", () => {
  it("seul le prestataire retenu fait avancer les étapes, dans l'ordre ; le client confirme la réception", async () => {
    const { id, devisP1 } = await jusquAuxDevis();
    await appel(L.accepterDevis, { user: client, params: { id, devisId: devisP1 } });

    // L'autre prestataire ne peut rien faire avancer.
    expect((await appel(L.avancerEtape, { user: p2.user, params: { id }, body: { statut: "commande_confirmee" } })).statusCode).toBe(403);
    // Pas de saut d'étape.
    const saut = await appel(L.avancerEtape, { user: p1.user, params: { id }, body: { statut: "en_transport" } });
    expect(saut.statusCode).toBe(409);
    expect(saut.body.attendu).toBe("commande_confirmee");

    for (const statut of ["commande_confirmee", "en_preparation", "en_transport", "livraison_declaree"]) {
      const r = await appel(L.avancerEtape, { user: p1.user, params: { id }, body: { statut, referenceSuivi: statut === "en_transport" ? "CMAU1234567" : undefined } });
      expect(r.statusCode, statut).toBe(200);
    }
    // Un devis accepté n'est PAS une opération conclue, une livraison déclarée non plus.
    let d = await DemandeLogistique.findById(id).lean();
    expect(d.jalons.devisAccepteLe).toBeTruthy();
    expect(d.jalons.clotureeLe).toBeNull();
    expect(d.evenements.find((e) => e.statut === "en_transport").reference).toBe("CMAU1234567");

    const fin = await appel(L.confirmerLivraison, { user: client, params: { id } });
    expect(fin.body.demande.statut).toBe("cloturee");
    d = await DemandeLogistique.findById(id).lean();
    expect(d.jalons.clotureeLe).toBeTruthy();
  });

  it("le client ne confirme pas une livraison que le prestataire n'a pas déclarée", async () => {
    const { id, devisP1 } = await jusquAuxDevis();
    await appel(L.accepterDevis, { user: client, params: { id, devisId: devisP1 } });
    expect((await appel(L.confirmerLivraison, { user: client, params: { id } })).statusCode).toBe(409);
  });

  it("annulation impossible une fois le transport commencé ; litige possible", async () => {
    const { id, devisP1 } = await jusquAuxDevis();
    await appel(L.accepterDevis, { user: client, params: { id, devisId: devisP1 } });
    for (const statut of ["commande_confirmee", "en_preparation", "en_transport"]) {
      await appel(L.avancerEtape, { user: p1.user, params: { id }, body: { statut } });
    }
    expect((await appel(L.annulerDemande, { user: client, params: { id } })).statusCode).toBe(409);
    const l = await appel(L.ouvrirLitige, { user: client, params: { id }, body: { motif: "Véhicule rayé à la livraison" } });
    expect(l.body.demande.statut).toBe("litige");
    // L'admin résout, avec une note obligatoire, sans fabriquer d'étape de transport.
    expect((await appel(L.interventionAdmin, { user: admin, params: { id }, body: { statut: "cloturee" } })).statusCode).toBe(400);
    const res = await appel(L.interventionAdmin, { user: admin, params: { id }, body: { statut: "cloturee", note: "Accord amiable entre les parties" } });
    expect(res.body.demande.statut).toBe("cloturee");
  });

  it("l'admin ne peut pas déclarer un transport ou une livraison à la place du prestataire", async () => {
    const { id, devisP1 } = await jusquAuxDevis();
    await appel(L.accepterDevis, { user: client, params: { id, devisId: devisP1 } });
    const r = await appel(L.interventionAdmin, { user: admin, params: { id }, body: { statut: "livraison_declaree", note: "test" } });
    expect(r.statusCode).toBe(409);
  });

  it("la preuve de livraison est réservée au prestataire retenu et exige un fichier", async () => {
    const { id, devisP1 } = await jusquAuxDevis();
    await appel(L.accepterDevis, { user: client, params: { id, devisId: devisP1 } });
    for (const statut of ["commande_confirmee", "en_preparation", "en_transport"]) {
      await appel(L.avancerEtape, { user: p1.user, params: { id }, body: { statut } });
    }
    expect((await appel(L.deposerPreuveLivraison, { user: p2.user, params: { id }, body: {} })).statusCode).toBe(403);
    expect((await appel(L.deposerPreuveLivraison, { user: p1.user, params: { id }, body: {} })).statusCode).toBe(400);
  });
});

describe("Gratuité : aucune commission, aucun frais, aucun revenu fictif", () => {
  it("une opération conclue ne crée ni commission, ni facture, ni rémunération", async () => {
    const { id, devisP1 } = await jusquAuxDevis();
    await appel(L.accepterDevis, { user: client, params: { id, devisId: devisP1 } });
    for (const statut of ["commande_confirmee", "en_preparation", "en_transport", "livraison_declaree"]) {
      await appel(L.avancerEtape, { user: p1.user, params: { id }, body: { statut } });
    }
    await appel(L.confirmerLivraison, { user: client, params: { id } });

    const d = await DemandeLogistique.findById(id).lean();
    expect(d.remuneration).toEqual({ modele: "FREE_REFERRAL", montantUSD: 0 });
    expect(await CommissionLedger.countDocuments({ transactionId: String(id) })).toBe(0);
    expect(await CommissionLedger.countDocuments({})).toBe(0);
    expect(await Invoice.countDocuments({})).toBe(0);
  });

  it("le modèle refuse toute rémunération logistique", async () => {
    const { id } = await jusquAuxDevis();
    const d = await DemandeLogistique.findById(id);
    d.remuneration.montantUSD = 25;
    await expect(d.save()).rejects.toThrow(/Aucune rémunération logistique/);
    d.remuneration.montantUSD = 0;
    d.remuneration.modele = "COMMISSION";
    await expect(d.save()).rejects.toThrow();
  });

  it("la configuration logistique est verrouillée sur FREE_REFERRAL", async () => {
    await PricingConfig.create({ ...DEFAULT_PRICING_CONFIG, key: "global" });
    const cfg = await PricingConfig.findOne({ key: "global" });
    expect(cfg.logistique.modeEconomique).toBe("FREE_REFERRAL");
    for (const [champ, valeur] of [["logistique.commissionActive", true], ["logistique.taux", 0.03], ["logistique.fraisMiseEnRelationUSD", 10]]) {
      const c = await PricingConfig.findOne({ key: "global" });
      c.set(champ, valeur);
      await expect(c.save(), champ).rejects.toThrow();
    }
  });

  it("une demande de service « transport » ne porte jamais de commission, même si l'admin en a saisi une", async () => {
    await PricingConfig.create({
      ...DEFAULT_PRICING_CONFIG, key: "global",
      services: { ...DEFAULT_PRICING_CONFIG.services, transport: { enabled: true, commissionRate: 0.03, fixedFeeUSD: 20 } },
    });
    const sr = await ServiceRequest.create({ client: client._id, category: "transport" });
    const r = await appel(setDecision, { user: admin, params: { id: sr._id }, body: { status: "approved", quotedAmountUSD: 1000 } });
    expect(r.statusCode).toBe(200);
    const apres = await ServiceRequest.findById(sr._id).lean();
    expect(apres.commission).toEqual({ rate: 0, amount: 0 });
  });

  it("les indicateurs comptent les vrais événements et affichent un revenu VIT AUTO nul", async () => {
    const vide = await L.calculerIndicateurs();
    expect(vide.conversions.demandeVersDevis).toBeNull();     // indisponible, pas 0
    expect(vide.delais.premiereReponseH).toBeNull();

    const { id, devisP1 } = await jusquAuxDevis();
    await appel(L.accepterDevis, { user: client, params: { id, devisId: devisP1 } });
    await appel(L.avancerEtape, { user: p1.user, params: { id }, body: { statut: "commande_confirmee" } });
    await appel(L.creerDemande, { user: autreClient, body: DEMANDE_VEHICULE });

    const i = await L.calculerIndicateurs();
    expect(i.demandes).toMatchObject({ creees: 2, soumises: 2, valides: 1, transmises: 1, avecDevis: 1, devisAcceptes: 1, commandesConfirmees: 1, operationsConclues: 0 });
    expect(i.prestataires).toMatchObject({ sollicites: 2, ayantRepondu: 2, devisRecus: 2 });
    expect(i.conversions).toEqual({ demandeVersDevis: 100, devisVersCommande: 100, commandeVersConclue: 0 });
    expect(i.montantsDeclares.commandes).toEqual({ EUR: 1200 });
    expect(i.montantsDeclares.conclues).toEqual({});
    expect(i.revenusVitAuto.montantUSD).toBe(0);
    expect(i.zones[0]).toEqual({ route: "FR→MA", demandes: 2 });
  });

  it("l'export CSV ne contient aucune donnée personnelle et dit « indisponible »", async () => {
    await appel(L.creerDemande, { user: client, body: DEMANDE_VEHICULE });
    const r = await appel(L.exporterIndicateurs, { user: admin });
    expect(r.body).toContain("revenusVitAuto.USD");
    expect(r.body).toContain("indisponible");
    expect(r.body).not.toContain("+212600000000");
    expect(r.body).not.toContain(client.email);
  });
});

describe("Rattachement à une commande Parts ou Trade", () => {
  const commandePiece = async (proprio, statut = "confirmed") => {
    const vendeur = await createUser({ role: "partenaire" });
    const part = await SparePart.create({ owner: vendeur._id, category: "FREINAGE", title: "Disques avant", price: 60, stock: 4, compatibility: [{ marque: "Renault" }], status: "approved", country: "MA", ville: "Casablanca" });
    return Booking.create({
      type: "piece", client: proprio._id, part: part._id, status: statut,
      clientInfo: { firstName: "A", lastName: "B", email: proprio.email, passportNumber: "P1234567" },
      piece: { quantity: 2, delivery: { address: "Rue 1", ville: "Dakar", country: "SN" } },
    });
  };

  it("liste les commandes du client avec un préremplissage, sans celles des autres", async () => {
    const b = await commandePiece(client);
    const t = await createIETransaction({ client: client._id, destCountry: "CI", destCity: "Abidjan" });
    await commandePiece(autreClient);

    const r = await appel(L.commandesRattachables, { user: client });
    const ids = r.body.commandes.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([String(b._id), String(t._id)]));
    expect(ids).toHaveLength(2);

    const piece = r.body.commandes.find((c) => c.type === "booking");
    expect(piece.prefill).toMatchObject({ typeBesoin: "pieces", depart: { pays: "MA", ville: "Casablanca" }, arrivee: { pays: "SN", ville: "Dakar" } });
    expect(piece.prefill.marchandise.description).toBe("2 × Disques avant");

    const trade = r.body.commandes.find((c) => c.type === "transaction");
    expect(trade.prefill.typeBesoin).toBe("vehicule");
    expect(trade.prefill.marchandise.vehicule).toMatchObject({ marque: "Toyota", modele: "Land Cruiser", annee: 2022 });
    // « Émirats Arabes Unis » n'est pas un code ISO : pays laissé vide, pas deviné.
    expect(trade.prefill.depart.pays).toBe("");
    expect(trade.prefill.arrivee).toEqual({ pays: "CI", ville: "Abidjan" });
  });

  it("rattache une commande du client et la montre au client, à l'admin et — sans détail — au prestataire", async () => {
    const b = await commandePiece(client);
    const cree = await appel(L.creerDemande, { user: client, body: { ...DEMANDE_VEHICULE, typeBesoin: "pieces", marchandise: { description: "2 × Disques avant" }, lien: { type: "booking", id: String(b._id) } } });
    expect(cree.statusCode).toBe(201);
    const id = cree.body.demande._id;
    expect(String((await DemandeLogistique.findById(id).lean()).liens.booking)).toBe(String(b._id));

    const vueClient = await appel(L.lireDemandeClient, { user: client, params: { id } });
    expect(vueClient.body.demande.commandeLiee).toMatchObject({ type: "booking", id: String(b._id) });

    const vueAdmin = await appel(L.lireDemandeAdmin, { user: admin, params: { id } });
    expect(vueAdmin.body.demande.commandeLiee.type).toBe("booking");

    await appel(L.qualifierDemande, { user: admin, params: { id }, body: { decision: "valider" } });
    await appel(L.solliciterPrestataires, { user: admin, params: { id }, body: { prestataires: [p1.prest._id] } });
    const vuePrest = await appel(L.lireDemandePrestataire, { user: p1.user, params: { id } });
    expect(vuePrest.body.demande.commandeLiee).toEqual({ libelle: "Commande de pièces détachées" });
    expect(JSON.stringify(vuePrest.body.demande)).not.toContain(String(b._id));
  });

  it("refuse la commande d'un autre client, une commande annulée, et un second rattachement actif", async () => {
    const autre = await commandePiece(autreClient);
    const r1 = await appel(L.creerDemande, { user: client, body: { ...DEMANDE_VEHICULE, lien: { type: "booking", id: String(autre._id) } } });
    expect(r1.statusCode).toBe(404);

    const annulee = await commandePiece(client, "cancelled");
    expect((await appel(L.creerDemande, { user: client, body: { ...DEMANDE_VEHICULE, lien: { type: "booking", id: String(annulee._id) } } })).statusCode).toBe(409);

    const t = await createIETransaction({ client: client._id });
    const premier = await appel(L.creerDemande, { user: client, body: { ...DEMANDE_VEHICULE, lien: { type: "transaction", id: String(t._id) } } });
    expect(premier.statusCode).toBe(201);
    const second = await appel(L.creerDemande, { user: client, body: { ...DEMANDE_VEHICULE, lien: { type: "transaction", id: String(t._id) } } });
    expect(second.statusCode).toBe(409);
    expect(second.body.code).toBe("DEMANDE_EXISTANTE");
    expect(String(second.body.demandeId)).toBe(String(premier.body.demande._id));

    // Une fois la première annulée, on peut en rouvrir une.
    await appel(L.annulerDemande, { user: client, params: { id: premier.body.demande._id } });
    expect((await appel(L.creerDemande, { user: client, body: { ...DEMANDE_VEHICULE, lien: { type: "transaction", id: String(t._id) } } })).statusCode).toBe(201);
  });

  it("une demande reste possible sans commande, et le rattachement ne crée aucune commission", async () => {
    expect((await appel(L.creerDemande, { user: client, body: DEMANDE_VEHICULE })).statusCode).toBe(201);
    const b = await commandePiece(client);
    await appel(L.creerDemande, { user: client, body: { ...DEMANDE_VEHICULE, typeBesoin: "pieces", marchandise: { description: "x" }, lien: { type: "booking", id: String(b._id) } } });
    expect(await CommissionLedger.countDocuments({})).toBe(0);
    const apres = await Booking.findById(b._id).lean();
    expect(apres.commissionAmount ?? 0).toBe(b.commissionAmount ?? 0);   // la commande n'est pas modifiée
  });
});
