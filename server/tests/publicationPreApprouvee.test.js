import { describe, it, expect } from "vitest";
import Vehicle from "../models/Vehicle.js";
import { scoreAnnonce, SEUIL_PREAPPROBATION, DELAI_PUBLICATION_MS } from "../services/vehicleScoring.js";
import { publierAnnoncesDues } from "../utils/publicationPlanifiee.js";
import { bloquerPublication } from "../controllers/vehicleController.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";
import { calculerDigest } from "../utils/dailyOpsDigest.js";

// ═══════════════════════════════════════════════════════════════════════════
// PRÉ-APPROBATION : PUBLIER SANS RENONCER AU CONTRÔLE
// ═══════════════════════════════════════════════════════════════════════════
// Choix de l'exploitant (2026-09-24) : une annonce complète ne doit plus
// attendre indéfiniment qu'un administrateur la remarque. Sa publication est
// DATÉE, et l'administrateur garde une fenêtre pour s'y opposer.
//
// Ce qui distingue ce mécanisme d'une publication automatique — et qui compte,
// parce que les notes de review promettent à Apple qu'une annonce peut être
// arrêtée par un humain avant d'être visible (règle 1.2) : rien ne paraît à la
// seconde du dépôt, et un blocage l'emporte toujours.

const annonceComplete = (extra = {}) => ({
  title: "Toyota Yaris Cross 2024 en très bon état",
  marque: "Toyota", modele: "Yaris Cross", annee: 2024,
  pricePerDay: 40, contactNom: "Kouassi", contactTel: "+2250700000000",
  ville: "Abidjan", type: "location", carburant: "Hybride", transmission: "Automatique",
  images: ["https://ik.imagekit.io/vitauto/a.jpg", "https://ik.imagekit.io/vitauto/b.jpg"],
  // Le barème récompense la complétude : catégorie, état, places, couleur et
  // caution valent 17 points à eux seuls, et une description de moins de 100
  // caractères en coûte 5. Une annonce « à peu près remplie » plafonne à 73 —
  // c'est ce que le seuil de 80 exige, et c'est voulu.
  etat: "Occasion", vehicleType: "SUV", nombrePlaces: 5, couleur: "Gris", caution: 200,
  description: "Véhicule récent et parfaitement entretenu, climatisation, boîte automatique, "
    + "cinq places confortables. Idéal aussi bien pour la ville que pour les longs trajets. "
    + "Carnet d'entretien à jour, pneus neufs, livraison possible à Abidjan.",
  ...extra,
});

describe("Score — décision de pré-approbation", () => {
  it("une annonce complète est pré-approuvée, sans être publiée pour autant", () => {
    const v = scoreAnnonce(annonceComplete());
    expect(v.score).toBeGreaterThanOrEqual(SEUIL_PREAPPROBATION);
    expect(v.preApprouvee).toBe(true);
    // LE point : le statut reste « pending ». Rien ne paraît au clic.
    expect(v.status).toBe("pending");
  });

  it("une annonce incomplète n'est pas pré-approuvée", () => {
    const v = scoreAnnonce(annonceComplete({ images: [], description: "", contactTel: "" }));
    expect(v.score).toBeLessThan(SEUIL_PREAPPROBATION);
    expect(v.preApprouvee).toBe(false);
  });

  it("une erreur critique interdit la pré-approbation, quel que soit le score", () => {
    const v = scoreAnnonce(annonceComplete({ pricePerDay: 0, priceForSale: 0 }));
    expect(v.preApprouvee).toBe(false);
  });
});

describe("Planificateur de publication", () => {
  const planifiee = (dansMs, extra = {}) =>
    createVehicleDoc({
      status: "pending", available: false,
      publicationPlanifieeA: new Date(Date.now() + dansMs),
      ...extra,
    });

  it("publie une annonce dont l'heure est venue", async () => {
    const v = await planifiee(-60000, { title: "Annonce due" });
    expect(await publierAnnoncesDues()).toBe(1);
    const apres = await Vehicle.findById(v._id).lean();
    expect(apres.status).toBe("approved");
    expect(apres.available).toBe(true);
    // Le rendez-vous est consommé : un second tour ne doit rien republier.
    expect(apres.publicationPlanifieeA).toBeNull();
  });

  it("ne publie pas avant l'heure", async () => {
    await planifiee(DELAI_PUBLICATION_MS, { title: "Annonce à venir" });
    expect(await publierAnnoncesDues()).toBe(0);
  });

  it("ne publie JAMAIS une annonce bloquée, même échue", async () => {
    const v = await planifiee(-60000, { title: "Annonce bloquée", publicationBloqueeA: new Date() });
    expect(await publierAnnoncesDues()).toBe(0);
    expect((await Vehicle.findById(v._id).lean()).status).toBe("pending");
  });

  it("ne touche pas aux annonces sans publication programmée", async () => {
    const v = await createVehicleDoc({ status: "pending", available: false });
    expect(await publierAnnoncesDues()).toBe(0);
    expect((await Vehicle.findById(v._id).lean()).status).toBe("pending");
  });
});

describe("Blocage par un administrateur", () => {
  const admin = () => createUser({ role: "admin" });

  it("annule la publication programmée et exige un motif", async () => {
    const a = await admin();
    const v = await createVehicleDoc({ status: "pending", publicationPlanifieeA: new Date(Date.now() + 3600000) });

    const sansMotif = mockReqRes({ user: a, params: { id: v._id.toString() }, body: { bloquer: true } });
    await bloquerPublication(sansMotif.req, sansMotif.res);
    expect(sansMotif.res.statusCode).toBe(400);

    const avecMotif = mockReqRes({ user: a, params: { id: v._id.toString() }, body: { bloquer: true, motif: "Photos non conformes" } });
    await bloquerPublication(avecMotif.req, avecMotif.res);
    const apres = await Vehicle.findById(v._id).lean();
    expect(apres.publicationPlanifieeA).toBeNull();
    expect(apres.publicationBloqueeA).toBeTruthy();
    expect(apres.publicationBloqueeMotif).toBe("Photos non conformes");
    // Et le planificateur la laisse tranquille.
    expect(await publierAnnoncesDues()).toBe(0);
  });

  it("débloquer redonne la fenêtre entière, sans publier sur-le-champ", async () => {
    const a = await admin();
    const v = await createVehicleDoc({ status: "pending", publicationBloqueeA: new Date(), publicationBloqueeMotif: "à revoir" });

    const m = mockReqRes({ user: a, params: { id: v._id.toString() }, body: { bloquer: false } });
    await bloquerPublication(m.req, m.res);
    const apres = await Vehicle.findById(v._id).lean();
    expect(apres.publicationBloqueeA).toBeNull();
    expect(apres.publicationPlanifieeA.getTime()).toBeGreaterThan(Date.now());
    expect(await publierAnnoncesDues()).toBe(0);
  });

  it("refuse de bloquer une annonce déjà publiée", async () => {
    const a = await admin();
    const v = await createVehicleDoc({ status: "approved" });
    const m = mockReqRes({ user: a, params: { id: v._id.toString() }, body: { bloquer: true, motif: "trop tard" } });
    await bloquerPublication(m.req, m.res);
    expect(m.res.statusCode).toBe(409);
  });
});

describe("Récapitulatif quotidien — l'administrateur voit ce qui va paraître", () => {
  // Le délai de 24 h n'a de sens que si l'administrateur SAIT ce qui est sur le
  // point de sortir. Sans cette ligne, la fenêtre de blocage existerait sur le
  // papier et personne ne s'en servirait.
  it("liste les annonces qui paraîtront dans les 24 h", async () => {
    await createVehicleDoc({ status: "pending", available: false, title: "Annonce imminente",
      publicationPlanifieeA: new Date(Date.now() + 3600000) });
    const d = await calculerDigest();
    expect(d.publicationsImminentes.map((v) => v.title)).toContain("Annonce imminente");
  });

  it("ne liste pas une annonce bloquée", async () => {
    await createVehicleDoc({ status: "pending", available: false, title: "Annonce bloquée",
      publicationPlanifieeA: new Date(Date.now() + 3600000), publicationBloqueeA: new Date() });
    const d = await calculerDigest();
    expect(d.publicationsImminentes.map((v) => v.title)).not.toContain("Annonce bloquée");
  });
});

describe("Aucune annonce ne se perd", () => {
  // Exigence de l'exploitant (2026-09-24) : une annonce qui n'est PAS
  // pré-approuvée doit rester dans l'admin, en attente, indéfiniment. Le délai
  // de publication ne doit jamais devenir une date de péremption : rien ne
  // s'archive, ne s'efface ni ne change de statut du seul fait que le temps
  // passe. Seul un humain retire une annonce.

  const tresLoinDansLeTemps = new Date(Date.now() + 365 * 86400000);

  it("une annonce trop incomplète reste « en attente », même un an plus tard", async () => {
    const v = await createVehicleDoc({ status: "pending", available: false, publicationPlanifieeA: null });
    // Plusieurs tours du planificateur, très au-delà de tout délai.
    for (let i = 0; i < 3; i++) expect(await publierAnnoncesDues(tresLoinDansLeTemps)).toBe(0);
    const apres = await Vehicle.findById(v._id).lean();
    expect(apres).not.toBeNull();            // jamais supprimée
    expect(apres.status).toBe("pending");    // jamais publiée d'office
    expect(apres.available).toBe(false);
  });

  it("une annonce bloquée reste « en attente », indéfiniment", async () => {
    const v = await createVehicleDoc({
      status: "pending", available: false,
      publicationPlanifieeA: new Date(Date.now() - 86400000),
      publicationBloqueeA: new Date(), publicationBloqueeMotif: "Photos non conformes",
    });
    for (let i = 0; i < 3; i++) expect(await publierAnnoncesDues(tresLoinDansLeTemps)).toBe(0);
    const apres = await Vehicle.findById(v._id).lean();
    expect(apres.status).toBe("pending");
    expect(apres.publicationBloqueeMotif).toBe("Photos non conformes");
  });

  it("une annonce DÉJÀ PUBLIÉE n'est jamais touchée par le planificateur", async () => {
    const v = await createVehicleDoc({ status: "approved", available: true });
    await publierAnnoncesDues(tresLoinDansLeTemps);
    const apres = await Vehicle.findById(v._id).lean();
    expect(apres.status).toBe("approved");
    expect(apres.available).toBe(true);
  });

  it("le planificateur ne publie QUE ce qui avait rendez-vous — le reste est intact", async () => {
    const due     = await createVehicleDoc({ status: "pending", available: false, publicationPlanifieeA: new Date(Date.now() - 1000) });
    const sansRdv = await createVehicleDoc({ status: "pending", available: false, publicationPlanifieeA: null });
    const rejetee = await createVehicleDoc({ status: "rejected", available: false });

    expect(await publierAnnoncesDues()).toBe(1);

    expect((await Vehicle.findById(due._id).lean()).status).toBe("approved");
    expect((await Vehicle.findById(sansRdv._id).lean()).status).toBe("pending");
    expect((await Vehicle.findById(rejetee._id).lean()).status).toBe("rejected");
    // Et le compte y est : rien n'a disparu en chemin.
    expect(await Vehicle.countDocuments({ _id: { $in: [due._id, sansRdv._id, rejetee._id] } })).toBe(3);
  });
});
