import { describe, it, expect } from "vitest";
import { cacheGet, cacheSet } from "../utils/catalogCache.js";
import Vehicle from "../models/Vehicle.js";
import ImportExportListing from "../models/ImportExportListing.js";
import Activity from "../models/Activity.js";
import Driver from "../models/Driver.js";
import { createUser, createVehicleDoc, createActivityDoc, createDriverDoc, createListing } from "./helpers/fixtures.js";

// Le cache catalogue n'était jamais invalidé : une annonce vendue restait
// listée jusqu'à trente secondes et son ouverture répondait « introuvable ».
// Chaque écriture sur un modèle listé le vide, quel que soit le chemin
// d'écriture — save() comme les mises à jour par requête.
describe("Cache catalogue — invalidation à l'écriture", () => {
  const remplir = () => { cacheSet("v:test", { ok: true }); expect(cacheGet("v:test")).toEqual({ ok: true }); };

  it("Vehicle : save, findOneAndUpdate, updateOne et deleteOne vident le cache", async () => {
    const owner = await createUser({ role: "partenaire" });
    remplir();
    const v = await createVehicleDoc({ owner: owner._id, status: "approved" });
    expect(cacheGet("v:test")).toBeUndefined();
    remplir(); await Vehicle.findByIdAndUpdate(v._id, { status: "sold" }); expect(cacheGet("v:test")).toBeUndefined();
    remplir(); await Vehicle.updateOne({ _id: v._id }, { available: false }); expect(cacheGet("v:test")).toBeUndefined();
    remplir(); await Vehicle.deleteOne({ _id: v._id }); expect(cacheGet("v:test")).toBeUndefined();
  });

  it("ImportExportListing : la mise à jour par requête (annonce vendue) vide le cache", async () => {
    const l = await createListing();
    remplir();
    await ImportExportListing.findByIdAndUpdate(l._id, { status: "sold" });
    expect(cacheGet("v:test")).toBeUndefined();
  });

  it("Activity et Driver : idem", async () => {
    const owner = await createUser({ role: "partenaire" });
    remplir(); const a = await createActivityDoc({ owner: owner._id }); expect(cacheGet("v:test")).toBeUndefined();
    remplir(); await Activity.updateOne({ _id: a._id }, { status: "archived" }); expect(cacheGet("v:test")).toBeUndefined();
    remplir(); const d = await createDriverDoc({ owner: owner._id }); expect(cacheGet("v:test")).toBeUndefined();
    remplir(); await Driver.findOneAndUpdate({ _id: d._id }, { status: "archived" }); expect(cacheGet("v:test")).toBeUndefined();
  });

  it("une lecture ne vide pas le cache", async () => {
    remplir();
    await Vehicle.find({}).limit(1).lean();
    expect(cacheGet("v:test")).toEqual({ ok: true });
  });
});
