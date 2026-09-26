import { describe, it, expect } from "vitest";
import { prixParPersonne, palierApplique } from "../services/tarifGroupe.js";

// ── Tarifs de groupe dégressifs (2026-09-26) ───────────────────────────────
//
// Premier outil payant du secteur loisirs, ouvert le 2026-09-10 : créneaux,
// capacité et report météo existaient déjà et sont GRATUITS. Ce qui manquait,
// c'est le levier commercial — les groupes font le gros du chiffre, et le
// partenaire n'avait qu'un prix par personne, identique pour deux plongeurs
// comme pour quinze.
//
// Fonctions pures : aucune base, le calcul se vérifie à la lecture.
const activite = (tarifsGroupe = [], extra = {}) => ({
  price: 100, priceUnit: "per_person", tarifsGroupe, ...extra,
});

describe("tarifGroupe — prix par personne", () => {
  it("sans palier atteint, c'est le prix normal", () => {
    const a = activite([{ aPartirDe: 5, prixParPersonne: 80 }]);
    expect(prixParPersonne(a, 1)).toBe(100);
    expect(prixParPersonne(a, 4)).toBe(100);
    expect(prixParPersonne(a, 5)).toBe(80);
  });

  it("retient le palier le PLUS ÉLEVÉ qui reste atteint, quel que soit l'ordre de saisie", () => {
    // Le partenaire saisit dans l'ordre qui lui vient ; un tri implicite
    // serait une règle invisible de plus.
    const a = activite([
      { aPartirDe: 10, prixParPersonne: 60 },
      { aPartirDe: 5,  prixParPersonne: 80 },
    ]);
    expect(prixParPersonne(a, 5)).toBe(80);
    expect(prixParPersonne(a, 9)).toBe(80);
    expect(prixParPersonne(a, 12)).toBe(60);
  });

  it("ignore un palier PLUS CHER que le tarif normal", () => {
    // Un « tarif de groupe » au-dessus du prix unitaire est une erreur de
    // saisie, jamais une intention : l'appliquer ferait payer un groupe plus
    // cher qu'une somme d'individus.
    const a = activite([{ aPartirDe: 5, prixParPersonne: 150 }]);
    expect(prixParPersonne(a, 10)).toBe(100);
    expect(palierApplique(a, 10)).toBeNull();
  });

  it("ne s'applique pas à un forfait de séance", () => {
    // « per_session » ne dépend déjà pas du nombre de participants.
    const a = activite([{ aPartirDe: 2, prixParPersonne: 10 }], { priceUnit: "per_session" });
    expect(prixParPersonne(a, 15)).toBe(100);
  });

  it("annonce le palier appliqué et l'économie par personne", () => {
    const a = activite([{ aPartirDe: 8, prixParPersonne: 70 }]);
    expect(palierApplique(a, 3)).toBeNull();
    expect(palierApplique(a, 8)).toEqual({ aPartirDe: 8, prixParPersonne: 70, economieParPersonne: 30 });
  });

  it("supporte une activité sans paliers, et des paliers mal formés", () => {
    expect(prixParPersonne(activite(), 10)).toBe(100);
    expect(prixParPersonne(activite([{ aPartirDe: "x", prixParPersonne: 10 }]), 10)).toBe(100);
    expect(prixParPersonne(activite([{}]), 10)).toBe(100);
    expect(prixParPersonne(undefined, 3)).toBe(0);
  });
});
