import { describe, it, expect } from "vitest";
import { estContestee, avecStatutAffiche } from "./contestation";

describe("Contestation d'une réservation (statut inchangé côté serveur)", () => {
  it("une réservation en attente de validation contestée s'affiche « disputed » ; les autres restent telles quelles", () => {
    const contestee = { status: "waiting_client_validation", clientValidation: { disputedAt: "2026-11-01" } };
    expect(estContestee(contestee)).toBe(true);
    expect(avecStatutAffiche(contestee).status).toBe("disputed");
    expect(contestee.status).toBe("waiting_client_validation"); // jamais modifiée en place

    const enAttente = { status: "waiting_client_validation", clientValidation: { disputedAt: null } };
    expect(estContestee(enAttente)).toBe(false);
    expect(avecStatutAffiche(enAttente)).toBe(enAttente);
    expect(estContestee({ status: "disputed" })).toBe(true);   // réservations anciennes
    expect(avecStatutAffiche({ status: "completed", clientValidation: { disputedAt: "x" } }).status).toBe("completed");
  });
});
