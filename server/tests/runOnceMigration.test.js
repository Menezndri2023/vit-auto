import { describe, it, expect, vi } from "vitest";
import { runOnceMigration } from "../utils/runOnceMigration.js";
import SystemMigration from "../models/SystemMigration.js";

// Bug réel évité (audit) : dépendre d'un script manuel qu'un opérateur doit
// se souvenir de lancer après déploiement a directement causé un incident
// (Vehicle.currency jamais réinitialisé, gelant l'affichage de toutes les
// annonces existantes en USD). runOnceMigration rend ce type de migration
// automatique au démarrage, sans jamais la rejouer une fois appliquée.
describe("runOnceMigration", () => {
  it("exécute la migration et enregistre le marqueur", async () => {
    const fn = vi.fn().mockResolvedValue();
    await runOnceMigration("test-migration-1", fn);

    expect(fn).toHaveBeenCalledTimes(1);
    const marker = await SystemMigration.findOne({ name: "test-migration-1" });
    expect(marker).toBeTruthy();
  });

  it("ne rejoue jamais une migration déjà marquée comme appliquée", async () => {
    const fn = vi.fn().mockResolvedValue();
    await runOnceMigration("test-migration-2", fn);
    await runOnceMigration("test-migration-2", fn);
    await runOnceMigration("test-migration-2", fn);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("ne marque PAS comme appliquée si la migration échoue — retentée au prochain appel", async () => {
    const failing = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce();

    await runOnceMigration("test-migration-3", failing);
    let marker = await SystemMigration.findOne({ name: "test-migration-3" });
    expect(marker).toBeNull();

    await runOnceMigration("test-migration-3", failing);
    marker = await SystemMigration.findOne({ name: "test-migration-3" });
    expect(marker).toBeTruthy();
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
