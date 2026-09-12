import { describe, it, expect } from "vitest";
import SchedulerLock, { avecVerrou } from "../utils/schedulerLock.js";

// Verrou partagé entre instances d'API (utils/schedulerLock.js) : deux
// instances qui lancent le même cycle au même instant ne doivent l'exécuter
// qu'une fois — un rappel envoyé en double est un bug réel possible dès que
// Render fait tourner deux instances ou chevauche un redéploiement.
describe("schedulerLock — un seul cycle à la fois", () => {
  it("n'exécute qu'une seule des deux prises simultanées", async () => {
    let executions = 0;
    const cycle = async () => { executions += 1; await new Promise((r) => setTimeout(r, 200)); return "fait"; };
    const [a, b] = await Promise.all([avecVerrou("test", 60000, cycle), avecVerrou("test", 60000, cycle)]);
    expect(executions).toBe(1);
    expect([a.skipped, b.skipped].sort()).toEqual([false, true]);
  });

  it("libère le verrou à la fin du cycle et reprend après expiration", async () => {
    let n = 0;
    await avecVerrou("cycle", 60000, async () => { n += 1; });
    await avecVerrou("cycle", 60000, async () => { n += 1; });
    expect(n).toBe(2);

    // Instance morte en plein cycle : verrou non libéré mais expiré → reprise.
    await SchedulerLock.updateOne({ _id: "mort" }, { $set: { holder: "autre#1", expiresAt: new Date(Date.now() - 1000) } }, { upsert: true });
    const r = await avecVerrou("mort", 60000, async () => "repris");
    expect(r).toEqual({ skipped: false, result: "repris" });

    // Verrou d'une autre instance encore valide → saut.
    await SchedulerLock.updateOne({ _id: "occupe" }, { $set: { holder: "autre#2", expiresAt: new Date(Date.now() + 60000) } }, { upsert: true });
    expect((await avecVerrou("occupe", 60000, async () => "jamais")).skipped).toBe(true);
  });

  it("libère le verrou même si le cycle lève une exception", async () => {
    await expect(avecVerrou("casse", 60000, async () => { throw new Error("boum"); })).rejects.toThrow("boum");
    const r = await avecVerrou("casse", 60000, async () => "ok");
    expect(r.skipped).toBe(false);
  });
});
