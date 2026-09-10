import { describe, it, expect } from "vitest";
import { anneeDepuisUrl } from "../scripts/syncHorentFromSite.js";

// Millésime lu depuis l'adresse d'une fiche partenaire.
//
// Ce fichier existe à cause d'une donnée FABRIQUÉE qui est partie en
// production. Les adresses du catalogue HO RENT portent la chaîne de requête du
// formulaire de réservation : `?pickup_date=2026-09-13`. La première version
// cherchait une année dans l'URL entière — elle y trouvait celle de la
// RÉSERVATION, et 280 annonces se sont retrouvées annoncées « modèle 2026 » à
// des clients, sur la foi d'une date de prise en charge.
//
// L'erreur n'était pas visible : 2026 est l'année courante, la valeur paraît
// plausible partout. Elle ne se voit qu'en remontant à sa source.

describe("Millésime depuis l'URL d'une fiche", () => {
  it("lit l'année écrite dans le CHEMIN", () => {
    expect(anneeDepuisUrl("https://x.ma/fr/location-volkswagen-touareg-elegance-2024-casablanca")).toBe(2024);
    expect(anneeDepuisUrl("https://x.ma/fr/location-audi-q8-sl-model-2025-casablanca")).toBe(2025);
  });

  it("IGNORE une année qui n'est que dans la chaîne de requête", () => {
    // Le cas exact qui a produit la fausse donnée.
    const u = "https://www.horentcar.com/fr/location-hyundai-grand-i10-casablanca"
      + "?pickup_location=casablanca-agency&pickup_date=2026-09-13%2012%3A00&return_date=2026-09-27";
    expect(anneeDepuisUrl(u), "une date de réservation n'est pas un millésime").toBeNull();
  });

  it("ignore aussi une année placée dans l'ancre", () => {
    expect(anneeDepuisUrl("https://x.ma/fr/location-fiat-500-casablanca#dispo-2026")).toBeNull();
  });

  it("garde l'année du chemin même quand la requête en porte une autre", () => {
    const u = "https://x.ma/fr/location-touareg-2024-casablanca?pickup_date=2026-09-13";
    expect(anneeDepuisUrl(u)).toBe(2024);
  });

  it("rend null sur une adresse sans année, plutôt qu'une valeur plausible", () => {
    expect(anneeDepuisUrl("https://x.ma/fr/location-dacia-logan-casablanca")).toBeNull();
    expect(anneeDepuisUrl("")).toBeNull();
    expect(anneeDepuisUrl(null)).toBeNull();
    expect(anneeDepuisUrl(undefined)).toBeNull();
  });

  it("écarte une année hors de toute plausibilité pour un véhicule", () => {
    expect(anneeDepuisUrl("https://x.ma/fr/location-ford-t-1908-casablanca")).toBeNull();
    expect(anneeDepuisUrl("https://x.ma/fr/location-concept-2099-casablanca")).toBeNull();
  });
});
