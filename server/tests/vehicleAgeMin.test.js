import { describe, it, expect } from "vitest";
import Vehicle from "../models/Vehicle.js";
import { createUser, createVehicleDoc } from "./helpers/fixtures.js";

// Âge minimum du conducteur.
//
// Rien ne bornait ce champ. Un import en masse a laissé 11 annonces annonçant
// « 16 ans » — sous l'âge légal de conduire de tous les marchés desservis — et
// l'une d'elles était réservable en production. Ce n'est pas cosmétique :
// eligibilityEngine compare l'âge du client à CE champ, si bien qu'un client de
// 16 ans passait le contrôle pour un véhicule qu'il ne peut pas conduire.
//
// La borne haute n'est pas de la symétrie gratuite : une faute de frappe
// (« 233 » pour « 23 ») rendrait l'annonce inréservable par tout le monde, sans
// message d'erreur et sans que le partenaire comprenne pourquoi son téléphone
// ne sonne plus.

describe("Vehicle.ageMin — bornes", () => {
  it("refuse un âge inférieur à l'âge légal de conduire", async () => {
    const owner = await createUser({ role: "partenaire" });
    for (const age of [16, 0, 17, -5]) {
      await expect(
        createVehicleDoc({ owner: owner._id, ageMin: age }),
        `ageMin=${age} devrait être refusé`
      ).rejects.toThrow();
    }
  });

  it("refuse un âge aberrant vers le haut", async () => {
    const owner = await createUser({ role: "partenaire" });
    await expect(createVehicleDoc({ owner: owner._id, ageMin: 233 })).rejects.toThrow();
  });

  it("accepte les âges réellement pratiqués", async () => {
    const owner = await createUser({ role: "partenaire" });
    for (const age of [18, 21, 23, 25]) {
      const v = await createVehicleDoc({ owner: owner._id, ageMin: age });
      expect(v.ageMin).toBe(age);
    }
  });

  it("garde 21 ans par défaut quand le partenaire ne dit rien", async () => {
    const owner = await createUser({ role: "partenaire" });
    const v = await createVehicleDoc({ owner: owner._id });
    expect(v.ageMin).toBe(21);
  });

  it("refuse aussi une mise à jour qui descendrait sous la borne", async () => {
    // Le champ est modifiable par le partenaire après publication : borner la
    // seule création laisserait la porte ouverte par la modification.
    const owner = await createUser({ role: "partenaire" });
    const v = await createVehicleDoc({ owner: owner._id, ageMin: 23 });
    await expect(
      Vehicle.updateOne({ _id: v._id }, { $set: { ageMin: 16 } }, { runValidators: true })
    ).rejects.toThrow();
  });
});
