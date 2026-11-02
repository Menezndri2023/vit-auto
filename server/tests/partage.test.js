import { describe, it, expect } from "vitest";

const { apercuVehicule, apercuVitrine } = await import("../controllers/partageController.js");
const { default: User } = await import("../models/User.js");
const { createUser, createVehicleDoc } = await import("./helpers/fixtures.js");
const { mockReqRes } = await import("./helpers/mockReqRes.js");

// Aperçus de partage (2026-11-02) : les robots de WhatsApp, Facebook… lisent
// ces pages au lieu de l'application, qu'ils n'exécutent pas.
const appel = async (fn, params) => { const m = mockReqRes({ params }); await fn(m.req, m.res); return m.res; };
const balise = (html, prop) => (html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`)) || [])[1];

describe("Aperçu d'une annonce partagée", () => {
  it("titre, prix tel que saisi par le partenaire, ville et photo de l'annonce", async () => {
    const v = await createVehicleDoc({
      title: "Dacia Duster 2021 <script>", ville: "Casablanca",
      pricePerDay: 35.29, pricePerDayEntered: 350, priceEntryCurrency: "MAD",
      images: ["https://ik.imagekit.io/vitauto/vit-auto/vehicles/duster.jpg"],
    });
    const res = await appel(apercuVehicule, { id: String(v._id) });
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toMatch(/text\/html/);
    expect(balise(res.body, "og:title")).toBe("Dacia Duster 2021 &lt;script&gt; — à louer sur VIT AUTO");
    expect(balise(res.body, "og:description").replace(/\s/g, " ")).toMatch(/^350 MAD \/ jour · Casablanca/);
    expect(balise(res.body, "og:image")).toBe("https://ik.imagekit.io/vitauto/vit-auto/vehicles/duster.jpg?tr=w-1200,h-630,c-at_max");
    expect(balise(res.body, "og:url")).toBe(`https://vit-auto.com/vehicle/${v._id}`);
    expect(res.body).not.toMatch(/<script>/);
  });

  it("annonce non publiée ou identifiant invalide : aperçu générique du site, jamais d'erreur ni de fuite", async () => {
    const enAttente = await createVehicleDoc({ title: "Annonce en modération", status: "pending" });
    for (const id of [String(enAttente._id), "pas-un-id"]) {
      const res = await appel(apercuVehicule, { id });
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toMatch(/modération/);
      expect(balise(res.body, "og:image")).toBe("https://vit-auto.com/og-vit-auto.jpg");
    }
  });

  it("photo en base64 : remplacée par le visuel du site (un robot ne la lirait pas)", async () => {
    const v = await createVehicleDoc({ images: ["data:image/jpeg;base64,AAAA"] });
    const res = await appel(apercuVehicule, { id: String(v._id) });
    expect(balise(res.body, "og:image")).toBe("https://vit-auto.com/og-vit-auto.jpg");
  });
});

describe("Aperçu d'une vitrine partenaire", () => {
  it("nom de l'entreprise, nombre d'annonces publiées et photo de l'une d'elles", async () => {
    const p = await createUser({ role: "partenaire", business: { companyName: "Atlas Location" } });
    await User.updateOne({ _id: p._id }, { $set: { vitrineSlug: "atlas-location" } });
    await createVehicleDoc({ owner: p._id, images: ["https://ik.imagekit.io/vitauto/a.jpg"] });
    await createVehicleDoc({ owner: p._id });
    const res = await appel(apercuVitrine, { slug: "atlas-location" });
    expect(balise(res.body, "og:title")).toBe("Atlas Location — sur VIT AUTO");
    expect(balise(res.body, "og:description")).toMatch(/^2 annonces à louer ou à vendre/);
    expect(balise(res.body, "og:image")).toMatch(/^https:\/\/ik\.imagekit\.io\/vitauto\/a\.jpg\?tr=/);
  });
});
