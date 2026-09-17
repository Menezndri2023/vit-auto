import { describe, it, expect, vi, beforeEach } from "vitest";

// Un partenaire qui publie plus d'une heure après sa connexion recevait
// « Token invalide ou expiré » : le jeton de l'état React était périmé et
// rien ne reprenait la requête. L'enveloppe de fetch corrige cela pour tout
// le front — ces tests couvrent les trois règles : jeton courant substitué,
// reprise après rafraîchissement, jamais de reprise sur les routes d'auth.
vi.mock("./tokenRefreshLock.js", () => ({ refreshAccessTokenOnce: vi.fn() }));
const { refreshAccessTokenOnce } = await import("./tokenRefreshLock.js");
const { installerRafraichissementSession, estRequeteApiAuthentifiee } = await import("./fetchSession.js");

const reponse = (status) => ({ status, ok: status < 400 });

describe("Rafraîchissement de session sur toutes les requêtes /api", () => {
  let original;
  beforeEach(() => {
    localStorage.clear();
    delete window.__vitFetchSession;
    original = vi.fn();
    refreshAccessTokenOnce.mockReset();
    installerRafraichissementSession(original);
  });

  it("remplace un jeton périmé (état React) par le jeton courant de localStorage", async () => {
    localStorage.setItem("vit-auto-token", "COURANT");
    original.mockResolvedValue(reponse(200));
    await window.fetch("/api/vehicles", { method: "POST", headers: { Authorization: "Bearer PERIME" } });
    expect(original).toHaveBeenCalledTimes(1);
    expect(original.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer COURANT");
  });

  it("rejoue UNE fois avec un jeton rafraîchi après un 401", async () => {
    localStorage.setItem("vit-auto-token", "PERIME");
    original.mockResolvedValueOnce(reponse(401)).mockResolvedValueOnce(reponse(201));
    refreshAccessTokenOnce.mockResolvedValue("NEUF");
    const res = await window.fetch("/api/vehicles", { method: "POST", headers: { Authorization: "Bearer PERIME" }, body: "{}" });
    expect(res.status).toBe(201);
    expect(original).toHaveBeenCalledTimes(2);
    expect(original.mock.calls[1][1].headers.get("Authorization")).toBe("Bearer NEUF");
    expect(original.mock.calls[1][1].body).toBe("{}");
  });

  it("rend le 401 d'origine si le rafraîchissement échoue (l'appelant décide)", async () => {
    localStorage.setItem("vit-auto-token", "PERIME");
    original.mockResolvedValue(reponse(401));
    refreshAccessTokenOnce.mockResolvedValue(null);
    const res = await window.fetch("/api/vehicles", { headers: { Authorization: "Bearer PERIME" } });
    expect(res.status).toBe(401);
    expect(original).toHaveBeenCalledTimes(1);
  });

  it("ne touche ni aux requêtes sans jeton, ni aux routes d'authentification, ni aux tiers", () => {
    const h = (a) => new Headers(a ? { Authorization: a } : {});
    expect(estRequeteApiAuthentifiee("/api/vehicles", h())).toBe(false);
    expect(estRequeteApiAuthentifiee("/api/auth/login", h("Bearer x"))).toBe(false);
    expect(estRequeteApiAuthentifiee("/api/auth/revoke-token", h("Bearer x"))).toBe(false);
    expect(estRequeteApiAuthentifiee("https://ik.imagekit.io/x.jpg", h("Bearer x"))).toBe(false);
    expect(estRequeteApiAuthentifiee("/api/vehicles", h("Bearer x"))).toBe(true);
    expect(estRequeteApiAuthentifiee("https://vit-auto-api.onrender.com/api/bookings", h("Bearer x"))).toBe(true);
  });
});
