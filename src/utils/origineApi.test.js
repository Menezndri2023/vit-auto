import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Interface embarquée : où partent les appels ? ──────────────────────────
// Sur le web, le front et l'API partagent le domaine : « /api/… » suffit, et
// RIEN ne doit changer — 507 appels en dépendent. Dans l'app, le paquet est
// servi par un serveur local et le même chemin désigne le paquet lui-même :
// sans réécriture, toute l'app répond 404 depuis sa propre coquille.
//
// `Capacitor.isNativePlatform()` est lu à l'import du module : chaque cas
// recharge donc origineApi.js avec le double voulu.
const chargerAvec = async (natif, env = {}) => {
  vi.resetModules();
  vi.doMock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => natif } }));
  vi.stubEnv("VITE_API_URL", env.VITE_API_URL ?? "");
  return import("./origineApi.js");
};

afterEach(() => { vi.unstubAllEnvs(); vi.doUnmock("@capacitor/core"); });

describe("origineApi — sur le WEB, rien ne bouge", () => {
  it("ne préfixe aucun chemin", async () => {
    const { ORIGINE_API, absolutiserApi } = await chargerAvec(false);
    expect(ORIGINE_API).toBe("");
    expect(absolutiserApi("/api/vehicles")).toBe("/api/vehicles");
    expect(absolutiserApi("/socket.io/")).toBe("/socket.io/");
  });

  it("ignore VITE_API_URL, qui ne concerne que l'app", async () => {
    const { ORIGINE_API } = await chargerAvec(false, { VITE_API_URL: "https://autre.test" });
    expect(ORIGINE_API).toBe("");
  });
});

describe("origineApi — dans l'APP, les chemins d'API deviennent absolus", () => {
  it("vise vit-auto.com par défaut, jamais l'hébergeur", async () => {
    const { ORIGINE_API, absolutiserApi } = await chargerAvec(true);
    // Pointer Render en dur s'est retourné contre le projet à la migration
    // Railway → Render ; ici le coût serait une vérification Apple.
    expect(ORIGINE_API).toBe("https://vit-auto.com");
    expect(absolutiserApi("/api/vehicles")).toBe("https://vit-auto.com/api/vehicles");
    expect(absolutiserApi("/api/vehicles?country=CI")).toBe("https://vit-auto.com/api/vehicles?country=CI");
    expect(absolutiserApi("/socket.io/")).toBe("https://vit-auto.com/socket.io/");
  });

  it("laisse intact tout ce qui n'est pas un chemin d'API", async () => {
    const { absolutiserApi } = await chargerAvec(true);
    for (const url of [
      "https://ik.imagekit.io/vitauto/photo.jpg",
      "https://nominatim.openstreetmap.org/reverse",
      "/assets/index-abc123.js",
      "/icons/icon-192.png",
      "blob:vitauto://localhost/9f2c",
      "data:image/png;base64,iVBOR",
    ]) expect(absolutiserApi(url)).toBe(url);
  });

  // « /apidoc » ou « /apiculture » ne sont pas des appels d'API : la frontière
  // du segment doit être respectée, sinon on fabrique des URL absurdes.
  it("ne se déclenche que sur le segment exact", async () => {
    const { absolutiserApi } = await chargerAvec(true);
    expect(absolutiserApi("/apidoc")).toBe("/apidoc");
    expect(absolutiserApi("/api")).toBe("https://vit-auto.com/api");
    expect(absolutiserApi("/api?x=1")).toBe("https://vit-auto.com/api?x=1");
  });

  it("accepte une surcharge ABSOLUE et rejette « /api », que le CI met par défaut", async () => {
    const abs = await chargerAvec(true, { VITE_API_URL: "https://preprod.vit-auto.com/" });
    expect(abs.ORIGINE_API).toBe("https://preprod.vit-auto.com");

    // « /api » interprété comme une origine donnerait « /apihttps://… ».
    const rel = await chargerAvec(true, { VITE_API_URL: "/api" });
    expect(rel.ORIGINE_API).toBe("https://vit-auto.com");
  });

  it("ne bronche pas sur une entrée vide ou absente", async () => {
    const { absolutiserApi } = await chargerAvec(true);
    expect(absolutiserApi(undefined)).toBe(undefined);
    expect(absolutiserApi("")).toBe("");
  });
});

describe("Liens partageables — ils doivent SORTIR de l'app", () => {
  it("dans l'app, visent le site public et non le paquet embarqué", async () => {
    const { ORIGINE_SITE, lienPublic, lienPublicCourant } = await chargerAvec(true);
    expect(ORIGINE_SITE).toBe("https://vit-auto.com");
    // Parrainage : ce lien part dans un message, quelqu'un d'autre l'ouvre.
    // « vitauto://localhost/register?ref=X » n'est ouvrable par personne.
    expect(lienPublic("/register?ref=ABC123")).toBe("https://vit-auto.com/register?ref=ABC123");
    expect(lienPublic("/partner-onboarding")).toBe("https://vit-auto.com/partner-onboarding");
    expect(lienPublicCourant().startsWith("https://vit-auto.com/")).toBe(true);
    expect(lienPublicCourant()).not.toContain("localhost");
  });

  it("sur le web, restent sur le domaine courant", async () => {
    const { ORIGINE_SITE, lienPublic } = await chargerAvec(false);
    expect(ORIGINE_SITE).toBe(window.location.origin);
    expect(lienPublic("/register?ref=ABC123")).toBe(`${window.location.origin}/register?ref=ABC123`);
  });
});
