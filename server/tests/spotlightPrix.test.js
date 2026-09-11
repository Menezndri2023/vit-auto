import { describe, it, expect, beforeEach } from "vitest";
import { composerVitrine } from "../services/spotlightEngine.js";
import { cacheClear } from "../utils/catalogCache.js";
import Activity from "../models/Activity.js";
import Vehicle from "../models/Vehicle.js";
import { createUser } from "./helpers/fixtures.js";

// Unité du prix renvoyé par la vitrine.
//
// `prix` est TOUJOURS en dollars : c'est l'unité de stockage de la plateforme
// (Vehicle.pricePerDay, Activity.price) et c'est ce qu'attend fmt() côté
// interface, qui convertit vers la devise du visiteur.
//
// `currency`, sur ces mêmes documents, est tout autre chose : la devise
// d'AFFICHAGE épinglée par le partenaire. Les deux étaient appariés dans la
// réponse — `prix` en USD, `devise` recopiée de `currency`. Un baptême de
// plongée à 400 MAD ressortait donc « 40,33 MAD » : le bon nombre, étiqueté
// dans la mauvaise monnaie, soit un prix divisé par dix montré au client.
//
// Le défaut ne se voyait pas à l'écran tant que fmt() était disponible, puisque
// fmt() ignore `devise` et traite le nombre comme des dollars. Il n'attendait
// que le repli d'affichage pour sortir.

const ACTIVITE = {
  activityType: "PLONGEE", title: "Baptême de plongée",
  price: 40.33,                 // 400 MAD convertis
  priceEntered: 400, priceEntryCurrency: "MAD",
  currency: "MAD",              // devise d'AFFICHAGE, pas celle de `price`
  images: ["https://ik.imagekit.io/vitauto/x.jpg"],
  ville: "Fnideq", country: "MA",
  status: "approved", available: true,
};

describe("Vitrine — unité du prix", () => {
  beforeEach(async () => {
    await Promise.all([Activity.deleteMany({}), Vehicle.deleteMany({})]);
    cacheClear?.();
  });

  it("annonce le prix d'une activité en USD, jamais dans la devise d'affichage", async () => {
    const owner = await createUser({ role: "partenaire", country: "MA" });
    await Activity.create({ ...ACTIVITE, owner: owner._id });

    const r = await composerVitrine("loisirs", { pays: "MA" });
    const items = Array.isArray(r) ? r : r?.items || [];
    expect(items.length).toBeGreaterThan(0);

    const item = items[0];
    expect(item.prix).toBe(40.33);
    expect(item.devise, "le montant est en USD : l'étiqueter « MAD » le divise par dix").toBe("USD");
    // La devise épinglée reste disponible, mais sous son propre nom.
    expect(item.deviseAffichage).toBe("MAD");
  });

  it("applique la même règle aux véhicules", async () => {
    const owner = await createUser({ role: "partenaire", country: "MA" });
    await Vehicle.create({
      owner: owner._id, title: "Dacia Logan", marque: "Dacia", modele: "Logan",
      type: "location", pricePerDay: 25.21, pricePerDayEntered: 250,
      priceEntryCurrency: "MAD", currency: "MAD",
      images: ["https://ik.imagekit.io/vitauto/y.jpg"],
      ville: "Casablanca", country: "MA", status: "approved", available: true,
    });

    const r = await composerVitrine("vedette", { pays: "MA" });
    const items = Array.isArray(r) ? r : r?.items || [];
    const item = items.find((x) => x.titre === "Dacia Logan");
    expect(item).toBeTruthy();
    expect(item.prix).toBe(25.21);
    expect(item.devise).toBe("USD");
    expect(item.deviseAffichage).toBe("MAD");
  });

  it("rend le type d'activité lisible, pas la valeur d'énumération", async () => {
    // « PLONGEE » s'affichait tel quel sous le titre, crié et sans accent.
    const owner = await createUser({ role: "partenaire", country: "MA" });
    await Activity.create({ ...ACTIVITE, owner: owner._id });

    const r = await composerVitrine("loisirs", { pays: "MA" });
    const items = Array.isArray(r) ? r : r?.items || [];
    expect(items[0].sousTitre).toBe("Plongée");
    expect(items[0].type, "la valeur brute reste disponible pour le filtrage").toBe("PLONGEE");
  });
});
