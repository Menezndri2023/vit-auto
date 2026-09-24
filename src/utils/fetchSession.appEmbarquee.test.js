import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── L'app embarquée doit réécrire AUSSI les appels publics ────────────────
// L'enrobage de fetch ne s'occupait jusqu'ici que des requêtes portant un
// « Bearer » : tout le reste repartait tel quel. Dans l'app native, ce « reste »
// est justement le catalogue, les vitrines, la page d'accueil — tout ce qu'un
// visiteur voit AVANT de se connecter. S'ils ne sont pas réécrits, l'app
// s'ouvre sur une coquille vide et c'est la seule chose que le reviewer Apple
// verra. D'où un test dédié : la réécriture doit précéder le test du jeton.
vi.mock("./tokenRefreshLock.js", () => ({ refreshAccessTokenOnce: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));

const { installerRafraichissementSession } = await import("./fetchSession.js");
const reponse = (status) => ({ status, ok: status < 400 });
const urlDe = (appel) => (typeof appel === "string" ? appel : appel.url);

describe("Interface embarquée — réécriture des URL par l'enrobage de fetch", () => {
  let original;
  beforeEach(() => {
    localStorage.clear();
    delete window.__vitFetchSession;
    original = vi.fn().mockResolvedValue(reponse(200));
    installerRafraichissementSession(original);
  });
  afterEach(() => { delete window.__vitFetchSession; });

  it("réécrit un appel PUBLIC, sans jeton — le catalogue d'un visiteur", async () => {
    await window.fetch("/api/vehicles?country=CI");
    expect(urlDe(original.mock.calls[0][0])).toBe("https://vit-auto.com/api/vehicles?country=CI");
  });

  it("réécrit aussi un appel authentifié, et garde la substitution du jeton", async () => {
    localStorage.setItem("vit-auto-token", "COURANT");
    await window.fetch("/api/bookings/mine", { headers: { Authorization: "Bearer PERIME" } });
    expect(urlDe(original.mock.calls[0][0])).toBe("https://vit-auto.com/api/bookings/mine");
    expect(original.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer COURANT");
  });

  // Un objet Request résout TOUJOURS son URL contre la page : « /api/x » y
  // devient « <origine du paquet>/api/x ». C'est cette forme absolue que la
  // réécriture doit reconnaître — la forme relative n'existe jamais ici.
  it("réécrit un objet Request sans perdre sa méthode ni ses en-têtes", async () => {
    const requete = new Request(`${window.location.origin}/api/activities`, { method: "POST", headers: { "X-Test": "1" } });
    await window.fetch(requete);
    const envoye = original.mock.calls[0][0];
    expect(envoye.url).toBe("https://vit-auto.com/api/activities");
    expect(envoye.method).toBe("POST");
    expect(envoye.headers.get("X-Test")).toBe("1");
  });

  it("ne touche pas aux ressources externes ni au paquet embarqué", async () => {
    for (const url of ["https://ik.imagekit.io/vitauto/p.jpg", "/assets/index-abc.js", "/icons/icon-192.png"]) {
      original.mockClear();
      await window.fetch(url);
      expect(urlDe(original.mock.calls[0][0])).toBe(url);
    }
  });
});
