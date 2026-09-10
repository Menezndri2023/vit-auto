import { describe, it, expect } from "vitest";
import { estPartenaireAbonne } from "../constants/subscriptionPlans";

// Badge « partenaire abonné ». Il est DÉRIVÉ des champs déjà portés par
// l'annonce plutôt qu'écrit dans `certificationBadge`, qui porte « vérifié » et
// « fondateur » — deux distinctions méritées qu'un abonnement ne doit pas
// écraser.

const demain = () => new Date(Date.now() + 86400000).toISOString();
const hier   = () => new Date(Date.now() - 86400000).toISOString();

describe("Badge partenaire abonné", () => {
  it("s'affiche pour un abonnement en cours", () => {
    expect(estPartenaireAbonne({ ownerPlanRank: 2, ownerPlanUntil: demain() })).toBe(true);
  });

  it("disparaît dès l'expiration, sans tâche de nettoyage", () => {
    // La date est comparée à l'instant de l'affichage, comme le fait le tri du
    // catalogue : rien n'a besoin « d'éteindre » un abonnement échu.
    expect(estPartenaireAbonne({ ownerPlanRank: 3, ownerPlanUntil: hier() })).toBe(false);
  });

  it("ne s'affiche pas pour un compte gratuit", () => {
    expect(estPartenaireAbonne({ ownerPlanRank: 0, ownerPlanUntil: demain() })).toBe(false);
  });

  it("ne s'affiche pas sur une annonce dépourvue de ces champs", () => {
    // Le cas de TOUTES les annonces existantes : ces champs n'ont été ajoutés
    // qu'aujourd'hui et ne sont écrits qu'à l'activation d'un plan. L'absence
    // ne doit jamais valoir présence.
    expect(estPartenaireAbonne({})).toBe(false);
    expect(estPartenaireAbonne(null)).toBe(false);
    expect(estPartenaireAbonne({ ownerPlanRank: 2 })).toBe(false);
  });
});
