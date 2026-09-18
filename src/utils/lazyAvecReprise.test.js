import { describe, it, expect, vi } from "vitest";
import { importerAvecReprise } from "./lazyAvecReprise.js";

// « Importing a module script failed. » sur le panneau admin (exploitant,
// 2026-09-18) : une page différée dont le fichier n'arrive pas — réseau qui
// décroche ou déploiement entre deux clics — affichait l'écran d'erreur dès
// la première tentative.
describe("Chargement différé avec reprise", () => {
  it("réessaie un import qui échoue par un défaut de chargement, puis réussit", async () => {
    vi.useFakeTimers();
    const chargeur = vi.fn()
      .mockRejectedValueOnce(new Error("Importing a module script failed."))
      .mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module: /assets/AdminPanel-x.js"))
      .mockResolvedValue({ default: "Page" });
    const p = importerAvecReprise(chargeur);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await p).toEqual({ default: "Page" });
    expect(chargeur).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("ne réessaie PAS une erreur qui n'est pas un défaut de chargement (bug de la page)", async () => {
    const chargeur = vi.fn().mockRejectedValue(new ReferenceError("x is not defined"));
    await expect(importerAvecReprise(chargeur)).rejects.toThrow(/x is not defined/);
    expect(chargeur).toHaveBeenCalledTimes(1);
  });

  it("après trois échecs, recharge UNE fois avec un cache-buster, puis laisse l'erreur remonter dans les 30 s", async () => {
    vi.useFakeTimers();
    sessionStorage.clear();
    const replace = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { href: "https://vit-auto.com/admin?tab=kyc", replace } });
    const chargeur = vi.fn().mockRejectedValue(new Error("Importing a module script failed."));
    const p1 = importerAvecReprise(chargeur);
    p1.catch(() => {}); // jamais résolue quand le rechargement prend la main
    await vi.advanceTimersByTimeAsync(2100);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toMatch(/^https:\/\/vit-auto\.com\/admin\?tab=kyc&v=\d{13}$/);
    void p1; // ne se résout jamais : le rechargement prend la main
    // Second échec dans la foulée (nouvelle version toujours cassée) : pas de boucle.
    const attente = expect(importerAvecReprise(chargeur)).rejects.toThrow(/module script failed/);
    await vi.advanceTimersByTimeAsync(2100);
    await attente;
    expect(replace).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, "location", { configurable: true, value: original });
    vi.useRealTimers();
  });
});
