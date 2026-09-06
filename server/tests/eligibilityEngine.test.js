import { describe, it, expect } from "vitest";
import { evaluateEligibility } from "../services/eligibilityEngine.js";

const verifiedUser = { phoneVerified: true, emailVerified: false, kycStatus: "EN_ATTENTE" };
const baseVehicle  = { ageMin: 21, permisRequis: true, requiredVerificationLevel: "ACCOUNT_VERIFIED" };

describe("eligibilityEngine.evaluateEligibility", () => {
  it("éligible pour un compte vérifié sur un véhicule sans exigence particulière", () => {
    const result = evaluateEligibility({ user: verifiedUser, vehicle: baseVehicle });
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("refuse un compte non vérifié (Niveau 1) quel que soit le véhicule", () => {
    const result = evaluateEligibility({ user: { phoneVerified: false, emailVerified: false }, vehicle: baseVehicle });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("ACCOUNT_NOT_VERIFIED");
  });

  it("n'exige pas l'identité si le véhicule reste ACCOUNT_VERIFIED et qu'aucune politique ne l'exige (comportement Phase 1 inchangé)", () => {
    const result = evaluateEligibility({ user: verifiedUser, vehicle: baseVehicle, rentalPolicy: null });
    expect(result.requiredVerification.identityDocument).toBe(false);
    expect(result.eligible).toBe(true);
  });

  it("exige l'identité vérifiée pour un véhicule IDENTITY_VERIFIED", () => {
    const vehicle = { ...baseVehicle, requiredVerificationLevel: "IDENTITY_VERIFIED" };
    const notVerified = evaluateEligibility({ user: verifiedUser, vehicle });
    expect(notVerified.eligible).toBe(false);
    expect(notVerified.reasons).toContain("IDENTITY_NOT_VERIFIED");

    const verified = evaluateEligibility({ user: { ...verifiedUser, kycStatus: "VERIFIE" }, vehicle });
    expect(verified.eligible).toBe(true);
  });

  it("exige identité ET permis pour un véhicule RENTAL_VERIFIED (Niveau 3)", () => {
    const vehicle = { ...baseVehicle, requiredVerificationLevel: "RENTAL_VERIFIED" };
    const user = { ...verifiedUser, kycStatus: "VERIFIE" }; // identité OK, permis absent
    const result = evaluateEligibility({ user, vehicle });
    expect(result.eligible).toBe(false);
    expect(result.requiredVerification.identityDocument).toBe(true);
    expect(result.requiredVerification.drivingLicense).toBe(true);
    expect(result.reasons).toContain("LICENSE_NOT_VERIFIED");

    const withLicense = { ...user, driverLicenseOcr: { licenseNumber: "L123", isExpired: false } };
    const ok = evaluateEligibility({ user: withLicense, vehicle });
    expect(ok.eligible).toBe(true);
  });

  it("refuse un permis expiré même si le numéro est présent", () => {
    const vehicle = { ...baseVehicle, requiredVerificationLevel: "RENTAL_VERIFIED" };
    const user = { ...verifiedUser, kycStatus: "VERIFIE", driverLicenseOcr: { licenseNumber: "L123", isExpired: true } };
    const result = evaluateEligibility({ user, vehicle });
    expect(result.reasons).toContain("LICENSE_NOT_VERIFIED");
  });

  it("applique l'âge minimum du véhicule quand la date de naissance du client est connue", () => {
    const vehicle = { ...baseVehicle, ageMin: 25 };
    const tooYoung = { ...verifiedUser, birthDate: new Date(Date.now() - 20 * 365.25 * 86400000) }; // ~20 ans
    const result = evaluateEligibility({ user: tooYoung, vehicle });
    expect(result.reasons).toContain("AGE_BELOW_MINIMUM");

    const oldEnough = { ...verifiedUser, birthDate: new Date(Date.now() - 30 * 365.25 * 86400000) };
    expect(evaluateEligibility({ user: oldEnough, vehicle }).eligible).toBe(true);
  });

  it("ne bloque jamais sur une date de naissance absente", () => {
    const vehicle = { ...baseVehicle, ageMin: 30 };
    const result = evaluateEligibility({ user: verifiedUser, vehicle });
    expect(result.reasons).not.toContain("AGE_BELOW_MINIMUM");
  });

  it("la politique partenaire (rentalPolicy) peut exiger l'identité même sur un véhicule ACCOUNT_VERIFIED", () => {
    const result = evaluateEligibility({
      user: verifiedUser, vehicle: baseVehicle,
      rentalPolicy: { identityDocumentRequired: true },
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("IDENTITY_NOT_VERIFIED");
  });

  it("la politique partenaire peut exiger une ancienneté de permis minimale", () => {
    const vehicle = { ...baseVehicle, requiredVerificationLevel: "RENTAL_VERIFIED" };
    const recentLicense = {
      ...verifiedUser, kycStatus: "VERIFIE",
      driverLicenseOcr: { licenseNumber: "L1", isExpired: false, deliveredDate: new Date(Date.now() - 365 * 86400000) }, // 1 an
    };
    const result = evaluateEligibility({ user: recentLicense, vehicle, rentalPolicy: { minimumLicenseYears: 2 } });
    expect(result.reasons).toContain("LICENSE_TOO_RECENT");
  });

  it("refuse une livraison hors du rayon maximum du partenaire", () => {
    const result = evaluateEligibility({
      user: verifiedUser, vehicle: baseVehicle,
      rentalPolicy: { maxDeliveryRadiusKm: 20 }, deliveryDistanceKm: 35,
    });
    expect(result.reasons).toContain("DELIVERY_OUT_OF_ZONE");
  });

  it("accepte une livraison dans le rayon autorisé", () => {
    const result = evaluateEligibility({
      user: verifiedUser, vehicle: baseVehicle,
      rentalPolicy: { maxDeliveryRadiusKm: 20 }, deliveryDistanceKm: 15,
    });
    expect(result.reasons).not.toContain("DELIVERY_OUT_OF_ZONE");
  });

  // ── Restructuration réservation (2026-09) ──────────────────────────────────
  it("exige identité ET permis pour une location, sans configuration véhicule/politique particulière", () => {
    const vehicle = { permisRequis: true };
    const result = evaluateEligibility({ user: verifiedUser, vehicle, bookingType: "location" });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("IDENTITY_NOT_VERIFIED");
    expect(result.reasons).toContain("LICENSE_NOT_VERIFIED");
  });

  it("satisfait identité/permis d'une location via un document joint à CETTE réservation", () => {
    const vehicle = { permisRequis: true };
    const result = evaluateEligibility({
      user: verifiedUser, vehicle, bookingType: "location",
      providedDocuments: { identity: true, license: true },
    });
    expect(result.eligible).toBe(true);
  });

  it("n'exige aucun permis pour une location avec chauffeur (Vehicle.withDriver)", () => {
    const vehicle = { withDriver: true };
    const result = evaluateEligibility({
      user: verifiedUser, vehicle, bookingType: "location",
      providedDocuments: { identity: true },
    });
    expect(result.eligible).toBe(true);
  });

  it("exige identité ET permis pour un essai, même sur un véhicule avec chauffeur (non pertinent pour un essai)", () => {
    const vehicle = { withDriver: true };
    const result = evaluateEligibility({ user: verifiedUser, vehicle, bookingType: "essai" });
    expect(result.reasons).toContain("IDENTITY_NOT_VERIFIED");
    expect(result.reasons).toContain("LICENSE_NOT_VERIFIED");
  });
});
