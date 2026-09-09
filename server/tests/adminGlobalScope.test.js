import { describe, it, expect } from "vitest";
import mongoose from "mongoose";

import { getLeads, getQuotes } from "../controllers/pmsController.js";
import { getPartnerContracts } from "../controllers/contractController.js";
import { listImportBatches } from "../controllers/vehicleImportController.js";
import Lead from "../models/Lead.js";
import Quote from "../models/Quote.js";
import Contract from "../models/Contract.js";
import VehicleImportBatch from "../models/VehicleImportBatch.js";
import { createUser } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// Portée de l'administrateur GÉNÉRAL.
//
// Plusieurs listes partaient de l'identifiant du demandeur ({ partnerId:
// req.user._id }, { owner: req.user._id }, ou les véhicules lui appartenant).
// Un administrateur ne possède ni lead, ni devis, ni véhicule, ni lot importé :
// ces écrans lui renvoyaient donc TOUJOURS une liste vide. Pas un trou de
// sécurité — l'admin était sous-provisionné, jamais sur-exposé — mais une
// supervision impossible, et silencieuse (une liste vide ressemble à « aucune
// donnée » et non à « vous n'avez pas accès »).

const appeler = async (fn, { user, query = {} } = {}) => {
  const { req, res } = mockReqRes({ user, query });
  await fn(req, res);
  return res;
};

const admin     = () => createUser({ role: "admin" });
const partenaire = () => createUser({ role: "partenaire" });

describe("Administrateur général — portée des listes", () => {
  it("voit les leads PMS de TOUS les partenaires", async () => {
    const [a, p1, p2] = await Promise.all([admin(), partenaire(), partenaire()]);
    await Lead.create([{ partnerId: p1._id }, { partnerId: p2._id }]);

    const res = await appeler(getLeads, { user: a });
    expect(res.body.total).toBe(2);
    // Une liste multi-partenaires n'est lisible que si chaque ligne dit à qui
    // elle appartient.
    expect(res.body.leads[0].partnerId?.email).toBeTruthy();
  });

  it("peut cibler un seul partenaire avec ?partnerId=", async () => {
    const [a, p1, p2] = await Promise.all([admin(), partenaire(), partenaire()]);
    await Lead.create([{ partnerId: p1._id }, { partnerId: p2._id }]);

    const res = await appeler(getLeads, { user: a, query: { partnerId: String(p1._id) } });
    expect(res.body.total).toBe(1);
    expect(String(res.body.leads[0].partnerId._id)).toBe(String(p1._id));
  });

  it("un partenaire, lui, ne voit QUE ses propres leads", async () => {
    // Garde-fou : c'est bien l'admin qui est élargi, pas la restriction qui
    // aurait sauté pour tout le monde.
    const [p1, p2] = await Promise.all([partenaire(), partenaire()]);
    await Lead.create([{ partnerId: p1._id }, { partnerId: p2._id }]);

    const res = await appeler(getLeads, { user: p1 });
    expect(res.body.total).toBe(1);
  });

  it("voit les devis PMS de tous les partenaires", async () => {
    const [a, p1, p2] = await Promise.all([admin(), partenaire(), partenaire()]);
    await Quote.create([
      { partnerId: p1._id, quoteNumber: "Q-A-1", items: [{ description: "Transport", unitPrice: 10, quantity: 1 }] },
      { partnerId: p2._id, quoteNumber: "Q-B-1", items: [{ description: "Transport", unitPrice: 10, quantity: 1 }] },
    ]);

    const res = await appeler(getQuotes, { user: a });
    expect(res.body.total).toBe(2);
  });

  it("voit les contrats de tous les partenaires", async () => {
    const a = await admin();
    await Contract.create([
      { booking: new mongoose.Types.ObjectId(), type: "location", contractNumber: "CT-1" },
      { booking: new mongoose.Types.ObjectId(), type: "chauffeur", contractNumber: "CT-2" },
    ]);

    const res = await appeler(getPartnerContracts, { user: a });
    expect(res.body.contracts).toHaveLength(2);
  });

  it("un partenaire sans véhicule ne voit aucun contrat", async () => {
    const p = await partenaire();
    await Contract.create({ booking: new mongoose.Types.ObjectId(), type: "location", contractNumber: "CT-3" });

    const res = await appeler(getPartnerContracts, { user: p });
    expect(res.body.contracts).toHaveLength(0);
  });

  it("voit les lots d'import de flotte de tous les partenaires", async () => {
    const [a, p1, p2] = await Promise.all([admin(), partenaire(), partenaire()]);
    await VehicleImportBatch.create([
      { owner: p1._id, source: "csv" },
      { owner: p2._id, source: "excel" },
    ]);

    const res = await appeler(listImportBatches, { user: a });
    expect(res.body.batches).toHaveLength(2);
  });

  it("un partenaire ne voit que ses propres lots d'import", async () => {
    const [p1, p2] = await Promise.all([partenaire(), partenaire()]);
    await VehicleImportBatch.create([
      { owner: p1._id, source: "csv" },
      { owner: p2._id, source: "excel" },
    ]);

    const res = await appeler(listImportBatches, { user: p1 });
    expect(res.body.batches).toHaveLength(1);
  });
});
