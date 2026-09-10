import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Plafond de dimension au téléversement d'une image d'affichage.
//
// Le défaut qu'il corrige est particulièrement sournois : ImageKit ACCEPTE un
// fichier de plus de 25 mégapixels, puis refuse de le livrer. La page reçoit un
// 400 à la place de la photo, sans la moindre erreur côté serveur — l'annonce
// paraît simplement cassée, et rien dans les journaux ne l'explique. Constaté
// en production sur deux photos d'un partenaire (4872×5568, 1,5 Mo seulement :
// aucun plafond exprimé en octets ne les arrêtait).
//
// Le second piège est dans le remède. `w-2560` seul AGRANDIT les images plus
// petites que la cible : une vignette de 500 px partait stockée en 2560 px,
// huit fois plus lourde et floue. Seul `c-at_max` borne sans jamais agrandir —
// c'est cette moitié-là de la correction que ce fichier protège.

const upload = vi.fn(async () => ({
  url: "https://ik.imagekit.io/vitauto/x.jpg", fileId: "f1", name: "x.jpg",
  filePath: "/x.jpg", thumbnailUrl: null, width: 100, height: 100, size: 10,
}));

vi.mock("imagekit", () => ({ default: class { constructor() { this.upload = upload; } } }));

let uploadImage;

beforeEach(async () => {
  vi.resetModules();
  upload.mockClear();
  process.env.IMAGEKIT_PUBLIC_KEY  = "pk_test";
  process.env.IMAGEKIT_PRIVATE_KEY = "sk_test";
  process.env.IMAGEKIT_URL_ENDPOINT = "https://ik.imagekit.io/vitauto";
  ({ uploadImage } = await import("../config/imagekit.js"));
});

afterEach(() => { vi.resetModules(); });

describe("Téléversement d'image — plafond de dimension", () => {
  it("borne la largeur AVANT stockage, par défaut", async () => {
    await uploadImage("data:image/jpeg;base64,AAAA", { folder: "vit-auto/vehicles" });

    const payload = upload.mock.calls[0][0];
    expect(payload.transformation?.pre, "sans transformation `pre`, l'original démesuré est conservé tel quel")
      .toBeTruthy();
    expect(payload.transformation.pre).toMatch(/w-2560/);
  });

  it("n'agrandit JAMAIS une image plus petite que la cible", async () => {
    await uploadImage("data:image/jpeg;base64,AAAA", {});

    const { pre } = upload.mock.calls[0][0].transformation;
    // Sans `c-at_max`, ImageKit étire une vignette de 500 px jusqu'à 2560 px :
    // huit fois plus lourde, et floue.
    expect(pre, "c-at_max est ce qui distingue « borner » de « redimensionner »").toMatch(/c-at_max/);
  });

  it("laisse la main à l'appelant qui fournit sa propre transformation", async () => {
    await uploadImage("data:image/jpeg;base64,AAAA", { transformation: { pre: "w-320" } });

    expect(upload.mock.calls[0][0].transformation).toEqual({ pre: "w-320" });
  });

  it("transmet toujours le dossier, le nom et les étiquettes demandés", async () => {
    await uploadImage("data:image/jpeg;base64,AAAA", {
      folder: "vit-auto/activities", fileName: "plongee.webp", tags: ["nemo-diving"],
    });

    const payload = upload.mock.calls[0][0];
    expect(payload.folder).toBe("vit-auto/activities");
    expect(payload.fileName).toBe("plongee.webp");
    expect(payload.tags).toEqual(["nemo-diving"]);
    expect(payload.useUniqueFileName).toBe(true);
  });
});
