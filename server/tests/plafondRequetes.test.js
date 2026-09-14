import { describe, it, expect, vi } from "vitest";
import Notification from "../models/Notification.js";
import { PLAFOND } from "../utils/plafondRequetes.js";
import logger from "../utils/logger.js";
import { createUser } from "./helpers/fixtures.js";

// utils/plafondRequetes.js : tout find() sans limite explicite est plafonné
// à PLAFOND documents ; `.limit(0)` explicite = tout ; `.limit(n)` respecté.
// Une troncature silencieuse est le défaut le plus difficile à voir en
// production (« une liste tronquée ressemble à une liste complète ») : on
// vérifie donc aussi que l'AVERTISSEMENT part, et qu'il ne part pas à tort.
describe("Plafond global des find()", () => {
  it("plafonne un find() sans limite, respecte limit(n) et limit(0)", async () => {
    const u = await createUser();
    const docs = Array.from({ length: PLAFOND + 25 }, (_, i) => ({ user: u._id, type: "system", titre: `n${i}`, message: "x", skipEmail: true }));
    await Notification.insertMany(docs);
    expect((await Notification.find({ user: u._id }).lean()).length).toBe(PLAFOND);
    expect((await Notification.find({ user: u._id }).limit(10).lean()).length).toBe(10);
    expect((await Notification.find({ user: u._id }).limit(0).lean()).length).toBe(PLAFOND + 25);
    expect(await Notification.countDocuments({ user: u._id })).toBe(PLAFOND + 25);
  });

  it("avertit quand le plafond mord, et seulement dans ce cas", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const u = await createUser();
    await Notification.insertMany(Array.from({ length: PLAFOND }, (_, i) => ({ user: u._id, type: "system", titre: `n${i}`, message: "x", skipEmail: true })));

    await Notification.find({ user: u._id }).lean();            // plafonné → avertissement
    await new Promise((r) => setTimeout(r, 50));                 // post-hook asynchrone
    expect(warn.mock.calls.some(([m]) => /\[plafond\] Notification\.find\(\)/.test(String(m)))).toBe(true);

    warn.mockClear();
    await Notification.find({ user: u._id }).limit(0).lean();   // explicite → silence
    await Notification.find({ user: u._id, titre: "n1" }).lean(); // sous le plafond → silence
    await new Promise((r) => setTimeout(r, 50));
    expect(warn.mock.calls.some(([m]) => /\[plafond\]/.test(String(m)))).toBe(false);
    warn.mockRestore();
  });
});
