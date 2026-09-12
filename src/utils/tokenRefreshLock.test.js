import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { refreshAccessTokenOnce } from "./tokenRefreshLock.js";

// Deux onglets partagent le même refresh token et le même minuteur : ils
// envoyaient le MÊME jeton au même instant, le second passait pour un rejeu
// et le serveur fermait toutes les sessions du compte. Le verrou entre
// onglets, posé dans localStorage, l'empêche.

describe("Rafraîchissement du jeton entre onglets", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("vit-auto-refresh", "refresh-partagé");
    localStorage.setItem("vit-auto-token", "acces-ancien");
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("attend l'autre onglet et reprend le jeton qu'il a écrit, sans rafraîchir lui-même", async () => {
    localStorage.setItem("vit-auto-refresh-lock", String(Date.now()));   // l'autre onglet est en cours
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const promesse = refreshAccessTokenOnce();
    await vi.advanceTimersByTimeAsync(600);
    localStorage.setItem("vit-auto-token", "acces-nouveau-par-autre-onglet");   // l'autre onglet termine
    await vi.advanceTimersByTimeAsync(300);
    await expect(promesse).resolves.toBe("acces-nouveau-par-autre-onglet");
    expect(fetchSpy, "aucun second appel de rafraîchissement").not.toHaveBeenCalled();
  });

  it("un verrou périmé (onglet fermé en plein rafraîchissement) ne bloque pas", async () => {
    localStorage.setItem("vit-auto-refresh-lock", String(Date.now() - 60_000));
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ token: "acces-neuf", refreshToken: "refresh-neuf" }) });
    const promesse = refreshAccessTokenOnce();
    await vi.advanceTimersByTimeAsync(0);
    await expect(promesse).resolves.toBe("acces-neuf");
    expect(localStorage.getItem("vit-auto-refresh")).toBe("refresh-neuf");
    expect(localStorage.getItem("vit-auto-refresh-lock"), "verrou levé après coup").toBeNull();
  });

  it("le refresh token envoyé est celui relu APRÈS l'attente, pas celui d'avant", async () => {
    localStorage.setItem("vit-auto-refresh-lock", String(Date.now()));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ token: "t2", refreshToken: "r2" }) });
    const promesse = refreshAccessTokenOnce();
    // l'autre onglet fait tourner le refresh token puis relâche SANS avoir écrit de jeton d'accès
    await vi.advanceTimersByTimeAsync(300);
    localStorage.setItem("vit-auto-refresh", "refresh-tourné-par-autre");
    localStorage.removeItem("vit-auto-refresh-lock");
    await vi.advanceTimersByTimeAsync(300);
    await promesse;
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).refreshToken).toBe("refresh-tourné-par-autre");
  });
});
