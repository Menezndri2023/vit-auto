import { describe, it, expect, beforeEach, afterAll } from "vitest";
import mongoose from "mongoose";
import { composerVitrine, EMPLACEMENTS } from "../services/spotlightEngine.js";
import { cacheClear } from "../utils/catalogCache.js";
import User from "../models/User.js";
import Vehicle from "../models/Vehicle.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";

// ═══════════════════════════════════════════════════════════════════════════
// LES VITRINES LISENT-ELLES PLUS QU'ELLES N'AFFICHENT ?
// ═══════════════════════════════════════════════════════════════════════════
// Le test de volume existant (publicRoutesVolume) mesure le POIDS DE LA
// RÉPONSE. Il n'aurait pas attrapé le défaut réel des vitrines : la réponse
// était petite — six partenaires — mais la LECTURE portait sur cent huit
// documents dont chaque photo de profil, encodée en base64, pèse jusqu'à
// 1,9 Mo. Résultat mesuré en production : 23 secondes sur la page d'accueil.
//
// On mesure donc ici le CÔTÉ LECTURE : quelles projections partent réellement
// vers Mongo, et sur combien de documents. Une assertion de durée serait
// instable et trompeuse — sur une base en mémoire, lire 200 Mo reste rapide.

const requetes = { users: [], vehicles: [] };

// Capture à l'EXÉCUTION de la requête, pas via un hook de schéma : un
// `schema.pre("find")` ajouté après la compilation du modèle n'est jamais
// appelé — vérifié, les compteurs restaient vides et les tests passaient donc
// pour une mauvaise raison. Au moment de `exec()`, la chaîne `.select()/.slice()`
// est complète et la projection réellement envoyée à Mongo est lisible.
const vraiExec = mongoose.Query.prototype.exec;
mongoose.Query.prototype.exec = function (...args) {
  const cible = this.model?.modelName === "User" ? requetes.users
    : this.model?.modelName === "Vehicle" ? requetes.vehicles
    : null;
  if (cible && this.op?.startsWith("find")) {
    cible.push({ filtre: this.getFilter(), projection: this.projection() || {} });
  }
  return vraiExec.apply(this, args);
};
afterAll(() => { mongoose.Query.prototype.exec = vraiExec; });

const PHOTO_LOURDE = `data:image/jpeg;base64,${"A".repeat(200 * 1024)}`;

// Requêtes « de masse » : celles qui ne ciblent pas une liste d'identifiants
// déjà restreinte. Ce sont elles qui doivent rester légères.
const requetesDeMasse = (liste) => liste.filter((r) => !r.filtre?._id?.$in);

describe("Vitrines — coût de lecture", () => {
  beforeEach(() => {
    cacheClear();
    requetes.users = [];
    requetes.vehicles = [];
  });

  it("ne demande JAMAIS la photo de profil sur le vivier de partenaires", async () => {
    // Le défaut exact qui a produit 23 s en production.
    for (let i = 0; i < 30; i++) {
      const u = await createUser({ role: "partenaire", profilePhoto: PHOTO_LOURDE });
      await createVehicleDoc({ owner: u._id, status: "approved", available: true, images: ["a.jpg"] });
    }

    await composerVitrine("partenaires");

    const masse = requetesDeMasse(requetes.users);
    expect(masse.length).toBeGreaterThan(0);
    for (const r of masse) {
      expect(r.projection.profilePhoto, JSON.stringify(r.filtre)).toBeFalsy();
    }
  });

  it("ne lit les photos que pour les partenaires retenus, jamais pour tout le vivier", async () => {
    for (let i = 0; i < 30; i++) {
      const u = await createUser({ role: "partenaire", profilePhoto: PHOTO_LOURDE });
      await createVehicleDoc({ owner: u._id, status: "approved", available: true, images: ["a.jpg"] });
    }

    const v = await composerVitrine("partenaires");
    expect(v.items.length).toBe(EMPLACEMENTS.partenaires.capacite);

    // La seule requête autorisée à demander la photo est celle qui cible les
    // identifiants déjà sélectionnés, et elle ne doit pas en cibler davantage
    // que la capacité de l'emplacement.
    const avecPhoto = requetes.users.filter((r) => r.projection.profilePhoto);
    expect(avecPhoto.length).toBeGreaterThan(0);
    for (const r of avecPhoto) {
      const cibles = r.filtre?._id?.$in;
      expect(Array.isArray(cibles), "la requête photo doit cibler des identifiants précis").toBe(true);
      expect(cibles.length).toBeLessThanOrEqual(EMPLACEMENTS.partenaires.capacite);
    }
  });

  it("ne charge qu'une photo par annonce dans le vivier véhicules", async () => {
    // La carte n'affiche qu'une vignette. Sans découpe, une annonce à dix
    // photos multiplie par dix le volume lu pour rien — et le jour où les
    // images repasseraient en base64, ce serait une panne.
    const owner = await createUser({ role: "partenaire" });
    for (let i = 0; i < 30; i++) {
      await createVehicleDoc({
        owner: owner._id, status: "approved", available: true,
        images: Array.from({ length: 10 }, (_, n) => `photo-${i}-${n}.jpg`),
      });
    }

    await composerVitrine("vedette");

    const masse = requetesDeMasse(requetes.vehicles).filter((r) => r.projection.images !== undefined);
    expect(masse.length).toBeGreaterThan(0);
    for (const r of masse) {
      // `$slice: 1` — jamais le tableau complet.
      expect(r.projection.images, JSON.stringify(r.projection)).toMatchObject({ $slice: 1 });
    }
  });

  it("la réponse d'une vitrine reste légère même avec des annonces très illustrées", async () => {
    const owner = await createUser({ role: "partenaire" });
    for (let i = 0; i < 30; i++) {
      await createVehicleDoc({
        owner: owner._id, status: "approved", available: true,
        images: Array.from({ length: 8 }, () => PHOTO_LOURDE),
      });
    }

    const v = await composerVitrine("vedette");
    const octets = Buffer.byteLength(JSON.stringify(v), "utf8");
    // Une vitrine de huit cartes ne doit jamais approcher le mégaoctet : elle
    // ne porte que des titres, des prix et des URL d'images.
    expect(octets, `${Math.round(octets / 1024)} Ko`).toBeLessThan(1024 * 1024);
  });

  it("le nombre de requêtes ne croît pas avec le nombre de candidats", async () => {
    // Une requête par candidat est le défaut classique de ce genre de moteur.
    // Il doit en falloir autant pour trente partenaires que pour trois.
    const monter = async (n) => {
      for (let i = 0; i < n; i++) {
        const u = await createUser({ role: "partenaire" });
        await createVehicleDoc({ owner: u._id, status: "approved", available: true, images: ["a.jpg"] });
      }
    };

    await monter(3);
    cacheClear(); requetes.users = []; requetes.vehicles = [];
    await composerVitrine("partenaires");
    const petit = requetes.users.length + requetes.vehicles.length;

    await monter(27);
    cacheClear(); requetes.users = []; requetes.vehicles = [];
    await composerVitrine("partenaires");
    const grand = requetes.users.length + requetes.vehicles.length;

    expect(grand, `${petit} requêtes pour 3 partenaires, ${grand} pour 30`).toBe(petit);
  });
});
