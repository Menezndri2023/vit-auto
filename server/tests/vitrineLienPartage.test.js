import { describe, it, expect } from "vitest";
import User from "../models/User.js";
import { maVitrine, vitrineDunPartenaire, resoudreSlug, origineSite, SITE_PUBLIC } from "../controllers/vitrinePartenaireController.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";
import { mockReqRes } from "./helpers/mockReqRes.js";

// ═══════════════════════════════════════════════════════════════════════════
// CHAQUE PARTENAIRE A UN LIEN DE VITRINE — OCTROYÉ SELON SON PLAN
// ═══════════════════════════════════════════════════════════════════════════
// Consigne de l'exploitant (2026-09-25) : « chaque partenaire VIT AUTO dispose
// d'un lien (vitrine) qu'il peut partager », ne contenant que ses annonces ;
// l'administrateur peut partager ces liens ; ils sont octroyés selon le plan.
//
// Ce qui manquait n'était pas la page — /partner/:id existait — mais le LIEN :
// rien, nulle part, ne le donnait au partenaire ni à l'administrateur.

const appeler = async (handler, { user = null, params = {} } = {}) => {
  const { req, res } = mockReqRes({ user, params });
  await handler(req, res);
  return res;
};

describe("Vitrine partenaire — le lien partageable", () => {
  it("rend au partenaire une adresse qui pointe sur SA vitrine", async () => {
    const p = await createUser({ role: "partenaire" });
    await createVehicleDoc({ owner: p._id, status: "approved", available: true });

    const res = await appeler(maVitrine, { user: p });
    expect(res.body.lien).toBe(`${SITE_PUBLIC}/partner/${p._id}`);
    expect(res.body.annonces).toBe(1);
  });

  // La page reste publique à tous les paliers — c'est le lien COURT qui
  // s'achète. Jusqu'à FIN_IMMUNITE_QUOTAS, tout partenaire garde ses outils :
  // le lien court est donc ouvert AUJOURD'HUI, et le test le constate plutôt
  // que de le supposer.
  it("fournit un lien court et un QR code quand l'outil est ouvert", async () => {
    const p = await createUser({ role: "partenaire", business: { companyName: "Rent à Car Côte d'Azur" } });
    const res = await appeler(maVitrine, { user: p });

    expect(res.body.lienCourtOuvert).toBe(true);
    expect(res.body.slug).toBe("rent-a-car-cote-d-azur");
    expect(res.body.lienCourt).toBe(`${SITE_PUBLIC}/p/rent-a-car-cote-d-azur`);
    expect(res.body.qr).toMatch(/^data:image\/png;base64,/);
  });

  // Une adresse publique ne bouge pas : un partenaire peut l'avoir imprimée.
  it("ne réattribue jamais un slug déjà donné, même si le nom change", async () => {
    const p = await createUser({ role: "partenaire", business: { companyName: "Atlas Location" } });
    const premier = (await appeler(maVitrine, { user: p })).body.slug;

    await User.updateOne({ _id: p._id }, { $set: { "business.companyName": "Atlas Premium" } });
    const second = (await appeler(maVitrine, { user: p })).body.slug;

    expect(second).toBe(premier);
    expect(second).toBe("atlas-location");
  });

  it("deux partenaires de même nom obtiennent deux adresses distinctes", async () => {
    const a = await createUser({ role: "partenaire", business: { companyName: "Auto Plus" } });
    const b = await createUser({ role: "partenaire", business: { companyName: "Auto Plus" } });

    const sa = (await appeler(maVitrine, { user: a })).body.slug;
    const sb = (await appeler(maVitrine, { user: b })).body.slug;
    expect(sa).toBe("auto-plus");
    expect(sb).toBe("auto-plus-2");
  });

  // Écrit d'abord avec un nom VIDE — mais le modèle exige un prénom et un nom,
  // donc ce cas n'existe pas. Le vrai cas est celui-ci, et le site est publié
  // en arabe : une raison sociale entièrement non latine se normalise à vide,
  // et sans repli le partenaire obtiendrait une adresse `/p/` sans nom.
  it("une raison sociale non latine obtient tout de même une adresse", async () => {
    const p = await createUser({ role: "partenaire", business: { companyName: "شركة تأجير السيارات" } });
    const res = await appeler(maVitrine, { user: p });
    expect(res.body.slug).toMatch(/^partenaire-[0-9a-f]{6}$/);
    expect(res.body.lienCourt).toBe(`${SITE_PUBLIC}/p/${res.body.slug}`);
  });

  describe("Partage par l'administrateur", () => {
    it("l'admin obtient le lien de n'importe quel partenaire", async () => {
      const admin = await createUser({ role: "admin" });
      const p = await createUser({ role: "partenaire", business: { companyName: "Boyzone Car" } });

      const res = await appeler(vitrineDunPartenaire, { user: admin, params: { id: String(p._id) } });
      expect(res.body.lien).toBe(`${SITE_PUBLIC}/partner/${p._id}`);
      expect(res.body.lienCourt).toBe(`${SITE_PUBLIC}/p/boyzone-car`);
      expect(res.body.partageParAdmin).toBe(true);
    });

    // Le palier lu doit être celui du PARTENAIRE. Si le passe-droit
    // administrateur de `outilOuvert` s'appliquait ici, « octroyé selon le
    // plan » cesserait de vouloir dire quoi que ce soit dès qu'un admin
    // partage — et l'admin verrait un lien court que le partenaire n'a pas.
    it("lit le palier du partenaire, pas celui de l'administrateur", async () => {
      const admin = await createUser({ role: "admin" });
      const p = await createUser({ role: "partenaire", business: { companyName: "Plan Gratuit" } });

      const vueAdmin = (await appeler(vitrineDunPartenaire, { user: admin, params: { id: String(p._id) } })).body;
      const vuePartenaire = (await appeler(maVitrine, { user: p })).body;
      expect(vueAdmin.lienCourtOuvert).toBe(vuePartenaire.lienCourtOuvert);
      expect(vueAdmin.lienCourt).toBe(vuePartenaire.lienCourt);
    });

    it("refuse un compte fermé, un client, ou un identifiant inconnu", async () => {
      const admin = await createUser({ role: "admin" });
      const ferme = await createUser({ role: "partenaire", isActive: false });
      const client = await createUser({ role: "client" });

      for (const id of [String(ferme._id), String(client._id), "000000000000000000000000"]) {
        const res = await appeler(vitrineDunPartenaire, { user: admin, params: { id } });
        expect(res.statusCode, `id=${id}`).toBe(404);
      }
    });
  });

  describe("Résolution publique du lien court", () => {
    it("traduit l'adresse lisible en identifiant", async () => {
      const p = await createUser({ role: "partenaire", business: { companyName: "Nemo Diving" } });
      await appeler(maVitrine, { user: p });

      const res = await appeler(resoudreSlug, { params: { slug: "nemo-diving" } });
      expect(res.body.id).toBe(String(p._id));
    });

    it("accepte la casse et les espaces d'un lien recopié à la main", async () => {
      const p = await createUser({ role: "partenaire", business: { companyName: "Nemo Diving" } });
      await appeler(maVitrine, { user: p });

      const res = await appeler(resoudreSlug, { params: { slug: "  NEMO-Diving " } });
      expect(res.body.id).toBe(String(p._id));
    });

    it("rend 404 sur un slug inconnu — jamais un partenaire au hasard", async () => {
      await createUser({ role: "partenaire", business: { companyName: "Nemo Diving" } });
      const res = await appeler(resoudreSlug, { params: { slug: "concurrent-inconnu" } });
      expect(res.statusCode).toBe(404);
      expect(res.body.id).toBeUndefined();
    });

    // Un lien court déjà imprimé doit survivre à une fermeture de compte ?
    // Non : un compte fermé n'a plus de vitrine à montrer, et la page mènerait
    // de toute façon à un profil introuvable.
    it("un compte fermé ne se résout plus", async () => {
      const p = await createUser({ role: "partenaire", business: { companyName: "Fermé Bientôt" } });
      await appeler(maVitrine, { user: p });
      await User.updateOne({ _id: p._id }, { $set: { isActive: false } });

      const res = await appeler(resoudreSlug, { params: { slug: "ferme-bientot" } });
      expect(res.statusCode).toBe(404);
    });
  });

  // Un QR code imprimé ne se corrige pas. Le .env de développement vaut
  // localhost:5173, et un bouton de relance en est déjà parti mort une fois
  // (2026-09-10, scripts sortants).
  describe("L'adresse ne peut pas sortir d'un APP_URL local", () => {
    it("refuse localhost et retombe sur le site public", () => {
      for (const url of ["http://localhost:5173", "http://127.0.0.1:3000", "http://[::1]:8080", "http://0.0.0.0:5173", ""]) {
        expect(origineSite({ APP_URL: url }), `APP_URL=${url}`).toBe(SITE_PUBLIC);
      }
    });

    it("respecte un APP_URL public et retire la barre finale", () => {
      expect(origineSite({ APP_URL: "https://vit-auto.com/" })).toBe("https://vit-auto.com");
      expect(origineSite({ APP_URL: "https://preprod.vit-auto.com" })).toBe("https://preprod.vit-auto.com");
    });
  });
});
